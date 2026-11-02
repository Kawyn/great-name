const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

test('resin lumps share an outward-wound faceted amber mesh and reject unknown resource kinds', () => {
    const root = path.join(__dirname, '..', 'src');
    const { LootDrops } = runInNewContext(
        readFileSync(path.join(root, 'engine', 'components', 'renderer', 'Mesh.js'), 'utf8') +
        readFileSync(path.join(root, 'network', 'LootDrops.js'), 'utf8') +
        '\n({ LootDrops });', { Component: class {} });
    const mesh = LootDrops.resinMesh();
    assert.equal(LootDrops.resinMesh(), mesh);
    assert.equal(mesh.vertices.length, 8 * 9);
    assert.equal(mesh.normals.length, mesh.vertices.length);
    assert.equal(mesh.uv.length, 8 * 6);
    assert.ok(mesh.uv.every(value => value > 0.75));
    for (let index = 0; index < mesh.vertices.length; index += 9) {
        const normal = mesh.normals.slice(index, index + 3);
        assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-6);
        const center = [0, 1, 2].map(axis =>
            (mesh.vertices[index + axis] + mesh.vertices[index + 3 + axis] + mesh.vertices[index + 6 + axis]) / 3 - 0.5);
        assert.ok(center.reduce((sum, value, axis) => sum + value * normal[axis], 0) > 0);
    }
    const drop = { id: 'resource', kind: 'resin', count: 1, position: [1, 0, 0] };
    assert.equal(LootDrops.validate([drop]), true);
    assert.equal(LootDrops.validate([{ ...drop, kind: 'unknown' }]), false);
    assert.equal(LootDrops.validate([{ ...drop, kind: null }]), false);
});
