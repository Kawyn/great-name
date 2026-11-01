import assert from 'node:assert/strict';
import test from 'node:test';
import { generateStones } from '../src/world/stone-generator.js';
import { getHeight } from '../src/world/terrain-generator.js';

test('generates deterministic clustered stones, grounded and owned by one chunk', () => {
    let count = 0;
    for (let x = -8; x < 8; x++) {
        for (let z = -8; z < 8; z++) {
            const origin = { x: x * 64, y: 12, z: z * 64 };
            const stones = generateStones(origin, getHeight);
            assert.deepEqual(stones, generateStones(origin, getHeight));
            assert.ok(stones.length <= 32);
            for (const stone of stones) {
                const [sx, sy, sz] = stone.position;
                assert.ok(sx >= 0 && sx < 64 && sz >= 0 && sz < 64);
                assert.ok(Number.isInteger(stone.seed) && stone.seed >= 0 && stone.seed <= 4294967295);
                const ground = getHeight(origin.x + sx, origin.z + sz) - 12;
                assert.ok(sy <= ground - 0.39 - stone.size * 0.12 &&
                    sy >= ground - stone.size * 0.57 - 0.41);
                assert.ok(['eroded', 'monolith'].includes(stone.type));
                assert.ok(stone.size >= 2 && stone.size <= 40);
                count++;
            }
        }
    }
    assert.ok(count > 0 && count < 20, `unexpected landmark density: ${count}`);
    assert.deepEqual(generateStones({ x: 0, y: 0, z: 0 }, (x, z) => x * 2), [],
        'do not place stones on cliffs');
});

test('different recipient chunk grids and vertical anchors produce identical world stones', () => {
    const worldStones = origin => {
        const result = [];
        for (let x = -9; x <= 9; x++) {
            for (let z = -9; z <= 9; z++) {
                const chunk = { x: origin.x + x * 64, y: origin.y, z: origin.z + z * 64 };
                for (const stone of generateStones(chunk, () => 20)) {
                    const wx = stone.position[0] + chunk.x;
                    const wz = stone.position[2] + chunk.z;
                    if (wx >= -512 && wx < 512 && wz >= -512 && wz < 512)
                        result.push({ seed: stone.seed, type: stone.type, size: stone.size,
                            position: [wx, stone.position[1] + chunk.y, wz] });
                }
            }
        }
        return result.sort((a, b) => a.position[0] - b.position[0] || a.position[2] - b.position[2]);
    };
    const first = worldStones({ x: 0, y: 10, z: 0 });
    assert.ok(first.length > 0);
    const other = worldStones({ x: 8, y: -30, z: 12 });
    assert.equal(other.length, first.length);
    for (let index = 0; index < first.length; index++) {
        assert.equal(other[index].seed, first[index].seed);
        assert.equal(other[index].type, first[index].type);
        assert.equal(other[index].size, first[index].size);
        for (let axis = 0; axis < 3; axis++)
            assert.ok(Math.abs(other[index].position[axis] - first[index].position[axis]) < 1e-9);
    }
    assert.equal(new Set(first.map(stone => stone.position.join(','))).size, first.length);
});

test('flat terrain has more frequent 25-40m landmarks with companions and bounded view density', () => {
    const all = generateStones({ x: -1280, y: 0, z: -1280 }, () => 0, 2560);
    const landmarks = all.filter(stone => stone.size >= 8);
    assert.equal(landmarks.length, 27);
    assert.ok(landmarks.some(s => s.type === 'monolith'));
    assert.ok(landmarks.some(s => s.type === 'eroded'));
    for (const main of landmarks) {
        const companions = all.filter(s => s.size < 8 &&
            Math.hypot(s.position[0] - main.position[0], s.position[2] - main.position[2]) <= main.size + 14);
        const [x, , z] = main.position;
        if (x > 64 && x < 2496 && z > 64 && z < 2496)
            assert.ok(companions.length >= 2);
    }
    let maximum = 0;
    for (let x = 320; x < 2240; x += 16) {
        for (let z = 320; z < 2240; z += 16) {
            const visible = landmarks.filter(s =>
                Math.hypot(s.position[0] - x, s.position[2] - z) <= 360 + s.size);
            maximum = Math.max(maximum, visible.length);
            assert.ok(visible.length <= 4, `too many visible landmarks at ${x},${z}`);
        }
    }
    assert.ok(maximum >= 3 && maximum <= 4);
});
