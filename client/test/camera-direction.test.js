const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

const root = path.join(__dirname, '..', 'src');

function setup(yaw = 0) {
    const axes = { mouse_x: { value: 0 }, mouse_y: { value: 0 } };
    const player = { rotation: { value: [0, yaw, 0] } };
    const avatar = { rotation: { value: [0, yaw, 0] } };
    const camera = { rotation: { value: [0, 0, 0] }, position: { value: [0, 0, 0] } };
    const terrain = { position: { value: [0, 0, 0] } };
    const connection = { world: null, state: null };
    const refreshers = new Set(), listeners = new Set();
    let sensitivity = '100';
    const CameraController = runInNewContext(
        readFileSync(path.join(root, 'engine', 'components', 'base', 'Component.js'), 'utf8') +
        readFileSync(path.join(root, 'engine', 'components', 'movement', 'CameraController.js'), 'utf8') +
        '\nCameraController;', {
            window: { GameConnection: connection }, Transform: class {},
            Settings: {
                MOUSE_SENSITIVITY: 'sensitivity', ON_VALUE_CHANGED: 'changed',
                GetValueAsString: () => sensitivity,
                EventManager: {
                    addEventListener: (name, callback) => listeners.add(callback),
                    removeEventListener: (name, callback) => listeners.delete(callback)
                }
            },
            Scene: { Instance: {
                TimeManager: {
                    addObjectToRefresh: object => refreshers.add(object),
                    removeObjectToRefresh: object => refreshers.delete(object)
                },
                InputManager: { GetAxis: name => axes[name] },
                GetActorByIdentifier: name => {
                    const transform = { camera, avatar, terrain }[name];
                    return transform ? { GetCompnentByType: () => transform } : null;
                }
            } }
        });
    const controller = new CameraController();
    controller.onInitialize({ GetCompnentByType: () => player });
    controller.onPostInitialize();
    controller.onEnable();
    const frame = (dt = 1 / 60) => {
        controller.onRefresh(dt);
        axes.mouse_x.value = axes.mouse_y.value = 0;
    };
    const mouse = (x, y, dt = 1 / 60) => {
        axes.mouse_x.value = x; axes.mouse_y.value = y; frame(dt);
    };
    const settle = () => { for (let i = 0; i < 120; i++) frame(); };
    return { controller, player, avatar, camera, terrain, connection, axes, frame, mouse, settle,
        refreshers, listeners, sensitivity: value => { sensitivity = value; } };
}

function distance(camera) {
    return Math.hypot(camera.position.value[0], camera.position.value[1] - 3.3, camera.position.value[2]);
}

function aimAtHead(camera) {
    const pitch = camera.rotation.value[0] * Math.PI / 180;
    const yaw = camera.rotation.value[1] * Math.PI / 180;
    const front = [Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    for (let i = 0; i < 3; i++)
        assert.ok(Math.abs(front[i] - ((i === 1 ? 3.3 : 0) - camera.position.value[i]) / distance(camera)) < 1e-8);
}

test('mouse axes are independent, displacement based and gently resisted instead of snapping', () => {
    const ui = setup();
    ui.mouse(100, 0);
    assert.ok(Math.abs(ui.player.rotation.value[1] + 8) < 1e-9);
    assert.ok(ui.camera.rotation.value[1] < 8 && ui.camera.rotation.value[1] > 7);
    assert.equal(ui.camera.rotation.value[0], 18);
    ui.settle();
    assert.ok(Math.abs(ui.camera.rotation.value[1]) < 0.001);
    ui.mouse(0, 100);
    ui.settle();
    assert.ok(Math.abs(ui.camera.rotation.value[0] - 10) < 0.001);
    assert.ok(Math.abs(ui.camera.rotation.value[1]) < 0.001);
    aimAtHead(ui.camera);
    const slow = setup(), fast = setup();
    slow.mouse(50, -20, 1 / 30); fast.mouse(50, -20, 1 / 120);
    assert.equal(slow.player.rotation.value[1], fast.player.rotation.value[1]);
});

test('minimum angle is 60 degrees from downward vertical, keeps its distance and uses half maximum at zero', () => {
    const ui = setup();
    ui.mouse(0, 10000);
    ui.controller.updateOrbit();
    assert.ok(Math.abs(ui.camera.rotation.value[0] + 30) < 1e-9);
    assert.ok(Math.abs(distance(ui.camera) - 10) < 1e-9);
    aimAtHead(ui.camera);
    ui.mouse(0, -375); // -30 + 375 * 0.08 = 0.
    ui.controller.updateOrbit();
    assert.ok(Math.abs(ui.camera.rotation.value[0]) < 1e-9);
    assert.ok(Math.abs(distance(ui.camera) - 13) < 1e-9);
    ui.mouse(0, -10000);
    ui.controller.updateOrbit();
    assert.ok(Math.abs(ui.camera.rotation.value[0] - 70) < 1e-9);
    assert.ok(Math.abs(distance(ui.camera) - 26) < 1e-9);
    aimAtHead(ui.camera);
});

test('sensitivity uses the settings percentage consistently before and after the first settings visit', () => {
    const saved = setup(), fresh = setup(), half = setup(), high = setup();
    fresh.sensitivity(undefined);
    fresh.controller.onEventCame('changed', 'sensitivity');
    half.sensitivity('50'); half.controller.onEventCame('changed', 'sensitivity');
    high.sensitivity('250'); high.controller.onEventCame('changed', 'sensitivity');
    for (const ui of [saved, fresh, half, high]) ui.mouse(10, 0);
    assert.equal(fresh.player.rotation.value[1], saved.player.rotation.value[1]);
    assert.ok(Math.abs(saved.player.rotation.value[1] + 0.8) < 1e-9);
    assert.ok(Math.abs(half.player.rotation.value[1] + 0.4) < 1e-9);
    assert.ok(Math.abs(high.player.rotation.value[1] + 2) < 1e-9);
});

test('critical spring is frame-rate independent, takes the short yaw path and never crosses the avatar', () => {
    const slow = setup(), fast = setup();
    slow.mouse(-1000, 0, 0); fast.mouse(-1000, 0, 0);
    const radius = Math.hypot(...[slow.camera.position.value[0], slow.camera.position.value[2]]);
    for (let i = 0; i < 30; i++) slow.frame(1 / 30);
    for (let i = 0; i < 120; i++) fast.frame(1 / 120);
    for (let i = 0; i < 3; i++) {
        assert.ok(Math.abs(slow.camera.position.value[i] - fast.camera.position.value[i]) < 1e-9);
        assert.ok(Math.abs(slow.camera.rotation.value[i] - fast.camera.rotation.value[i]) < 1e-9);
    }
    assert.ok(Math.abs(slow.camera.rotation.value[1] - 88) < 0.05);
    const before = Array.from(slow.camera.position.value);
    slow.frame(0);
    assert.deepEqual(Array.from(slow.camera.position.value), before);
    const wrap = setup(171);
    wrap.mouse(-100, 0);
    assert.ok(wrap.camera.rotation.value[1] > 179 && wrap.camera.rotation.value[1] < 180);
    const turn = setup();
    turn.mouse(-100000, 0, 0);
    let previous = turn.camera.rotation.value[1];
    for (let i = 0; i < 120; i++) {
        turn.frame();
        assert.ok(Math.abs(turn.camera.rotation.value[1] - previous) < 7, 'bounded response to a mouse spike');
        assert.ok(Math.abs(Math.hypot(turn.camera.position.value[0], turn.camera.position.value[2]) - radius) < 1e-9);
        previous = turn.camera.rotation.value[1];
        aimAtHead(turn.camera);
    }
});

test('idle camera keeps the chosen angles despite avatar turns and accepts further mouse input', () => {
    const ui = setup();
    ui.mouse(-800, -200);
    ui.settle();
    assert.ok(ui.camera.rotation.value[1] > 70);
    ui.avatar.rotation.value = [0, -40, 0];
    const heading = ui.player.rotation.value[1];
    for (let i = 0; i < 600; i++) ui.frame();
    assert.ok(Math.abs(ui.camera.rotation.value[1] - 72) < 0.01);
    assert.ok(Math.abs(ui.camera.rotation.value[0] - 34) < 0.01);
    assert.equal(ui.player.rotation.value[1], heading);
    ui.mouse(-200, 0);
    ui.settle();
    assert.ok(Math.abs(ui.camera.rotation.value[1] - 88) < 0.02);
});

test('terrain collision overrides smoothing and uses rendered terrain rather than a stale network offset', () => {
    const ui = setup();
    const heights = Array.from({ length: 35 }, () => Array(35).fill(20));
    ui.connection.world = { revision: 1, chunkSize: 64, step: 2, terrainOffset: [0, 0, 0],
        chunks: [{ x: -1, z: -1, heightMap: heights }, { x: 0, z: -1, heightMap: heights }] };
    ui.connection.state = { revision: 2, terrainOffset: [0, 99, 0] };
    ui.terrain.position.value = [0, 3, 0];
    ui.frame();
    assert.equal(ui.camera.position.value[1], 24.5);
    aimAtHead(ui.camera);
    ui.connection.state.terrainOffset = [30, 200, 30];
    ui.frame();
    assert.equal(ui.camera.position.value[1], 24.5);
});

test('cinematic camera ownership freezes orbit and lifecycle releases settings and clock listeners', () => {
    const ui = setup();
    ui.sensitivity(undefined);
    ui.controller.onEventCame('changed', 'sensitivity');
    const before = Array.from(ui.camera.position.value);
    ui.controller.cinematic = true;
    ui.mouse(1000, 1000);
    assert.deepEqual(Array.from(ui.camera.position.value), before);
    assert.equal(ui.player.rotation.value[1], 0);
    assert.equal(ui.listeners.size, 1);
    assert.equal(ui.refreshers.size, 1);
    ui.controller.onDisable();
    assert.equal(ui.listeners.size, 0);
    assert.equal(ui.refreshers.size, 0);
    ui.sensitivity('invalid');
    assert.throws(() => ui.controller.onEventCame('changed', 'sensitivity'), /positive number/);
});

test('camera inherits player yaw and detaches parent listeners when destroyed', () => {
    const files = [
        ['chaos', 'EventManager', 'EventManager.js'], ['chaos', 'DynamicValue.js'], ['chaos', 'math', 'Matrix4.js'],
        ['engine', 'ActorEvents.js'], ['engine', 'Actor.js'], ['engine', 'components', 'base', 'Component.js'],
        ['engine', 'components', 'base', 'Transform.js']
    ];
    const { Actor, Transform } = runInNewContext(
        files.map(parts => readFileSync(path.join(root, ...parts), 'utf8')).join('\n') + '\n({Actor, Transform});',
        { toRadians: value => value * Math.PI / 180, console: { error: message => { throw new Error(message); } } });
    const playerTransform = new Transform(), cameraTransform = new Transform({ position: [0, 4, 0] });
    const player = new Actor('player', [playerTransform]), camera = new Actor('camera', [cameraTransform]);
    camera.parent = player;
    player.onInitialize(); camera.onInitialize();
    playerTransform.rotation.value = [0, 90, 0];
    assert.equal(cameraTransform.sceneRotation.value[1], 90);
    assert.ok(Math.abs(cameraTransform.front[0] - 1) < 1e-9);
    camera.onDestroy();
    playerTransform.rotation.value = [0, 180, 0];
    assert.equal(cameraTransform.sceneRotation.value[1], 90);
});
