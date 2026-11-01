const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

const root = path.join(__dirname, '..', 'src');

test('horizontal mouse movement changes yaw and vertical movement changes pitch independently', () => {
    const axes = { mouse_x: { value: 10 }, mouse_y: { value: 0 } };
    const rotation = () => ({ value: [0, 0, 0], callChangedNow() {} });
    const player = { rotation: rotation() };
    const camera = { rotation: rotation(), position: { value: [0, 0, 0] } };
    const CameraController = runInNewContext(
        readFileSync(path.join(root, 'engine', 'components', 'base', 'Component.js'), 'utf8') +
        readFileSync(path.join(root, 'engine', 'components', 'movement', 'CameraController.js'), 'utf8') +
        '\nCameraController;',
        {
            window: { GameConnection: { world: null, state: null } },
            Transform: class {},
            Scene: { Instance: {
                InputManager: { GetAxis: name => axes[name] },
                GetActorByIdentifier: name => name === 'camera' ? ({ GetCompnentByType: () => camera }) : null
            } }
        }
    );
    const controller = new CameraController('camera');
    controller.onInitialize({ GetCompnentByType: () => player });
    controller.onPostInitialize();
    controller.onRefresh(0.1);
    assert.equal(player.rotation.value[1], -8);
    controller.updateOrbit();
    assert.ok(Math.abs(camera.rotation.value[0] - 18) < 1e-9);
    axes.mouse_x.value = 0;
    axes.mouse_y.value = 10;
    controller.onRefresh(0.1);
    assert.equal(player.rotation.value[1], -8);
    controller.updateOrbit();
    assert.ok(Math.abs(camera.rotation.value[0] - 10) < 1e-9);
});

test('camera inherits player yaw and detaches parent listeners when destroyed', () => {
    const files = [
        ['chaos', 'EventManager', 'EventManager.js'],
        ['chaos', 'DynamicValue.js'],
        ['chaos', 'math', 'Matrix4.js'],
        ['engine', 'ActorEvents.js'],
        ['engine', 'Actor.js'],
        ['engine', 'components', 'base', 'Component.js'],
        ['engine', 'components', 'base', 'Transform.js']
    ];
    const source = files.map(parts => readFileSync(path.join(root, ...parts), 'utf8')).join('\n');
    const { Actor, Transform } = runInNewContext(source + '\n({Actor, Transform});', {
        toRadians: value => value * Math.PI / 180,
        console: { error: message => { throw new Error(message); } }
    });

    const playerTransform = new Transform();
    const cameraTransform = new Transform({ position: [0, 4, 0] });
    const player = new Actor('player', [playerTransform]);
    const camera = new Actor('camera', [cameraTransform]);
    camera.parent = player;
    player.onInitialize();
    camera.onInitialize();
    playerTransform.rotation.value = [0, 90, 0];
    assert.equal(cameraTransform.sceneRotation.value[1], 90);
    assert.ok(Math.abs(cameraTransform.front[0] - 1) < 1e-9);
    camera.onDestroy();
    playerTransform.rotation.value = [0, 180, 0];
    assert.equal(cameraTransform.sceneRotation.value[1], 90);
});

test('third-person camera zooms with pitch around the head and clears server terrain', () => {
    const axes = { mouse_x: { value: 0 }, mouse_y: { value: 0 } };
    const player = { rotation: { value: [0, 0, 0] } };
    const camera = { rotation: { value: [0, 0, 0] }, position: { value: [0, 0, 0] } };
    const connection = { world: null, state: null };
    const CameraController = runInNewContext(
        readFileSync(path.join(root, 'engine', 'components', 'base', 'Component.js'), 'utf8') +
        readFileSync(path.join(root, 'engine', 'components', 'movement', 'CameraController.js'), 'utf8') +
        '\nCameraController;', {
            window: { GameConnection: connection },
            Transform: class {},
            Scene: { Instance: {
                InputManager: { GetAxis: name => axes[name] },
                GetActorByIdentifier: name => name === 'camera' ? ({ GetCompnentByType: () => camera }) : null
            } }
        });
    const controller = new CameraController('camera');
    controller.onInitialize({ GetCompnentByType: () => player });
    controller.onPostInitialize();
    const distance = () => Math.hypot(camera.position.value[0], camera.position.value[1] - 3.3,
        camera.position.value[2]);
    const aimAtHead = () => {
        const pitch = camera.rotation.value[0] * Math.PI / 180;
        const yaw = camera.rotation.value[1] * Math.PI / 180;
        const front = [Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
        const headDirection = camera.position.value.map((value, axis) =>
            ((axis === 1 ? 3.3 : 0) - value) / distance());
        for (let axis = 0; axis < 3; axis++)
            assert.ok(Math.abs(front[axis] - headDirection[axis]) < 1e-9);
    };
    assert.ok(Math.abs(distance() - 24.432) < 1e-9);
    aimAtHead();
    player.rotation.value = [0, 90, 0];
    controller.onRefresh(0.033);
    assert.ok(camera.position.value[0] < 0 && camera.position.value[0] > -24.432);
    assert.ok(camera.rotation.value[1] > 0 && camera.rotation.value[1] < 90);
    aimAtHead();
    controller.updateOrbit();
    assert.ok(camera.position.value[0] < -7);
    assert.ok(Math.abs(camera.position.value[2]) < 1e-9);
    assert.ok(Math.abs(camera.rotation.value[1] - 90) < 1e-9);
    axes.mouse_y.value = 10000;
    controller.onRefresh(0.1);
    assert.ok(camera.rotation.value[0] > -85 && camera.rotation.value[0] < 18);
    controller.updateOrbit();
    assert.ok(Math.abs(camera.rotation.value[0] + 85) < 1e-9);
    assert.ok(Math.abs(distance() - 1) < 1e-9);
    aimAtHead();
    assert.ok(camera.position.value[1] >= 1.5, 'looking at the sky must not lower the camera underground');
    axes.mouse_y.value = -106.25;
    controller.onRefresh(0.1);
    controller.updateOrbit();
    assert.ok(Math.abs(distance() - 24) < 1e-9);
    assert.ok(Math.abs(camera.rotation.value[0]) < 1e-9);
    axes.mouse_y.value = -75;
    controller.onRefresh(0.1);
    const blend = 1 - Math.exp(-0.8);
    assert.ok(Math.abs(camera.position.value[1] -
        (3.3 + Math.sin(Math.PI / 3) * 26 * blend)) < 1e-9);
    aimAtHead();
    controller.updateOrbit();
    assert.ok(Math.abs(distance() - 26) < 1e-9);
    assert.ok(Math.abs(camera.rotation.value[0] - 60) < 1e-9);
    aimAtHead();
    axes.mouse_y.value = -10000;
    controller.onRefresh(0.1);
    controller.updateOrbit();
    assert.ok(Math.abs(camera.rotation.value[0] - 80) < 1e-9);
    const heights = Array.from({ length: 35 }, () => Array(35).fill(20));
    connection.world = { revision: 1, chunkSize: 64, step: 2, terrainOffset: [0, 0, 0],
        chunks: [{ x: -1, z: -1, heightMap: heights }, { x: -1, z: 0, heightMap: heights }] };
    connection.state = { revision: 1, terrainOffset: [0, 3, 0] };
    // Lower the orbit before raising the terrain under its smoothed position.
    axes.mouse_y.value = 10000;
    controller.onRefresh(0.1);
    axes.mouse_y.value = 0;
    controller.onRefresh(0.033);
    assert.ok(camera.position.value[1] >= 24.5);
    aimAtHead();
    controller.updateOrbit();
    assert.equal(camera.position.value[1], 24.5);
    aimAtHead();
    connection.state = { revision: 2, terrainOffset: [0, 99, 0] };
    controller.onRefresh(0.033);
    controller.updateOrbit();
    assert.equal(camera.position.value[1], 21.5, 'do not combine a world with a different state revision');

    connection.world = { revision: 3, chunkSize: 64, step: 2, terrainOffset: [0, 0, 0], chunks: [] };
    connection.state = { revision: 3, terrainOffset: [0, 0, 0] };
    axes.mouse_y.value = -128.75;
    controller.onRefresh(0.033);
    axes.mouse_y.value = 0;
    controller.updateOrbit();
    const before = Array.from(camera.position.value);
    connection.state.terrainOffset = [-0.5, -0.2, 0];
    controller.onRefresh(0.033);
    assert.deepEqual(Array.from(camera.position.value), before,
        'network packets must not directly shift the player-relative camera');
    aimAtHead();
    controller.onRefresh(0.033);
    assert.deepEqual(Array.from(camera.position.value), before);
    connection.world.revision = 4;
    connection.state = { revision: 4, terrainOffset: [60, 10, 60] };
    controller.updateOrbit();
    assert.ok(Math.abs(camera.position.value[0] - before[0]) < 1e-9);
    axes.mouse_x.value = 10;
    controller.onRefresh(0.033);
    assert.ok(Math.abs(player.rotation.value[1] - 82) < 1e-9,
        'TPP mouse displacement should use reduced sensitivity, not frame time');
});

test('orbit lerp is frame-rate independent, converges, and takes the short yaw path', () => {
    function createCamera(yaw = 0) {
        const player = { rotation: { value: [0, yaw, 0] } };
        const camera = { rotation: { value: [0, 0, 0] }, position: { value: [0, 0, 0] } };
        const CameraController = runInNewContext(
            readFileSync(path.join(root, 'engine', 'components', 'base', 'Component.js'), 'utf8') +
            readFileSync(path.join(root, 'engine', 'components', 'movement', 'CameraController.js'), 'utf8') +
            '\nCameraController;', {
                window: { GameConnection: { world: null, state: null } },
                Transform: class {},
                Scene: { Instance: {
                    InputManager: { GetAxis: () => ({ value: 0 }) },
                    GetActorByIdentifier: name => name === 'camera' ? ({ GetCompnentByType: () => camera }) : null
                } }
            });
        const controller = new CameraController('camera');
        controller.onInitialize({ GetCompnentByType: () => player });
        controller.onPostInitialize();
        return { player, camera, controller };
    }
    const slow = createCamera();
    const fast = createCamera();
    slow.player.rotation.value[1] = 90;
    fast.player.rotation.value[1] = 90;
    for (let i = 0; i < 30; i++)
        slow.controller.onRefresh(1 / 30);
    for (let i = 0; i < 120; i++)
        fast.controller.onRefresh(1 / 120);
    for (let axis = 0; axis < 3; axis++) {
        assert.ok(Math.abs(slow.camera.position.value[axis] - fast.camera.position.value[axis]) < 1e-9);
        assert.ok(Math.abs(slow.camera.rotation.value[axis] - fast.camera.rotation.value[axis]) < 1e-9);
    }
    assert.ok(Math.abs(slow.camera.rotation.value[1] - 90) < 0.04);
    const position = Array.from(slow.camera.position.value);
    slow.controller.onRefresh(0);
    assert.deepEqual(Array.from(slow.camera.position.value), position);
    const wrap = createCamera(179);
    wrap.player.rotation.value[1] = -179;
    wrap.controller.onRefresh(1 / 30);
    assert.ok(wrap.camera.rotation.value[1] > 179 && wrap.camera.rotation.value[1] < 181);
});
