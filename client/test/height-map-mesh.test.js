const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

const root = path.join(__dirname, '..', 'src', 'engine', 'components');
const HeightMapMesh = runInNewContext(
    readFileSync(path.join(root, 'renderer', 'Mesh.js'), 'utf8') +
    readFileSync(path.join(root, 'terrain', 'HeightMapMesh.js'), 'utf8') + '\nHeightMapMesh;'
);

function chunkFixture(x = 0, z = 0) {
    return {
        x, z,
        heightMap: Array.from({ length: 35 }, (_, i) =>
            Array.from({ length: 35 }, (_, j) => 2 * (i - 1) + 4 * (j - 1))),
        biomeWeights: Array.from({ length: 33 }, () => Array.from({ length: 33 }, () => [1, 0, 0, 0]))
    };
}

test('constructs the expected mesh directly from received heights and biome weights', () => {
    const mesh = HeightMapMesh.build(chunkFixture(), 64, 2);
    assert.equal(mesh.vertices.length, 33 * 33 * 3);
    assert.equal(mesh.normals.length, mesh.vertices.length);
    assert.equal(mesh.uv.length, 33 * 33 * 2);
    assert.equal(mesh.biomes.length, 33 * 33 * 4);
    assert.equal(mesh.indices.length, 32 * 32 * 6);
    const firstTriangle = Array.from(mesh.indices.slice(0, 3))
        .flatMap(index => Array.from(mesh.vertices.slice(index * 3, index * 3 + 3)));
    assert.deepEqual(firstTriangle, [2, 2, 0, 0, 0, 0, 0, 4, 2]);
    assert.ok(Array.from(mesh.indices).every(index => index < 33 * 33));
    const normal = [-1, 1, -2].map(value => value / Math.sqrt(6));
    for (let i = 0; i < mesh.normals.length; i++)
        assert.ok(Math.abs(mesh.normals[i] - normal[i % 3]) < 1e-6);
    assert.deepEqual(Array.from(mesh.biomes.slice(0, 4)), [1, 0, 0, 0]);
});

test('neighboring chunks share identical border heights and smooth normals from the halo', () => {
    const sample = (x, z) => Math.sin(x * 0.08) * 8 + Math.cos(z * 0.06) * 5;
    const build = (x, z) => {
        const chunk = chunkFixture(x, z);
        chunk.heightMap = Array.from({ length: 35 }, (_, i) =>
            Array.from({ length: 35 }, (_, j) => sample(x * 64 + (i - 1) * 2, z * 64 + (j - 1) * 2)));
        return HeightMapMesh.build(chunk, 64, 2);
    };
    const center = build(0, 0);
    for (const [x, z] of [[1, 0], [0, 1]]) {
        const neighbor = build(x, z);
        for (let index = 0; index < 33; index++) {
            const a = (x ? 32 * 33 + index : index * 33 + 32) * 3;
            const b = (x ? index : index * 33) * 3;
            assert.equal(center.vertices[a + 1], neighbor.vertices[b + 1]);
            assert.deepEqual(center.normals.slice(a, a + 3), neighbor.normals.slice(b, b + 3));
        }
    }
});

test('rejects malformed snapshots before mesh construction', () => {
    const chunks = [];
    for (let x = -6; x <= 6; x++)
        for (let z = -6; z <= 6; z++)
            chunks.push(chunkFixture(x, z));
    const world = { command: 'world', chunkSize: 64, step: 2, radius: 6, chunks };
    HeightMapMesh.validateWorld(world);
    for (const change of [
        copy => { copy.step = 0; },
        copy => { copy.chunks.pop(); },
        copy => { copy.chunks[0].x = 7; },
        copy => { copy.chunks[0] = copy.chunks[1]; },
        copy => { copy.chunks[0].heightMap[0][0] = NaN; },
        copy => { copy.chunks[0].heightMap.pop(); },
        copy => { copy.chunks[0].biomeWeights[0][0] = [0, 0, 0, 0]; },
        copy => { copy.chunks[0].biomeWeights[0][0] = [-1, 1, 1, 0]; },
        copy => { copy.chunks[0].stones = [{ seed: -1, position: [1, 0, 1] }]; },
        copy => { copy.chunks[0].stones = [{ seed: 1, position: [64, 0, 1] }]; },
        copy => { copy.chunks[0].stones = [{ seed: 1, position: [1, NaN, 1] }]; },
        copy => { copy.chunks[0].stones = [{ seed: 1, type: 'other', position: [1, 0, 1] }]; },
        copy => { copy.chunks[0].stones = [{ seed: 1, size: 41, position: [1, 0, 1] }]; },
        copy => { copy.chunks[0].stones = [{ seed: 1, size: NaN, position: [1, 0, 1] }]; },
        copy => { copy.chunks[0].trees = [{ seed: -1, size: 6, position: [1, 0, 1] }]; },
        copy => { copy.chunks[0].trees = [{ seed: 1, size: 10, position: [1, 0, 1] }]; },
        copy => { copy.chunks[0].trees = [{ seed: 1, size: 6, position: [64, 0, 1] }]; },
        copy => { copy.chunks[0].trees = [{ seed: 1, size: 6, position: [1, NaN, 1] }]; },
        copy => { copy.chunks[0].trees = Array(65).fill({ seed: 1, size: 6, position: [1, 0, 1] }); }
    ]) {
        const copy = JSON.parse(JSON.stringify(world));
        change(copy);
        assert.throws(() => HeightMapMesh.validateWorld(copy));
    }
});
