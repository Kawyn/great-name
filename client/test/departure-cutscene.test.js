const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');
const { createDocument } = require('./helpers/fake-dom');

function setup() {
    let time = 0, closed = 0, blocks = 0;
    const listeners = new Map(), refreshing = new Set(), actors = new Map(), errors = [];
    class Transform {
        position = { value: [0, 0, 0] };
        rotation = { value: [0, 0, 0] };
        front = [0, 0, 1];
        onInitialize() {}
        onPostInitialize() {}
        onEnable() {}
        onDisable() {}
    }
    class Renderable {
        active = true;
        constructor(mesh, material) { this.mesh = mesh; this.material = material; }
        onInitialize() {}
        onPostInitialize() {}
        onEnable() {}
        onDisable() {}
    }
    class CameraController { clearTerrain(position) { position[1] = Math.max(position[1], 0.5); } }
    class ServerMovement {}
    class StoneInscriptions {}
    class MainMenuWindow {}
    class Renderer { target = null; recalculateViewMatrix() {} }
    const actor = (identifier, components) => {
        const result = { identifier,
            GetCompnentByType: Kind => components.find(value => value instanceof Kind),
            GetCompnentsByType: Kind => components.filter(value => value instanceof Kind) };
        actors.set(identifier, result);
        return result;
    };
    const cameraController = new CameraController(), movement = new ServerMovement();
    const inscriptions = new StoneInscriptions(), renderer = new Renderer();
    actor('player', [cameraController, movement, inscriptions]);
    const avatarRenderables = [new Renderable({}, {}), new Renderable({}, {})];
    const avatar = actor('avatar', [new Transform(), ...avatarRenderables]);
    const cameraTransform = new Transform();
    cameraTransform.position.value = [0, 8, -20];
    actor('camera', [cameraTransform, renderer]);
    actor('terrain', [new Transform()]);
    const stoneId = `stone-${'a'.repeat(32)}`;
    const site = { stoneId, position: [0, 3, -18], occupied: true, normal: [0, 0, 1] };
    const state = { revision: 1, terrainOffset: [0, 0, 0], stoneSites: [site] };
    const connection = { world: { revision: 1 }, state, endJourneyView: () => closed++ };
    const menu = { visible: true, cinematic: false,
        beginCinematic() { this.visible = false; this.cinematic = true; },
        show() { this.visible = true; }, endJourney() { this.ended = true; } };
    const document = createDocument('<div id="world-status"></div>');
    const window = {
        GameConnection: connection,
        addEventListener(name, callback) {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name).add(callback);
        },
        removeEventListener: (name, callback) => listeners.get(name)?.delete(callback)
    };
    const root = path.join(__dirname, '..', 'src');
    const api = runInNewContext([
        'chaos\\EventManager\\EventManager.js', 'engine\\components\\base\\Component.js',
        'engine\\Actor.js', 'engine\\components\\renderer\\Mesh.js',
        'engine\\ActionGraph.js', 'game\\Scarf.js', 'game\\DepartureCutscene.js'
    ].map(file => readFileSync(path.join(root, file), 'utf8')).join('\n') +
        '\n({ DepartureCutscene });', {
        window, document, Transform, Renderable, CameraController, ServerMovement, StoneInscriptions, Renderer, MainMenuWindow,
        performance: { now: () => time },
        console: { error: (...args) => errors.push(args.map(value => value?.stack ?? String(value))) },
        GameInterface: { Instance: { WindowManager: { windowByType: () => menu } },
            localize: (element, id) => element.textContent = id },
        Scene: { Instance: {
            GetActorByIdentifier: identifier => actors.get(identifier),
            InputManager: { blockInput: () => blocks++, unblockInput: () => blocks-- },
            TimeManager: { addObjectToRefresh: object => refreshing.add(object),
                removeObjectToRefresh: object => refreshing.delete(object) },
            PushActor: instance => {
                actors.set(instance.identifier, instance);
                instance.onInitialize(); instance.onPostInitialize(); instance.onEnable();
                instance.destroy = () => { instance.onDisable(); actors.delete(instance.identifier); };
            }
        } }
    });
    const graph = new api.DepartureCutscene({ clone: () => ({ clear() {} }) });
    graph.onInitialize(); graph.onPostInitialize(); graph.onEnable();
    const signal = (name, detail) => { for (const listener of listeners.get(name) ?? []) listener({ detail }); };
    const tick = () => {
        time += 100;
        for (const object of [...refreshing])
            object.onRefresh(0.1);
    };
    return { graph, site, stoneId, signal, tick, menu, document, actors, errors, avatar, avatarRenderables, cameraController,
        movement, inscriptions, renderer, connection,
        blocks: () => blocks, closed: () => closed };
}

test('departure graph plays its whole ordered scene, buffers server completion and restores menu without reviving the avatar', () => {
    const ui = setup();
    ui.tick();
    assert.equal(ui.graph.actionIndex, 0);
    ui.signal('journeystarted', { stoneId: ui.stoneId, direction: [0, 0, 1], speed: 13 });
    const stages = new Set();
    for (let frame = 0; frame < 360 && ui.graph.status !== 'completed'; frame++) {
        if (frame === 195) {
            ui.site.scarf = [0, 0.2, -15.5];
            ui.signal('journeyended', { stoneId: ui.stoneId });
        }
        ui.tick();
        stages.add(ui.graph.actionIndex);
    }
    assert.equal(ui.graph.status, 'completed', JSON.stringify(ui.errors));
    for (const stage of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        assert.ok(stages.has(stage), `missing action ${stage}`);
    assert.equal(ui.closed(), 1);
    assert.equal(ui.menu.ended, true);
    assert.equal(ui.menu.visible, true);
    assert.equal(ui.blocks(), 0);
    assert.equal(ui.cameraController.cinematic, false);
    assert.equal(ui.movement.cinematic, false);
    assert.equal(ui.renderer.target, null);
    assert.equal(ui.actors.has('departing-scarf'), false);
    assert.equal(ui.inscriptions.hiddenScarf, null);
    assert.ok(ui.avatarRenderables.every(value => !value.active));
    assert.equal(ui.errors.length, 0);
});

test('connection loss cancels a cinematic, releases its controls and re-arms the first event action for a new alchemist', () => {
    const ui = setup();
    ui.signal('journeystarted', { stoneId: ui.stoneId, direction: [0, 0, 1], speed: 13 });
    ui.tick(); ui.tick();
    assert.equal(ui.blocks(), 1);
    ui.connection.state = null;
    ui.tick();
    assert.equal(ui.graph.status, 'running', 'terrain update gaps pause the shot instead of failing');
    ui.signal('worldcleared');
    assert.equal(ui.graph.actionIndex, 0);
    assert.equal(ui.graph.status, 'running');
    assert.equal(ui.blocks(), 0);
    assert.equal(ui.cameraController.cinematic, false);
    assert.equal(ui.menu.visible, true);
    assert.equal(ui.closed(), 0);
    assert.equal(ui.errors.length, 0);
});

test('camera flies around the player to a predicted interception point and keeps its world-space aim after the player passes', () => {
    const ui = setup();
    ui.signal('journeystarted', { stoneId: ui.stoneId, direction: [0, 0, 1], speed: 17.55 });
    ui.tick();
    const context = ui.graph.context;
    const start = [...context.cameraTransform.position.value];
    assert.deepEqual(start, [0, 8, -20], 'taking camera ownership must not snap its position');
    let sideways = 0;
    for (let frame = 0; frame < 42; frame++) {
        ui.site.position[2] -= 1.755;
        ui.tick();
        sideways = Math.max(sideways, Math.abs(context.cameraTransform.position.value[0]));
    }
    assert.ok(sideways > 10, 'the camera must take an arc, not a straight chord through the player');
    assert.equal(ui.graph.actionIndex, 2);
    const reference = context.reference();
    const position = context.cameraTransform.position.value.map((v, i) => v - reference[i]);
    const target = context.lookTarget.position.value.map((v, i) => v - reference[i]);
    assert.ok(Math.abs(position[2] - (18 + 17.55 * 4 + 7)) < 1e-8);
    for (let frame = 0; frame < 50; frame++) {
        ui.site.position[2] -= 1.755;
        ui.tick();
        const origin = context.reference();
        for (let axis = 0; axis < 3; axis++) {
            assert.ok(Math.abs(context.cameraTransform.position.value[axis] - origin[axis] - position[axis]) < 1e-8);
            assert.ok(Math.abs(context.lookTarget.position.value[axis] - origin[axis] - target[axis]) < 1e-8,
                'the camera must not pan back to the departing player');
        }
    }
    assert.equal(ui.errors.length, 0);
});

test('scarf ripples during descent, settles after contact and ends exactly on the persistent resting mesh', () => {
    const ui = setup();
    ui.signal('journeystarted', { stoneId: ui.stoneId, direction: [0, 0, 1], speed: 13 });
    ui.site.scarf = [0, 0.2, -15.5];
    ui.signal('journeyended', { stoneId: ui.stoneId });
    for (let frame = 0; frame < 260 && !ui.actors.has('departing-scarf'); frame++)
        ui.tick();
    const scarf = ui.actors.get('departing-scarf');
    assert.ok(scarf);
    const mesh = scarf.components.find(component => component.mesh)?.mesh;
    const flight = scarf.components.find(component => component.rest);
    assert.ok(flight);
    let fluttered = false, landedWhileMoving = false;
    for (let frame = 0; frame < 60 && !flight.context.flightFinished; frame++) {
        ui.tick();
        fluttered ||= mesh.vertices.some((v, i) => Math.abs(v - flight.rest[i]) > 0.05);
        if (flight.elapsed > 4.1 && flight.elapsed < 5)
            landedWhileMoving ||= mesh.vertices.some((v, i) => Math.abs(v - flight.rest[i]) > 0.001);
        assert.ok(mesh.vertices.every(Number.isFinite));
        assert.ok(mesh.normals.every(Number.isFinite));
    }
    assert.ok(fluttered);
    assert.ok(landedWhileMoving, 'landing includes a damped settling phase rather than stopping rigidly');
    assert.deepEqual(Array.from(mesh.vertices), Array.from(flight.rest));
    assert.equal(flight.context.flightFinished, true);
});
