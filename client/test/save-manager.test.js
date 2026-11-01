const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

const source = file => readFileSync(path.join(__dirname, '..', 'src', ...file.split('\\')), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const storage = () => {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
    };
};

function setup() {
    const events = [];
    const localStorage = storage();
    const sessionStorage = storage();
    let reloads = 0;
    const Scene = { Instance: { actors: [] } };
    const Game = { Instance: { ObjectManager: { actors: [] } } };
    const classes = runInNewContext([
        source('chaos\\EventManager\\EventManager.js'),
        source('chaos\\DynamicValue.js'),
        source('engine\\ActorEvents.js'),
        source('engine\\components\\base\\Component.js'),
        source('engine\\components\\base\\Transform.js'),
        source('engine\\Actor.js'),
        source('engine\\ObjectManager.js'),
        source('engine\\SaveManager.js'),
        `class Lifecycle extends Component {
            onInitialize(actor) { super.onInitialize(actor); events.push([actor.identifier, 'initialize', actor.parent?.identifier ?? null]); }
            onPostInitialize() { events.push([this.actor.identifier, 'post']); }
            onEnable() { events.push([this.actor.identifier, 'enable']); }
            onDisable() { events.push([this.actor.identifier, 'disable']); }
            onDestroy() { events.push([this.actor.identifier, 'destroy']); }
        }
        class ServerMovement extends Component {}
        class RemotePlayers extends Component {}
        class Terrain extends Component {}
        class Unknown extends Component {}
        ({ SaveManager, ObjectManager, Actor, Transform, Lifecycle, ServerMovement, RemotePlayers, Terrain, Unknown });`,
    ].join('\n'), {
        Scene, Game, events, localStorage, sessionStorage,
        location: { reload: () => { reloads++; } },
        toRadians: degrees => degrees * Math.PI / 180,
        m4: {
            translation: (...position) => position,
            xRotate: matrix => matrix, yRotate: matrix => matrix, zRotate: matrix => matrix,
            scale: matrix => matrix, multiply: (a, b) => [...a, ...b],
        },
    });
    const { SaveManager, Actor, Transform, Lifecycle } = classes;
    const manager = new SaveManager();
    const create = (id, prefab = { type: 'local' }) => {
        const actor = new Actor(id, [new Transform(), new Lifecycle()]);
        actor.prefab = prefab;
        return actor;
    };
    manager.registerPrefab('local', create);
    manager.registerComponent('Lifecycle', {
        write: () => ({}), valid: state => Object.keys(state).length === 0, read: () => {},
    });
    const request = snapshot => {
        localStorage.setItem(SaveManager.KEY, JSON.stringify(snapshot));
        sessionStorage.setItem(SaveManager.LOAD_REQUEST, 'true');
    };
    return {
        ...classes, manager, create, request, events, localStorage, sessionStorage, Scene, Game,
        get reloads() { return reloads; },
    };
}

test('round-trips actual 3D Transform DynamicValues and independent local variables', () => {
    const env = setup();
    const actor = env.manager.registerObject(env.create('decoration'));
    env.manager.LocalObjects.initialize();
    const transform = actor.GetCompnentByType(env.Transform);
    transform.position.value = [4, 5, 6];
    transform.rotation.value = [15, 90, -30];
    transform.scale.value = [-2, 0, 3];
    env.manager.variables = { locale: 'pl', settings: { volume: 0.6 }, flags: [true, null] };
    const snapshot = env.manager.snapshot();
    assert.equal(snapshot.location, 'client');
    assert.deepEqual(Object.keys(snapshot).sort(), ['location', 'objects', 'variables', 'version']);
    transform.position.value[0] = 999;
    assert.equal(snapshot.objects[0].components[0].state.position[0], 4, 'snapshot must not retain references');
    env.request(snapshot);
    env.manager.variables = {};
    assert.equal(env.manager.restoreRequested(), true);
    assert.deepEqual(plain(transform.position.value), [4, 5, 6]);
    assert.deepEqual(plain(transform.rotation.value), [15, 90, -30]);
    assert.deepEqual(plain(transform.scale.value), [-2, 0, 3]);
    assert.deepEqual(plain(env.manager.variables), plain(snapshot.variables));
    assert.equal(env.manager.restoreRequested(), false);
});

test('rebuilds prefabs parent-first, removes extras, and restores active lifecycle exactly once', () => {
    const original = setup();
    const parent = original.manager.registerObject(original.create('root'));
    const child = original.manager.registerObject(original.create('leaf'));
    child.parent = parent;
    child.active = false;
    const snapshot = original.manager.snapshot();
    snapshot.objects.reverse();

    const env = setup();
    env.manager.LocalObjects.initialize();
    const extra = env.manager.registerObject(env.create('extra'));
    const world = env.create('world-decoration');
    env.Scene.Instance.actors.push(world);
    env.events.length = 0;
    env.request(snapshot);
    env.manager.restoreRequested();
    assert.equal(env.manager.LocalObjects.getByIdentifier('extra'), undefined);
    const root = env.manager.LocalObjects.getByIdentifier('root');
    const leaf = env.manager.LocalObjects.getByIdentifier('leaf');
    assert.equal(leaf.parent, root);
    assert.equal(leaf.active, false);
    assert.deepEqual(plain(env.events), [
        ['extra', 'disable'], ['extra', 'destroy'],
        ['root', 'initialize', null], ['root', 'post'], ['root', 'enable'],
        ['leaf', 'initialize', 'root'], ['leaf', 'post'],
    ]);
    assert.deepEqual(env.Scene.Instance.actors, [world]);
    assert.equal(extra.parent, null);

    snapshot.objects.find(actor => actor.id === 'root').active = false;
    snapshot.objects.find(actor => actor.id === 'leaf').active = true;
    env.events.length = 0;
    env.request(snapshot);
    env.manager.restoreRequested();
    assert.deepEqual(plain(env.events), [['root', 'disable'], ['leaf', 'enable']]);
    assert.equal(root.active, false);
    assert.equal(leaf.active, true);
    env.events.length = 0;
    env.request(snapshot);
    env.manager.restoreRequested();
    assert.deepEqual(env.events, [], 'unchanged actors must not be initialized or enabled twice');
});

test('saves to localStorage, validates before reload, and consumes only a successful load request', () => {
    const env = setup();
    assert.equal(env.manager.restoreRequested(), false);
    assert.throws(() => env.manager.load(), /No local save/);
    assert.equal(env.reloads, 0);
    env.manager.save();
    assert.equal(env.localStorage.getItem('great-name.save') !== null, true);
    env.manager.load();
    assert.equal(env.reloads, 1);
    assert.equal(env.sessionStorage.getItem('great-name.load-request'), 'true');
    assert.equal(env.manager.restoreRequested(), true);
    assert.equal(env.sessionStorage.getItem('great-name.load-request'), null);
    env.localStorage.setItem(env.SaveManager.KEY, '{invalid');
    assert.throws(() => env.manager.load(), /JSON|Unexpected|property/i);
    assert.equal(env.reloads, 1);
    env.sessionStorage.setItem(env.SaveManager.LOAD_REQUEST, 'true');
    assert.throws(() => env.manager.restoreRequested(), /JSON|Unexpected|property/i);
    assert.equal(env.sessionStorage.getItem(env.SaveManager.LOAD_REQUEST), 'true');
});

test('invalid snapshots are rejected atomically before lifecycle, component or variable changes', () => {
    const env = setup();
    const root = env.manager.registerObject(env.create('root'));
    const child = env.manager.registerObject(env.create('leaf'));
    child.parent = root;
    env.manager.LocalObjects.initialize();
    env.manager.variables = { untouched: true };
    const good = env.manager.snapshot();
    const mutations = [
        data => { data.location = 'forest-clearing'; },
        data => { data.version = 2; },
        data => { data.variables = []; },
        data => { data.scene = []; },
        data => { data.objects.push(data.objects[0]); },
        data => { data.objects[0].parent = 'leaf'; },
        data => { data.objects[0].parent = 'missing'; },
        data => { delete data.objects[0].parent; },
        data => { data.objects[0].active = 1; },
        data => { data.objects[0].prefab.type = 'missing'; },
        data => { data.objects[0].prefab.extra = true; },
        data => { data.objects[0].components.pop(); },
        data => { data.objects[0].components[0].type = 'Unknown'; },
        data => { data.objects[0].components.reverse(); },
        data => { data.objects[0].components[0].state.position = [1, 2]; },
        data => { data.objects[0].components[0].state.rotation = ['1', 2, 3]; },
        data => { data.objects[0].components[0].state.scale = null; },
        data => { data.objects[0].id = 'player_other'; },
        data => { data.objects[0].components[0].type = 'ServerMovement'; },
    ];
    for (const mutate of mutations) {
        const data = plain(good);
        mutate(data);
        env.request(data);
        env.events.length = 0;
        assert.throws(() => env.manager.restoreRequested());
        assert.deepEqual(env.events, []);
        assert.equal(child.parent, root);
        assert.deepEqual(plain(env.manager.variables), { untouched: true });
        assert.deepEqual(plain(root.GetCompnentByType(env.Transform).position.value), [0, 0, 0]);
        assert.equal(env.manager.LocalObjects.actors.length, 2);
    }
});

test('rejects non-serializable values and unsupported component codecs', () => {
    const env = setup();
    const values = [undefined, () => {}, Symbol('value'), 1n, NaN, Infinity, new Date(), [, 1]];
    const cyclic = {};
    cyclic.self = cyclic;
    values.push(cyclic);
    const extraArray = [1];
    extraArray.extra = 2;
    values.push(extraArray);
    for (const value of values) {
        env.manager.variables = { value };
        assert.throws(() => env.manager.snapshot(), /JSON-compatible|plain object|Cyclic|array/);
    }
    env.manager.variables = {};
    assert.throws(() => env.manager.registerComponent('Bad', {}), /codec/);
    assert.throws(() => env.manager.registerPrefab('Bad', null), /prefab/);
    const actor = new env.Actor('unknown', [new env.Unknown()]);
    actor.prefab = { type: 'local' };
    env.manager.registerObject(actor);
    assert.throws(() => env.manager.snapshot(), /No save codec/);
});

test('only dedicated local objects are opted in; authority is rejected regardless of codecs', () => {
    const env = setup();
    for (const id of ['player', 'avatar', 'terrain', 'player_other', 'terrain_chunk', 'AVATAR-test'])
        assert.throws(() => env.manager.registerObject(env.create(id)), /Authoritative actor/);
    for (const type of [env.ServerMovement, env.RemotePlayers, env.Terrain]) {
        assert.throws(() => env.manager.registerComponent(type.name, {
            write: () => ({}), valid: () => true, read() {},
        }), /Authoritative component/);
        assert.throws(() => env.manager.registerObject(new env.Actor('local', [new type()])), /Authoritative component/);
    }
    const world = env.create('world');
    env.Scene.Instance.actors.push(world);
    assert.throws(() => env.manager.registerObject(world), /shared world/);
    env.Game.Instance.ObjectManager = new env.ObjectManager();
    const sharedSave = new env.SaveManager(env.Game.Instance.ObjectManager);
    assert.throws(() => sharedSave.snapshot(), /dedicated/);
    const actor = env.manager.registerObject(env.create('local'));
    assert.throws(() => env.manager.registerObject(env.create('local')), /Duplicate/);
    actor.parent = world;
    assert.throws(() => env.manager.snapshot(), /Parent/);
    actor.parent = null;
    env.Scene.Instance.actors.push(actor);
    assert.throws(() => env.manager.snapshot(), /shared world/);
});

test('local ownership remains saveable and destroy removes only the dedicated local actor', () => {
    const env = setup();
    env.manager.LocalObjects.initialize();
    const actor = env.manager.registerObject(env.create('local'));
    assert.equal(actor.objectManager, env.manager.LocalObjects);
    assert.equal(env.manager.snapshot().objects.length, 1);
    env.manager.save();
    env.manager.load();
    assert.equal(env.manager.restoreRequested(), true);
    assert.equal(actor.objectManager, env.manager.LocalObjects);
    const foreignManager = new env.ObjectManager();
    const foreign = env.create('foreign');
    foreignManager.push(foreign);
    assert.throws(() => env.manager.registerObject(foreign), /another object manager/);
    assert.equal(foreign.objectManager, foreignManager);
    const world = env.create('world');
    env.Scene.Instance.actors.push(world);
    actor.destroy();
    assert.equal(actor.objectManager, null);
    assert.equal(env.manager.LocalObjects.actors.length, 0);
    assert.deepEqual(env.Scene.Instance.actors, [world]);
    assert.equal(foreignManager.actors.length, 1);
    assert.equal(foreignManager.actors[0], foreign);
});

test('rejects missing required prefabs and invalid factory results before removals', () => {
    const env = setup();
    const actor = env.manager.registerObject(env.create('required', { type: 'local', required: true }));
    env.manager.LocalObjects.initialize();
    const snapshot = env.manager.snapshot();
    snapshot.objects = [];
    env.request(snapshot);
    env.events.length = 0;
    assert.throws(() => env.manager.restoreRequested(), /Missing required/);
    assert.equal(env.manager.LocalObjects.getByIdentifier('required'), actor);
    assert.deepEqual(env.events, []);

    const sourceEnv = setup();
    sourceEnv.manager.registerObject(sourceEnv.create('new'));
    const saved = sourceEnv.manager.snapshot();
    saved.objects[0].prefab.type = 'broken';
    env.manager.registerPrefab('broken', () => env.create('wrong', { type: 'broken' }));
    saved.objects.push(env.manager.snapshot().objects[0]);
    env.request(saved);
    assert.throws(() => env.manager.restoreRequested(), /Prefab mismatch/);
    assert.deepEqual(env.events, []);
});

test('generic codecs support custom local state without copying gameplay dependencies', () => {
    const env = setup();
    class LocalCounter { value = 3; }
    const actor = new env.Actor('counter', [new LocalCounter()]);
    actor.prefab = { type: 'counter' };
    env.manager.registerPrefab('counter', id => {
        const fresh = new env.Actor(id, [new LocalCounter()]);
        fresh.prefab = { type: 'counter' };
        return fresh;
    });
    env.manager.registerComponent('LocalCounter', {
        write: component => ({ value: component.value }),
        valid: state => Number.isSafeInteger(state.value),
        read: (component, state) => { component.value = state.value; },
    });
    env.manager.registerObject(actor);
    env.manager.save();
    actor.components[0].value = 90;
    env.manager.load();
    env.manager.restoreRequested();
    assert.equal(actor.components[0].value, 3);
});

test('reverses an existing hierarchy without temporary cycles and preserves pre-initialize state', () => {
    const env = setup();
    const root = env.manager.registerObject(env.create('root'));
    const child = env.manager.registerObject(env.create('leaf'));
    child.parent = root;
    const snapshot = env.manager.snapshot();
    snapshot.objects[0].parent = 'leaf';
    snapshot.objects[1].parent = null;
    snapshot.objects[0].active = false;
    env.request(snapshot);
    env.manager.restoreRequested();
    assert.equal(root.parent, child);
    assert.equal(child.parent, null);
    assert.equal(root.active, false);
    assert.deepEqual(env.events, [], 'no lifecycle calls before manager initialization');
    env.manager.LocalObjects.initialize();
    assert.deepEqual(plain(env.events.filter(event => event[1] === 'enable')), [['leaf', 'enable']]);
});

test('rejects cyclic raw snapshots, codec output errors and authority from prefab factories', () => {
    const env = setup();
    env.manager.registerObject(env.create('root'));
    const snapshot = env.manager.snapshot();
    snapshot.variables.cycle = snapshot;
    assert.throws(() => env.manager.validate(snapshot), /Cyclic/);
    env.manager.registerComponent('Lifecycle', {
        write: () => ({ transient: undefined }), valid: () => true, read() {},
    });
    assert.throws(() => env.manager.snapshot(), /JSON-compatible/);
    env.manager.registerComponent('Lifecycle', {
        write: () => ({ invalid: true }), valid: () => false, read() {},
    });
    assert.throws(() => env.manager.snapshot(), /Invalid component/);

    const fresh = setup();
    const original = setup();
    original.manager.registerObject(original.create('root'));
    const shared = fresh.create('root');
    fresh.Scene.Instance.actors.push(shared);
    fresh.manager.registerPrefab('local', () => shared);
    fresh.request(original.manager.snapshot());
    assert.throws(() => fresh.manager.restoreRequested(), /shared world/);
    assert.equal(fresh.manager.LocalObjects.actors.length, 0);
    assert.deepEqual(fresh.Scene.Instance.actors, [shared]);
});

test('actual Game static singleton constructs SaveManager without a pre-existing Game binding', async () => {
    const { Game, SaveManager } = runInNewContext([
        source('engine\\ObjectManager.js'),
        source('engine\\SaveManager.js'),
        `class LocalizationManager { async load() {} }
        class ResourceManager { async load() {} }`,
        source('engine\\Game.js'),
        '({ Game, SaveManager });',
    ].join('\n'), {
        localStorage: storage(), sessionStorage: storage(), location: { reload() {} },
    });
    const game = Game.Instance;
    assert.ok(game.SaveManager instanceof SaveManager);
    assert.notEqual(game.SaveManager.LocalObjects, game.ObjectManager);
    await game.initialize();
    assert.equal(game.initialized, true);
    assert.equal(game.ObjectManager.initialized, true);
    assert.equal(game.SaveManager.LocalObjects.initialized, true);
    assert.equal(game.SaveManager.snapshot().location, 'client');
    game.SaveManager.save();
    game.SaveManager.load();
    assert.equal(game.SaveManager.restoreRequested(), true);
    const sharedSave = new SaveManager(game.ObjectManager);
    assert.throws(() => sharedSave.snapshot(), /dedicated/);
});
