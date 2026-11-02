import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTrees } from '../src/world/tree-generator.js';
import { createTerrainGenerator } from '../src/world/terrain-generator.js';

const flat = () => 10;

test('dead trees form deterministic seeded clusters with grounded chunk-owned positions', () => {
    const origin = { x: -512, y: 7, z: -512 };
    const trees = generateTrees(origin, flat, 1024, 12);
    assert.deepEqual(trees, generateTrees(origin, flat, 1024, 12));
    assert.notDeepEqual(trees, generateTrees(origin, flat, 1024, 13));
    assert.ok(trees.length > 30 && trees.length < 160, 'sparse clusters, not a continuous forest');
    const ids = new Set();
    for (const tree of trees) {
        const key = tree.position.join(':');
        assert.ok(!ids.has(key));
        ids.add(key);
        assert.ok(Number.isInteger(tree.seed) && tree.seed >= 0 && tree.seed <= 4294967295);
        assert.ok(tree.size >= 4 && tree.size <= 9);
        assert.equal(tree.position[1], 2.78);
        assert.ok(tree.position[0] >= 0 && tree.position[0] < 1024);
        assert.ok(tree.position[2] >= 0 && tree.position[2] < 1024);
    }
    const clustered = trees.filter(tree => trees.some(other => other !== tree &&
        Math.hypot(tree.position[0] - other.position[0], tree.position[2] - other.position[2]) < 45));
    assert.ok(clustered.length / trees.length > 0.9);
    assert.deepEqual(generateTrees(origin, x => x * 2, 1024, 12), [], 'steep slopes do not grow trees');
});

test('different recipient chunk lattices and vertical anchors preserve absolute trees without duplicates', () => {
    const { getHeight } = createTerrainGenerator(12);
    const collect = (offset, y) => {
        const result = [];
        for (let x = -512 + offset; x < 512; x += 64)
            for (let z = -512 + offset; z < 512; z += 64) {
                for (const tree of generateTrees({ x, y, z }, getHeight, 64, 12))
                    result.push({ ...tree, position: [tree.position[0] + x, tree.position[1] + y, tree.position[2] + z] });
            }
        return result.filter(tree => tree.position[0] > -400 && tree.position[0] < 400 &&
            tree.position[2] > -400 && tree.position[2] < 400).sort((a, b) => a.seed - b.seed);
    };
    const first = collect(0, 0), second = collect(17, 137);
    assert.ok(first.length > 10);
    assert.equal(first.length, second.length);
    assert.equal(new Set(first.map(tree => tree.position.join(':'))).size, first.length);
    for (let index = 0; index < first.length; index++) {
        assert.equal(first[index].seed, second[index].seed);
        assert.equal(first[index].size, second[index].size);
        for (let axis = 0; axis < 3; axis++)
            assert.ok(Math.abs(first[index].position[axis] - second[index].position[axis]) < 1e-10);
    }
});
