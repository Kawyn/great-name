const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

test('sends WASD intent without changing local position and stops on blur or pointer unlock', () => {
    const listeners = new Map();
    const windowListeners = new Map();
    const sent = [];
    let jumps = 0;
    const canvas = {};
    const document = {
        pointerLockElement: canvas,
        querySelector: () => canvas,
        addEventListener: (name, callback) => listeners.set(name, callback),
        removeEventListener: name => listeners.delete(name)
    };
    let now = 0;
    const transform = { rotation: { value: [0, 450, 0] }, position: { value: [0, 0, 0] } };
    const avatar = { rotation: { value: [0, 0, 0] } };
    const root = path.join(__dirname, '..', 'src');
    const ServerMovement = runInNewContext(
        readFileSync(path.join(root, 'engine', 'components', 'base', 'Component.js'), 'utf8') +
        readFileSync(path.join(root, 'network', 'ServerMovement.js'), 'utf8') + '\nServerMovement;',
        {
            document,
            Transform: class {},
            performance: { now: () => now },
            Scene: { Instance: {
                TimeManager: { addObjectToRefresh() {}, removeObjectToRefresh() {} },
                GetActorByIdentifier: () => ({ GetCompnentByType: () => avatar })
            } },
            window: {
                addEventListener: (name, callback) => windowListeners.set(name, callback),
                removeEventListener: name => windowListeners.delete(name),
                GameConnection: { sendInput: (...args) => sent.push(args), sendJump: () => jumps++ }
            }
        }
    );
    const controller = new ServerMovement('avatar');
    controller.onInitialize({ GetCompnentByType: () => transform });
    controller.onPostInitialize();
    controller.onEnable();
    listeners.get('keydown')({ code: 'Space', repeat: false, preventDefault() {} });
    listeners.get('keydown')({ code: 'Space', repeat: true, preventDefault() {} });
    assert.equal(jumps, 1);
    listeners.get('keydown')({ code: 'KeyW', preventDefault() {} });
    listeners.get('keydown')({ code: 'KeyD', preventDefault() {} });
    controller.onRefresh();
    assert.deepEqual(sent.at(-1), [1, 1, 90]);
    assert.equal(avatar.rotation.value[1], 135);
    controller.onRefresh();
    assert.equal(sent.length, 1);
    now = 100;
    controller.onRefresh();
    assert.equal(sent.length, 2);
    listeners.get('keyup')({ code: 'KeyD' });
    assert.deepEqual(sent.at(-1), [1, 0, 90]);
    assert.equal(avatar.rotation.value[1], 90);
    windowListeners.get('blur')();
    assert.deepEqual(sent.at(-1), [0, 0, 90]);
    document.pointerLockElement = null;
    listeners.get('keydown')({ code: 'Space', repeat: false, preventDefault() {} });
    assert.equal(jumps, 1, 'menu input cannot jump');
    listeners.get('pointerlockchange')();
    listeners.get('keydown')({ code: 'KeyW', preventDefault() {} });
    now = 200;
    controller.onRefresh();
    assert.deepEqual(sent.at(-1), [0, 0, 90]);
    assert.deepEqual(transform.position.value, [0, 0, 0]);
    transform.rotation.value = [0, 180, 0];
    now = 300;
    controller.onRefresh();
    assert.deepEqual(sent.at(-1), [0, 0, -180]);
    assert.equal(avatar.rotation.value[1], 90, 'orbiting the camera must not rotate an idle character');
    controller.onDisable();
    assert.equal(listeners.size, 0);
    assert.equal(windowListeners.size, 0);
});
