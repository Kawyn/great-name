const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

function load() {
    const root = path.join(__dirname, '..', 'src');
    const files = [
        'chaos\\EventManager\\EventManager.js', 'chaos\\DynamicValue.js', 'chaos\\math\\Matrix4.js',
        'engine\\ActorEvents.js', 'engine\\Actor.js', 'engine\\components\\base\\Component.js',
        'engine\\components\\base\\Transform.js', 'engine\\components\\renderer\\Mesh.js',
        'engine\\components\\renderer\\Renderable.js', 'engine\\components\\terrain\\Stone.js'
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
        '\n({Stone, ErodedStone, MonolithStone, Actor, Transform, Renderable});', {
            Scene: { Instance: scene },
            Renderer: { REGISTER_RENDERABLE: 'register', UNREGISTER_RENDERABLE: 'unregister' },
            toRadians: value => value * Math.PI / 180, console
        });
    return { ...classes, actors, scene };
}

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
