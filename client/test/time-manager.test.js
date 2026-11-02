const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(path.join(__dirname, '..', 'src', 'chaos', 'EventManager', 'TimeManager.js'), 'utf8') +
    '\nTimeManager;';

test('uses consistent monotonic units from the first frame and clamps resume spikes', () => {
    let now = 100000, callback, cleared;
    const TimeManager = runInNewContext(source, {
        performance: { now: () => now },
        requestAnimationFrame: fn => { callback = fn; return 42; },
        cancelAnimationFrame: id => { cleared = id; }
    });
    const manager = new TimeManager(), deltas = [];
    manager.addObjectToRefresh({ onRefresh: dt => deltas.push(dt) });
    manager.start();
    now += 33; callback();
    assert.equal(deltas.at(-1), 0.033);
    now += 10000; callback();
    assert.equal(deltas.at(-1), 0.1);
    now += 33; callback();
    assert.equal(deltas.at(-1), 0.033);
    manager.stop();
    assert.equal(cleared, 42);
});

test('one animation loop updates terrain, camera, movement and input before drawing, and stops without rescheduling', () => {
    let now = 0, scheduled = 0;
    const callbacks = new Map(), calls = [];
    const TimeManager = runInNewContext(source, {
        performance: { now: () => now },
        requestAnimationFrame: callback => { callbacks.set(++scheduled, callback); return scheduled; },
        cancelAnimationFrame: id => callbacks.delete(id)
    });
    const manager = new TimeManager();
    for (const [name, priority] of [['render', 0], ['input reset', 50], ['movement', 100], ['camera', 175], ['terrain', 200]])
        manager.addObjectToRefresh({ onRefresh: () => calls.push(name) }, priority);
    manager.start(); manager.start();
    assert.equal(callbacks.size, 1);
    const next = () => {
        const [id, callback] = callbacks.entries().next().value;
        callbacks.delete(id);
        now += 1000 / 60;
        callback(now);
    };
    next();
    assert.deepEqual(calls, ['terrain', 'camera', 'movement', 'input reset', 'render']);
    assert.equal(callbacks.size, 1);
    manager.addObjectToRefresh({ onRefresh: () => manager.stop() }, -1);
    next();
    assert.equal(callbacks.size, 0, 'stop inside a frame must not restart the loop');
    manager.start();
    assert.equal(callbacks.size, 1);
    manager.stop();
    assert.equal(callbacks.size, 0);
    const renderer = readFileSync(path.join(__dirname, '..', 'src', 'engine', 'components', 'renderer', 'Renderer.js'), 'utf8');
    assert.match(renderer, /addObjectToRefresh\(this, 0\)/);
});

test('removing a refresher during a frame neither skips its neighbor nor refreshes destroyed objects', () => {
    const TimeManager = runInNewContext(source, { performance: { now: () => 1 } });
    const manager = new TimeManager(), calls = [];
    const first = { onRefresh() { calls.push('first'); manager.removeObjectToRefresh(first); manager.removeObjectToRefresh(last); } };
    const second = { onRefresh() { calls.push('second'); } };
    const last = { onRefresh() { calls.push('destroyed'); } };
    for (const object of [first, second, last]) manager.addObjectToRefresh(object);
    manager.refresh();
    assert.deepEqual(calls, ['first', 'second']);
});
