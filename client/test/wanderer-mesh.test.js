const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

test('builds one bounded low-poly mesh with robe, hood, face, and scarf', () => {
    const root = path.join(__dirname, '..', 'src');
    const { Mesh, WandererMesh } = runInNewContext(
        readFileSync(path.join(root, 'engine', 'components', 'renderer', 'Mesh.js'), 'utf8') +
        readFileSync(path.join(root, 'game', 'WandererMesh.js'), 'utf8') +
        '\n({ Mesh, WandererMesh });');
    const mesh = WandererMesh.build();
    assert.ok(mesh instanceof Mesh);
    assert.ok(mesh.vertices.length / 9 < 150);
    assert.equal(mesh.vertices.length, mesh.normals.length);
    assert.equal(mesh.uv.length, mesh.vertices.length / 3 * 2);
    assert.ok(mesh.vertices.every(Number.isFinite));
    assert.ok(mesh.normals.every(Number.isFinite));
    for (let i = 0; i < mesh.normals.length; i += 3)
        assert.ok(Math.abs(Math.hypot(...mesh.normals.slice(i, i + 3)) - 1) < 1e-6);
    for (let i = 0; i < mesh.vertices.length; i += 3)
        assert.ok(Math.hypot(...[0, 1, 2].map(axis => mesh.vertices[i + axis] -
            mesh.bounds.center[axis])) <= mesh.bounds.radius);
    assert.ok(mesh.uv.includes(0));
    assert.ok(mesh.uv.includes(0.5));
    assert.ok(mesh.uv.includes(1));
});
