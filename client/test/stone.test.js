const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

function load(window) {
    const root = path.join(__dirname, '..', 'src');
    const files = [
        'chaos\\EventManager\\EventManager.js', 'chaos\\DynamicValue.js', 'chaos\\math\\Matrix4.js',
        'engine\\ActorEvents.js', 'engine\\Actor.js', 'engine\\components\\base\\Component.js',
        'engine\\components\\base\\Transform.js', 'engine\\components\\renderer\\Mesh.js',
        'engine\\components\\renderer\\Renderable.js', 'shared\\StoneGeometry.js', 'engine\\components\\terrain\\Stone.js',
        'engine\\components\\terrain\\DeadTree.js'
    ];
    const actors = [];
    const scene = {
        EventManager: { riseEvent() {} },
        PushActor(actor) {
            actors.push(actor);
            actor.onInitialize();
            actor.onPostInitialize();
            actor.onEnable();
        },
        RemoveActor(actor) {
            actor.onDisable();
            actor.onDestroy();
            actors.splice(actors.indexOf(actor), 1);
        }
    };
    const classes = runInNewContext(files.map(file => readFileSync(path.join(root, file), 'utf8')).join('\n') +
        '\n({Stone, ErodedStone, MonolithStone, DeadTree, Actor, Transform, Renderable});', {
            Scene: { Instance: scene },
            window,
            Renderer: { REGISTER_RENDERABLE: 'register', UNREGISTER_RENDERABLE: 'unregister' },
            toRadians: value => value * Math.PI / 180, console
        });
    return { ...classes, actors, scene };
}

test('occupied stones gain emerald markings without changing neighboring stones or rebuilding geometry', () => {
    const listeners = new Map();
    const window = {
        GameConnection: { state: { stoneSites: [{ stoneId: 'marked', occupied: true }] } },
        addEventListener(name, handler) { listeners.set(name, handler); },
        removeEventListener(name) { listeners.delete(name); }
    };
    const { Stone, Actor, Transform, Renderable, scene, actors } = load(window);
    const material = { clone: () => ({ clear() {} }) };
    const stones = [
        { id: 'marked', seed: 1, size: 25, position: [0, 0, 0] },
        { id: 'plain', seed: 2, size: 25, position: [50, 0, 0] }
    ];
    const baseline = Stone.buildBatch(stones);
    const parent = new Actor('chunk', [new Transform(), new Stone({ stones, material, shadowMaterial: material })]);
    scene.PushActor(parent);
    const renderable = actors[1].GetCompnentByType(Renderable);
    const mesh = renderable.mesh;
    const middle = mesh.stoneRanges[0].end;
    assert.deepEqual(mesh.vertices, baseline.vertices);
    assert.deepEqual(mesh.normals, baseline.normals);
    for (let index = 0; index < middle; index++)
        assert.ok(Math.abs(mesh.uv[index] - baseline.uv[index] - (index % 2 ? 2 : 0)) < 1e-6);
    assert.deepEqual(mesh.uv.slice(middle), baseline.uv.slice(middle));
    renderable.material.isMeshDirty = false;
    listeners.get('networkstate')({ detail: window.GameConnection.state });
    assert.equal(renderable.material.isMeshDirty, false, 'unchanged occupancy does not reupload buffers');
    listeners.get('worldcleared')();
    for (let index = 0; index < mesh.uv.length; index++)
        assert.ok(Math.abs(mesh.uv[index] - baseline.uv[index]) < 1e-6);
    assert.equal(renderable.material.isMeshDirty, true);
    assert.equal(renderable.mesh, mesh);
    scene.RemoveActor(parent);
    assert.equal(listeners.size, 0);
});

test('seed controls Voronoi geometry and color deterministically', () => {
    const { Stone } = load();
    const first = Stone.build(123);
    const same = Stone.build(123);
    const different = Stone.build(456);
    assert.deepEqual(first.vertices, same.vertices);
    assert.deepEqual(first.normals, same.normals);
    assert.deepEqual(first.uv, same.uv);
    assert.notDeepEqual(first.vertices, different.vertices);
    assert.notDeepEqual(first.uv, different.uv);
    assert.equal(first.vertices.length / 9, 720);
    assert.equal(first.normals.length, first.vertices.length);
    assert.equal(first.uv.length, first.vertices.length / 3 * 2);
    for (const seed of [0, 1, 4294967295]) {
        const mesh = Stone.build(seed);
        assert.ok(mesh.vertices.every(Number.isFinite));
        for (let i = 0; i < mesh.normals.length; i += 3) {
            assert.ok(Math.abs(Math.hypot(...mesh.normals.slice(i, i + 3)) - 1) < 1e-6);
            assert.ok(Math.hypot(...[0, 1, 2].map(axis =>
                mesh.vertices[i + axis] - mesh.bounds.center[axis])) <= mesh.bounds.radius + 1e-6);
        }
    }
    for (const seed of [-1, 1.5, NaN, 4294967296])
        assert.throws(() => Stone.build(seed), /Invalid stone/);
});

test('batches stones per chunk and releases both color and shadow resources', () => {
    const { Stone, MonolithStone, Actor, Transform, Renderable, scene, actors } = load();
    let cleared = 0;
    const material = { clone: () => ({ clear: () => cleared++ }) };
    const stones = [{ seed: 123, position: [3, 4, 5] }, { seed: 456, position: [10, 0, 12] }];
    const stone = new Stone({ stones, material, shadowMaterial: material });
    const parent = new Actor('chunk', [new Transform(), stone]);
    scene.PushActor(parent);
    assert.equal(actors.length, 2);
    const renderers = actors[1].GetCompnentsByType(Renderable);
    assert.equal(renderers.length, 2);
    assert.equal(renderers[0].mesh, renderers[1].mesh);
    assert.equal(renderers[0].mesh.vertices.length / 9, 1440);
    const source = Stone.build(123);
    for (let i = 0; i < source.vertices.length; i++)
        assert.ok(Math.abs(renderers[0].mesh.vertices[i] - source.vertices[i] - stones[0].position[i % 3]) < 1e-6);
    assert.equal(actors[1].parent, parent);
    scene.RemoveActor(parent);
    assert.equal(actors.length, 0);
    assert.equal(cleared, 2);
    scene.PushActor(new Actor('single', [
        new Transform(), new MonolithStone({ seed: 1, size: 18, material, shadowMaterial: material })
    ]));
    assert.equal(actors.length, 2);
    assert.deepEqual(actors[1].GetCompnentByType(Renderable).mesh.vertices, MonolithStone.build(1, 18).vertices);
    scene.RemoveActor(actors[0]);
    assert.equal(actors.length, 0);
    scene.PushActor(new Actor('empty', [
        new Transform(), new Stone({ stones: [], material, shadowMaterial: material })
    ]));
    assert.equal(actors.length, 1);
    scene.RemoveActor(actors[0]);
    assert.equal(cleared, 4);
});

test('both Stone subclasses have smooth shared normals, distinct silhouettes and exact landmark heights', () => {
    const { Stone, ErodedStone, MonolithStone } = load();
    assert.ok(ErodedStone.prototype instanceof Stone);
    assert.ok(MonolithStone.prototype instanceof Stone);
    for (const Kind of [ErodedStone, MonolithStone]) {
        for (const size of [2, 25, 40]) {
            const mesh = Kind.build(321, size);
            const ys = mesh.vertices.filter((_, i) => i % 3 === 1);
            assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - size) < 1e-6);
            assert.equal(mesh.vertices.length / 9, size >= 25 ? 2976 : 720);
            if (size >= 25) {
                const bottom = ys.indexOf(Math.min(...ys)) * 3;
                const top = ys.indexOf(Math.max(...ys)) * 3;
                const horizontal = Math.hypot(mesh.vertices[top] - mesh.vertices[bottom],
                    mesh.vertices[top + 2] - mesh.vertices[bottom + 2]);
                assert.ok(horizontal > size * 0.15, 'large stones lean into the landscape');
                for (const axis of [0, 2]) {
                    const coordinates = mesh.vertices.filter((_, i) => i % 3 === axis);
                    assert.ok(Math.max(...coordinates) - Math.min(...coordinates) < size,
                        'landmarks have vertical rather than broad silhouettes');
                }
            }
            const shared = new Map();
            let sharedCount = 0;
            for (let i = 0; i < mesh.vertices.length; i += 3) {
                const key = mesh.vertices.slice(i, i + 3).join(',');
                const normal = mesh.normals.slice(i, i + 3);
                assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-6);
                if (shared.has(key)) {
                    assert.deepEqual(normal, shared.get(key));
                    sharedCount++;
                }
                shared.set(key, normal);
            }
            assert.ok(sharedCount > 1000, 'smooth normals must survive triangle expansion and the longitude seam');
            const top = ys.indexOf(Math.max(...ys)) * 3;
            assert.ok(mesh.normals[top + 1] > 0.8, 'top normals point outward');
        }
    }
    const rounded = ErodedStone.build(321, 12);
    const tall = MonolithStone.build(321, 12);
    assert.notDeepEqual(rounded.vertices, tall.vertices);
    assert.ok(rounded.bounds.radius > tall.bounds.radius);
    for (const stone of [{ seed: 1, size: 41 }, { seed: 1, size: NaN }, { seed: 1, type: 'unknown' }])
        assert.throws(() => Stone.validate({ ...stone, position: [0, 0, 0] }), /Invalid stone/);
    const batch = Stone.buildBatch([
        { seed: 321, type: 'monolith', size: 12, position: [0, 0, 0] },
        { seed: 321, type: 'eroded', size: 12, position: [0, 0, 0] }
    ]);
    assert.deepEqual(batch.vertices.slice(0, tall.vertices.length), tall.vertices);
    assert.deepEqual(batch.vertices.slice(tall.vertices.length), rounded.vertices);
});

test('dead tree meshes have seeded bare branches, valid normals, bounded geometry and shared batch cleanup', () => {
    const { DeadTree, Stone, Actor, Transform, Renderable, scene, actors } = load();
    assert.ok(DeadTree.prototype instanceof Stone);
    for (const seed of [0, 1, 123, 4294967295]) {
        const mesh = DeadTree.build(seed, 7);
        assert.deepEqual(mesh.vertices, DeadTree.build(seed, 7).vertices);
        assert.notDeepEqual(mesh.vertices, DeadTree.build(seed + (seed === 4294967295 ? -1 : 1), 7).vertices);
        assert.ok(mesh.vertices.length / 9 < 550);
        assert.ok(mesh.vertices.every(Number.isFinite));
        assert.equal(mesh.normals.length, mesh.vertices.length);
        assert.equal(mesh.uv.length, mesh.vertices.length / 3 * 2);
        for (let index = 0; index < mesh.normals.length; index += 3)
            assert.ok(Math.abs(Math.hypot(...mesh.normals.slice(index, index + 3)) - 1) < 1e-6);
        for (let segment = 0; segment < mesh.vertices.length; segment += 6 * 27) {
            for (let side = 0; side < 6; side++) {
                const start = segment + side * 27;
                const next = segment + ((side + 1) % 6) * 27;
                assert.deepEqual(mesh.normals.slice(start + 3, start + 6),
                    mesh.normals.slice(next, next + 3), 'adjacent side faces share smooth edge normals');
                assert.deepEqual(mesh.normals.slice(start, start + 3),
                    mesh.normals.slice(start + 6, start + 9), 'normals remain continuous along the taper');
                assert.notDeepEqual(mesh.normals.slice(start, start + 3),
                    mesh.normals.slice(start + 3, start + 6), 'side triangles interpolate instead of flat shading');
            }
        }
        assert.ok(mesh.bounds.radius < 7);
        assert.ok(mesh.vertices.some((value, index) => index % 3 === 1 && value >= 7));
    }
    let cleared = 0;
    const material = { clone: () => ({ clear() { cleared++; } }) };
    const trees = [1, 2].map(seed => ({ seed, size: 6, position: [seed * 4, 0, 0] }));
    const parent = new Actor('grove', [new Transform(), new DeadTree({ trees, material, shadowMaterial: material })]);
    scene.PushActor(parent);
    assert.equal(actors.length, 2, 'one batch actor for an entire grove chunk');
    const renderers = actors[1].GetCompnentsByType(Renderable);
    assert.equal(renderers.length, 2);
    assert.equal(renderers[0].mesh, renderers[1].mesh);
    assert.equal(renderers[0].mesh.vertices.length,
        trees.reduce((sum, tree) => sum + DeadTree.build(tree.seed, tree.size).vertices.length, 0));
    scene.RemoveActor(parent);
    assert.equal(cleared, 2);
    assert.equal(actors.length, 0);
});
