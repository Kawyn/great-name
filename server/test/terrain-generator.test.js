import assert from 'node:assert/strict';
import test from 'node:test';
import { createTerrainGenerator, generateWorld, getHeight } from '../src/world/terrain-generator.js';
import { generateStones } from '../src/world/stone-generator.js';

test('generates only relative render data with matching chunk borders and normals halo', () => {
    const position = { x: 2048, y: getHeight(2048, -4096), z: -4096 };
    const world = generateWorld(position);
    assert.equal(world.chunks.length, 169);
    const center = world.chunks.find(chunk => chunk.x === 0 && chunk.z === 0);
    const adjacent = world.chunks.find(chunk => chunk.x === 1 && chunk.z === 0);
    assert.equal(center.heightMap[1][1], 0);
    for (let z = 0; z < 35; z++) {
        assert.equal(center.heightMap[33][z], adjacent.heightMap[1][z]);
        assert.equal(center.heightMap[32][z], adjacent.heightMap[0][z]);
        assert.equal(center.heightMap[34][z], adjacent.heightMap[2][z]);
    }
    for (let z = 0; z < 33; z++)
        assert.deepEqual(center.biomeWeights[32][z], adjacent.biomeWeights[0][z]);
    for (const chunk of world.chunks) {
        assert.deepEqual(Object.keys(chunk).sort(), ['biomeWeights', 'heightMap', 'stones', 'trees', 'x', 'z']);
        assert.ok(chunk.heightMap.flat().every(Number.isFinite));
        for (const weights of chunk.biomeWeights.flat()) {
            assert.ok(weights.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
            assert.ok(Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 0.001);
        }
    }
    assert.deepEqual(Object.keys(world).sort(), ['chunkSize', 'chunks', 'command', 'radius', 'step']);
    assert.ok(JSON.stringify(world).length < 10 * 1024 * 1024);
    const retained = world.chunks.map(chunk => ({ ...chunk, z: chunk.z - 1 }))
        .filter(chunk => Math.abs(chunk.z) <= 6);
    const update = generateWorld({ ...position, z: position.z + 64 }, retained);
    assert.equal(update.chunks.length, 13);
    assert.ok(update.chunks.every(chunk => chunk.z === 6));
    const edge = retained.find(chunk => chunk.x === 0 && chunk.z === 5);
    const added = update.chunks.find(chunk => chunk.x === 0 && chunk.z === 6);
    for (let x = 0; x < 35; x++)
        assert.equal(edge.heightMap[x][33], added.heightMap[x][1]);
});

test('terrain generators isolate seeds and retain deterministic default height and stone behavior', () => {
    const first = createTerrainGenerator(12);
    const second = createTerrainGenerator(937);
    const original = getHeight(2048, -4096);
    assert.equal(first.getHeight(2048, -4096), original);
    assert.notEqual(second.getHeight(2048, -4096), original);
    assert.equal(first.getHeight(2048, -4096), original);
    assert.equal(getHeight(2048, -4096), original);
    const flat = () => 0;
    const origin = { x: 0, y: 0, z: 0 };
    const defaults = generateStones(origin, flat, 512);
    assert.ok(defaults.length > 0);
    assert.deepEqual(generateStones(origin, flat, 512, 12), defaults);
    assert.notDeepEqual(generateStones(origin, flat, 512, 937), defaults);
    assert.deepEqual(generateStones(origin, flat, 512, 937), generateStones(origin, flat, 512, 937));
});
