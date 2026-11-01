const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

test('builds received chunks incrementally and removes all actors and renderables on replacement', () => {
    const root = path.join(__dirname, '..', 'src');
    const files = [
        ['chaos', 'EventManager', 'EventManager.js'],
        ['chaos', 'EventManager', 'TimeManager.js'],
        ['chaos', 'DynamicValue.js'],
        ['chaos', 'math', 'Matrix4.js'],
        ['engine', 'Scene.js'],
        ['engine', 'Actor.js'],
        ['engine', 'ActorEvents.js'],
        ['engine', 'components', 'base', 'Component.js'],
        ['engine', 'components', 'base', 'Transform.js'],
        ['engine', 'components', 'renderer', 'Renderer.js'],
        ['engine', 'components', 'renderer', 'Renderable.js'],
        ['engine', 'components', 'renderer', 'Mesh.js'],
        ['engine', 'components', 'terrain', 'TerrainPart.js'],
        ['engine', 'components', 'terrain', 'HeightMapMesh.js'],
        ['engine', 'components', 'terrain', 'Stone.js'],
        ['engine', 'components', 'terrain', 'Terrain.js']
    ];
    const source = files.map(parts => readFileSync(path.join(root, ...parts), 'utf8')).join('\n');
    const listeners = new Map();
    let clearedMaterials = 0;
    const material = {
        clone: () => ({
            local: true,
            clear: () => { clearedMaterials++; }
        })
    };
    const { Scene, Actor, Transform, Renderer, Terrain } = runInNewContext(
        source + '\n({Scene, Actor, Transform, Renderer, Terrain});',
        {
            InputManager: class {},
            WebGLRenderingContext: {},
            window: {
                devicePixelRatio: 1,
                addEventListener: (name, callback) => listeners.set(name, callback),
                removeEventListener: (name) => listeners.delete(name),
                GameConnection: { world: null }
            },
            document: { getElementById: () => null },
            toRadians: value => value * Math.PI / 180,
            simpleMaterial: material,
            console
        }
    );
    const canvas = { width: 800, height: 600, clientWidth: 800, clientHeight: 600 };
    const gl = { canvas, enable() {} };
    canvas.getContext = () => gl;
    const renderer = new Renderer(canvas, ['main', 'shadowcasters']);
    const terrain = new Terrain({ material, stoneMaterial: material });
    const cameraActor = new Actor('camera', [new Transform(), renderer]);
    const terrainActor = new Actor('terrain', [new Transform(), terrain]);
    Scene.Instance.actors = [cameraActor, terrainActor];
    Scene.Instance.TimeManager.start = () => {};
    Scene.Instance.Start();

    const chunks = [];
    for (let x = -6; x <= 6; x++) {
        for (let z = -6; z <= 6; z++) {
            chunks.push({
                x, z,
                heightMap: Array.from({ length: 35 }, () => Array(35).fill(0)),
                biomeWeights: Array.from({ length: 33 }, () => Array.from({ length: 33 }, () => [1, 0, 0, 0]))
            });

        }
    }
    const world = { chunkSize: 64, step: 2, radius: 6, revision: 1, chunks };
    listeners.get('worldreceived')({ detail: world });
    terrain.onRefresh();
    assert.equal(Scene.Instance.actors.length, 4);
    assert.equal(renderer.renderables.length, 4);
    assert.ok(Scene.Instance.GetActorByIdentifier('terrain_0x0'));

    const oldParts = Scene.Instance.actors.slice(2);
    terrain.setWorld(world);
    assert.equal(Scene.Instance.actors.length, 2);
    assert.equal(renderer.renderables.length, 0);
    assert.equal(clearedMaterials, 4);
    terrain.onRefresh();
    assert.equal(renderer.renderables.length, 4);
    assert.ok(Scene.Instance.actors.slice(2).every(part => !oldParts.includes(part)));
    terrain.onState({ detail: { revision: world.revision, terrainOffset: [-3, 1, -8] } });
    const transform = terrainActor.GetCompnentByType(Transform);
    assert.deepEqual(Array.from(transform.position.value), [0, 0, 0], 'packets only update the target');
    terrain.onRefresh(1 / 60);
    const blend = 1 - Math.exp(-12 / 60);
    for (let axis = 0; axis < 3; axis++)
        assert.ok(Math.abs(transform.position.value[axis] - [-3, 1, -8][axis] * blend) < 1e-9);
    const first = Array.from(transform.position.value);
    terrain.onState({ detail: { revision: 99, terrainOffset: [1000, 0, 0] } });
    assert.deepEqual(Array.from(transform.position.value), first);
    for (let i = 0; i < 180; i++)
        terrain.onRefresh(1 / 60);
    assert.deepEqual(Array.from(transform.position.value), [-3, 1, -8]);

    const retainedActor = Scene.Instance.GetActorByIdentifier('terrain_0x0');
    const mesh = renderer.renderables.find(entry => entry.actor === retainedActor).mesh;
    const surfaceOrigin = Array.from(mesh.surfaceOrigin);
    const oldPosition = retainedActor.GetCompnentByType(Transform).position.value
        .map((value, index) => value + transform.position.value[index]);
    const releasedBefore = clearedMaterials;
    const next = {
        ...world, revision: 2, baseRevision: 1, chunkShift: [0, 1],
        terrainOffset: [-3, 1, 56],
        chunks: [...world.chunks.filter(chunk => chunk.z > -6).map(chunk => ({ ...chunk, z: chunk.z - 1 })),
            ...world.chunks.filter(chunk => chunk.z === 6)]
    };
    terrain.setWorld(next);
    assert.ok(Scene.Instance.actors.includes(retainedActor));
    assert.equal(renderer.renderables.find(entry => entry.actor === retainedActor).mesh, mesh);
    assert.deepEqual(Array.from(mesh.surfaceOrigin), surfaceOrigin,
        'procedural color coordinates must not move when the window rebases');
    assert.equal(renderer.renderables.length, 156 * 2);
    assert.equal(clearedMaterials - releasedBefore, 13 * 2);
    assert.deepEqual(Array.from(retainedActor.GetCompnentByType(Transform).position.value,
        (value, index) => value + transform.position.value[index]), Array.from(oldPosition));
    for (let i = 0; i < 7; i++)
        terrain.onRefresh();
    assert.equal(renderer.renderables.length, 169 * 2);
    const edgeMesh = renderer.renderables.find(entry =>
        entry.mesh.surfaceOrigin[0] === 0 && entry.mesh.surfaceOrigin[2] === 7 * 64).mesh;
    assert.equal(edgeMesh.surfaceOrigin[2] - mesh.surfaceOrigin[2], 7 * 64);
    assert.equal(new Set(Scene.Instance.actors.map(actor => actor.identifier)).size,
        Scene.Instance.actors.length, 'retained and newly created chunk identifiers must remain unique');

    listeners.get('worldcleared')();
    terrain.onRefresh();
    assert.equal(Scene.Instance.actors.length, 2);
    assert.equal(renderer.renderables.length, 0);
    assert.equal(clearedMaterials, 4 + world.chunks.length * 2 + 13 * 2);
    terrain.setWorld(world);
    terrain.onRefresh();
    const partiallyBuilt = Scene.Instance.actors.slice(2);
    const releasedPartial = clearedMaterials;
    terrain.setWorld(next);
    assert.ok(partiallyBuilt.every(part => Scene.Instance.actors.includes(part)));
    assert.equal(clearedMaterials, releasedPartial);
    for (let i = 0; i < 90; i++)
        terrain.onRefresh();
    assert.equal(renderer.renderables.length, 169 * 2,
        'a delta during construction must keep built chunks and replace the pending queue');
    const stoneWorld = {
        ...world, chunks: world.chunks.map(chunk => ({
            ...chunk, stones: chunk.x === 0 && [0, -6].includes(chunk.z) ?
                [{ seed: 123, position: [20, 0, 20] }] : []
        }))
    };
    terrain.setWorld(stoneWorld);
    for (let i = 0; i < 90; i++)
        terrain.onRefresh();
    assert.equal(renderer.renderables.length, 169 * 2 + 4);
    const retainedStones = Scene.Instance.GetActorByIdentifier('terrain_0x0_stones');
    const stoneMatrix = Array.from(retainedStones.GetCompnentByType(Transform).sceneMatrix);
    terrain.setWorld({
        ...next, chunks: [...stoneWorld.chunks.filter(chunk => chunk.z > -6)
            .map(chunk => ({ ...chunk, z: chunk.z - 1 })),
            ...stoneWorld.chunks.filter(chunk => chunk.z === 6)]
    });
    assert.equal(Scene.Instance.GetActorByIdentifier('terrain_0x0_stones'), retainedStones);
    assert.deepEqual(Array.from(retainedStones.GetCompnentByType(Transform).sceneMatrix), stoneMatrix);
    assert.equal(Scene.Instance.GetActorByIdentifier('terrain_0x-6_stones'), undefined);
    assert.equal(renderer.renderables.length, 156 * 2 + 2);
    terrain.onDisable();
    assert.equal(renderer.renderables.length, 0);
    assert.equal(listeners.size, 0);
});

test('releases terrain GPU buffers without leaving deleted vertex attributes enabled', () => {
    const source = readFileSync(path.join(__dirname, '..', 'src', 'engine', 'components', 'renderer', 'Material.js'), 'utf8');
    const Material = runInNewContext(source + '\nMaterial;');
    const material = new Material('', '');
    const calls = [];
    material.gl = {
        disableVertexAttribArray: location => calls.push(['disable', location]),
        deleteBuffer: buffer => calls.push(['buffer', buffer]),
        deleteProgram: program => calls.push(['program', program])
    };
    material._locations = { a_position: 0, a_biome: 3, a_unused: -1, u_projection: {} };
    material._buffers = { a_position: 'positions', a_biome: 'biomes' };
    material._program = 'terrain-program';
    material.clear();
    assert.deepEqual(calls, [
        ['disable', 0], ['disable', 3],
        ['buffer', 'positions'], ['buffer', 'biomes'], ['program', 'terrain-program']
    ]);
    assert.equal(Object.keys(material._buffers).length, 0);
    assert.equal(material._program, null);
});
