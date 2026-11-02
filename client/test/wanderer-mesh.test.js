const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

test('builds a smooth flared robe, hollow pointed hood, trimmed scarf and pointed legs without arms or boots', () => {
    const root = path.join(__dirname, '..', 'src');
    const { Mesh, WandererMesh } = runInNewContext(
        readFileSync(path.join(root, 'engine', 'components', 'renderer', 'Mesh.js'), 'utf8') +
        readFileSync(path.join(root, 'game', 'WandererMesh.js'), 'utf8') +
        '\n({ Mesh, WandererMesh });');
    const mesh = WandererMesh.build();
    assert.ok(mesh instanceof Mesh);
    assert.ok(mesh.vertices.length / 9 < 5000);
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
    assert.ok(mesh.uv.includes(2));
    assert.ok(mesh.uv.includes(3));
    const cloth = [], shoulders = [], cavity = [], hood = [], scarf = [], collarTrim = [], legs = [[], []];
    const sharedNormals = new Map();
    let smoothEdges = 0;
    for (let i = 0; i < mesh.vertices.length / 3; i++) {
        const point = Array.from(mesh.vertices.slice(i * 3, i * 3 + 3));
        const part = mesh.uv[i * 2];
        if (part === 1)
            cloth.push(point);
        if (part === 0 && point[1] > 2.66)
            shoulders.push(point);
        if (part === 0.5)
            cavity.push(point);
        if (part === 2 || part === 3)
            legs[part - 2].push(point);
        if (part === 4)
            hood.push(point);
        if (part === 7 || part === 8)
            scarf.push(point);
        if (part === 9)
            collarTrim.push(point);
        assert.ok(Math.abs(point[0]) <= 1.15, 'no protruding arms');
        const group = part === 0 || part === 1 ? 'robe' : part === 4 || part === 5 ? 'hood' :
            part === 7 || part === 8 ? 'scarf' : part === 6 || part === 9 ? 'collar' : part;
        const key = `${group}:${point.map(value => Math.round(value * 1e5) / 1e5).join(',')}`;
        const normal = Array.from(mesh.normals.slice(i * 3, i * 3 + 3));
        const previous = sharedNormals.get(key);
        if (previous) {
            const dot = normal.reduce((sum, value, axis) => sum + value * previous[axis], 0);
            assert.ok(Math.abs(dot) > 0.99999, 'shared vertices have smooth normals on both sides');
            smoothEdges++;
        }
        sharedNormals.set(key, normal);
    }
    assert.ok(Math.min(...cloth.map(point => point[1])) < 0.09, 'cloak reaches ground level');
    assert.ok(cavity.length > 0);
    assert.ok(Math.max(...cloth.map(point => Math.abs(point[0]))) >
        3 * Math.max(...shoulders.map(point => Math.abs(point[0]))), 'robe flares from narrow shoulders');
    assert.ok(smoothEdges > 1000, 'smooth shading is shared across triangles and trim');
    assert.ok(Math.abs(Math.min(...hood.map(point => point[2])) + 1.44) < 1e-6,
        'hood depth is reduced by ten percent');
    assert.ok(Math.abs(Math.max(...hood.map(point => point[1])) - 3.7) < 1e-6,
        'hood height is reduced around its neck attachment');
    const hoodTip = hood.filter(point => point[2] < -1.43);
    assert.ok(hoodTip.length > 0 && hoodTip.every(point => Math.abs(point[0] - 0.108) < 1e-6 &&
        Math.abs(point[1] - 3.25) < 1e-6), 'hood tip folds slightly down and sideways to a single point');
    assert.ok(hood.some(point => point[2] < -0.45 && point[2] > -1.26 && point[1] > 3.61),
        'hood retains a raised crown before the drooping tip');
    assert.equal(collarTrim.length / 3, 32 * 2 * 4, 'both neck edges have double-sided gold trim');
    assert.ok(collarTrim.every(point => point[1] <= 2.4274 + 1e-6 || point[1] >= 2.6926 - 1e-6),
        'gold is confined to narrow collar edges');
    assert.ok(Math.min(...scarf.map(point => point[2])) < -3.57);
    const scarfRoot = scarf.filter(point => point[2] > -0.081);
    assert.ok(scarfRoot.length > 0);
    assert.ok(scarfRoot.every(point => Math.abs(point[0] - 0.36) < 1e-6),
        'scarf is anchored on the alchemist right side');
    const rootHeights = scarfRoot.map(point => point[1]);
    const collarHeights = [...new Set(collarTrim.map(point => point[1]))].sort((a, b) => a - b);
    const scarfHeights = [...new Set(rootHeights)].sort((a, b) => a - b);
    assert.deepEqual(collarHeights, scarfHeights, 'collar width and gold bands exactly match the scarf root');
    assert.ok(Math.abs(collarHeights.at(-1) - collarHeights[0] - 0.34) < 1e-6);
    assert.ok(Math.abs((Math.min(...rootHeights) + Math.max(...rootHeights)) / 2 - 2.56) < 1e-6,
        'attachment is lowered to the collar rather than floating above the neck');
    assert.ok(new Set(scarf.map(point => point[2])).size >= 33, 'scarf is subdivided for smooth waves');
    assert.ok(mesh.uv.includes(5) && mesh.uv.includes(6) && mesh.uv.includes(8), 'hood trim, collar and scarf trim');
    assert.ok(Math.max(...cavity.map(point => point[2])) - Math.min(...cavity.map(point => point[2])) > 0.54,
        'hood has a recessed cavity rather than a flat face panel');
    for (const [index, points] of legs.entries()) {
        const tips = points.filter(point => point[1] < 0.01);
        assert.ok(tips.length > 0);
        assert.ok(tips.every(point => Math.abs(point[0] - (index === 0 ? -0.25 : 0.25)) < 1e-6 &&
            Math.abs(point[2] - 0.04) < 1e-6), 'each leg ends in a single point, not a boot');
    }
    const frontHem = cloth.filter(point => point[2] > 1 && point[1] < 0.35);
    assert.ok(frontHem.length > 0);
    assert.ok(frontHem.every(point => Math.abs(point[0]) > 0.2), 'front hem has an open slit');
    const seen = new Set();
    let outwardHoodFaces = 0;
    for (let i = 0; i < mesh.vertices.length / 3; i += 3) {
        if (mesh.uv[i * 2] !== 4)
            continue;
        const points = [0, 1, 2].map(corner =>
            Array.from(mesh.vertices.slice((i + corner) * 3, (i + corner + 1) * 3)));
        if (points.some(point => point[2] > 0.253))
            continue;
        const key = points.map(point => point.join(',')).sort().join(';');
        if (seen.has(key))
            continue;
        seen.add(key);
        const u = points[1].map((value, axis) => value - points[0][axis]);
        const v = points[2].map((value, axis) => value - points[0][axis]);
        const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2]];
        const center = [0, 1, 2].map(axis => points.reduce((sum, point) => sum + point[axis], 0) / 3);
        const fraction = (0.252 - center[2]) / 1.692;
        const fold = Math.pow(Math.max(0, (fraction - 0.45) / 0.55), 2);
        const centerY = 2.8 + (3.16 + 0.38 * fraction - 0.24 * fold - 2.8) * 0.9;
        assert.ok(normal[0] * (center[0] - 0.108 * fold) + normal[1] * (center[1] - centerY) > 0,
            'hood exterior and tip use consistent outward triangle winding');
        outwardHoodFaces++;
    }
    assert.ok(outwardHoodFaces > 300);
    const hoodRim = [];
    for (let i = 0; i < mesh.vertices.length / 3; i++)
        if (mesh.uv[i * 2] === 5)
            hoodRim.push(mesh.vertices[i * 3 + 2]);
    assert.ok(new Set(hoodRim).size >= 3, 'hood opening has a rounded volumetric lip');
    let collarTop = -Infinity, lipBottom = Infinity;
    for (let i = 0; i < mesh.vertices.length / 3; i++) {
        if (mesh.uv[i * 2] === 6 || mesh.uv[i * 2] === 9)
            collarTop = Math.max(collarTop, mesh.vertices[i * 3 + 1]);
        if (mesh.uv[i * 2] === 5 && mesh.vertices[i * 3 + 2] > 0.477)
            lipBottom = Math.min(lipBottom, mesh.vertices[i * 3 + 1]);
    }
    assert.ok(collarTop < lipBottom, 'collar must not show through the empty hood opening');
});
