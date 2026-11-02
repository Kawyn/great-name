const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

function setup() {
    const listeners = new Map(), refreshing = new Set(), actors = [], errors = [];
    const root = path.join(__dirname, '..', 'src');
    const api = runInNewContext([
        'chaos\\EventManager\\EventManager.js', 'engine\\components\\base\\Component.js',
        'engine\\Actor.js', 'engine\\ActionGraph.js'
    ].map(file => readFileSync(path.join(root, file), 'utf8')).join('\n') +
        '\n({ Actor, ActionGraph, WaitForEventAction, MoveCameraAction, MoveCharacterAction, SpawnObjectAction, FadeAction });', {
        window: {
            addEventListener: (name, listener) => listeners.set(name, listener),
            removeEventListener: name => listeners.delete(name)
        },
        console: { error: (...args) => errors.push(args) },
        Scene: { Instance: {
            PushActor: actor => actors.push(actor),
            TimeManager: { addObjectToRefresh: object => refreshing.add(object),
                removeObjectToRefresh: object => refreshing.delete(object) }
        } }
    });
    const initialize = graph => { graph.onInitialize(); graph.onPostInitialize(); graph.onEnable(); return graph; };
    return { ...api, listeners, refreshing, actors, errors, initialize };
}

test('ActionGraph is an actor with ordered actions, waits for events and buffers later events without losing them', () => {
    const ui = setup(), calls = [];
    const graph = ui.initialize(new ui.ActionGraph('test', [
        new ui.WaitForEventAction('begin', data => calls.push(data)),
        { start: () => calls.push('start'), update: () => { calls.push('update'); return true; }, stop: () => calls.push('stop') },
        new ui.WaitForEventAction('done', data => calls.push(data)),
        new ui.SpawnObjectAction(() => new ui.Actor('spawned'))
    ], { onComplete: () => calls.push('complete') }, ['begin', 'done']));
    assert.ok(graph instanceof ui.Actor);
    graph.runner.onRefresh(0.1);
    assert.equal(graph.actionIndex, 0);
    ui.listeners.get('done')({ detail: 'done' });
    ui.listeners.get('begin')({ detail: 'begin' });
    for (let frame = 0; frame < 4; frame++)
        graph.runner.onRefresh(0.1);
    assert.deepEqual(calls, ['begin', 'start', 'update', 'stop', 'done', 'complete']);
    assert.equal(graph.status, 'completed');
    assert.equal(ui.actors[0].identifier, 'spawned');
    assert.equal(ui.refreshing.size, 0);
    assert.equal(ui.listeners.size, 0);
});

test('camera action interpolates smoothly and translates both camera and look target when the terrain origin moves', () => {
    const ui = setup();
    let reference = [0, 0, 0], recalculated = 0;
    const context = {
        cameraTransform: { position: { value: [0, 4, -10] } },
        lookTarget: { position: { value: [0, 3, 0] } },
        reference: () => reference,
        renderer: { recalculateViewMatrix: () => recalculated++ },
        cameraController: { clearTerrain: position => position[1] = Math.max(position[1], 1) }
    };
    const action = new ui.MoveCameraAction(1, () => ({
        position: [10 + reference[0], 0, 0], target: [0 + reference[0], 2, 0]
    }));
    action.start(context);
    for (let frame = 0; frame < 5; frame++)
        action.update(0.1, context);
    assert.ok(Math.abs(context.cameraTransform.position.value[0] - 5) < 1e-8);
    reference = [-64, 0, 0];
    for (let frame = 0; frame < 6; frame++)
        action.update(0.1, context);
    assert.deepEqual(Array.from(context.cameraTransform.position.value), [-54, 1, 0]);
    assert.deepEqual(Array.from(context.lookTarget.position.value), [-64, 2, 0]);
    assert.ok(recalculated > 0);
});

test('a failed or cancelled graph releases listeners, stops its action and reports errors rather than spawning later objects', () => {
    const ui = setup();
    let stopped = 0, cancelled = 0, reported = null;
    const graph = ui.initialize(new ui.ActionGraph('broken', [
        { update() { throw new Error('test failure'); }, stop: () => stopped++ },
        new ui.SpawnObjectAction(() => new ui.Actor('should-not-spawn'))
    ], { onCancel: () => cancelled++, onError: error => reported = error }, ['abort']));
    graph.runner.onRefresh(0.1);
    assert.equal(graph.status, 'failed');
    assert.equal(reported.message, 'test failure');
    assert.equal(ui.errors.length, 1);
    assert.equal(stopped, 1);
    assert.equal(cancelled, 1);
    assert.equal(ui.listeners.size, 0);
    assert.equal(ui.refreshing.size, 0);
    assert.equal(ui.actors.length, 0);
});

test('character action holds a cinematic shot and faces the authoritative march direction; timed actions catch up after suspension', () => {
    const ui = setup();
    let held = 0, clock = 0;
    const context = { avatarTransform: { rotation: { value: [0, 0, 0] } }, holdCamera: () => held++,
        timeline: () => clock, fade: { style: {} } };
    const action = new ui.MoveCharacterAction(7, () => [1, 0, 0]);
    action.timelineStart = 4;
    action.start(context);
    assert.equal(context.avatarTransform.rotation.value[1], 90);
    assert.equal(action.update(0.1, context), false);
    clock = 12;
    assert.equal(action.update(0.1, context), true);
    assert.equal(held, 2);
    const fade = new ui.FadeAction(2, 0, 1);
    fade.start(context);
    fade.update(1, context);
    assert.equal(context.fade.style.opacity, '0.5');
});

test('even a broken action cleanup cannot retain graph listeners or camera/input ownership', () => {
    const ui = setup();
    let released = 0, reported = 0;
    const graph = ui.initialize(new ui.ActionGraph('cleanup-failure', [{
        update() { throw new Error('action failed'); },
        stop() { throw new Error('cleanup failed'); }
    }], { onCancel: () => released++, onError: () => reported++ }, ['event']));
    graph.runner.onRefresh(0.1);
    assert.equal(graph.status, 'failed');
    assert.equal(released, 1);
    assert.equal(reported, 1);
    assert.equal(ui.listeners.size, 0);
    assert.equal(ui.refreshing.size, 0);
    assert.equal(ui.errors.length, 2);
});
