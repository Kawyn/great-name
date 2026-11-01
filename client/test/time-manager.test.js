const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

test('uses consistent monotonic units from the first frame and clamps resume spikes', () => {
    let now = 100000;
    let callback;
    let cleared;
    const TimeManager = runInNewContext(
        readFileSync(path.join(__dirname, '..', 'src', 'chaos', 'EventManager', 'TimeManager.js'), 'utf8') +
        '\nTimeManager;', {
            performance: { now: () => now },
            setInterval: fn => { callback = fn; return 42; },
            clearInterval: id => { cleared = id; }
        });
    const manager = new TimeManager();
    const deltas = [];
    manager.addObjectToRefresh({ onRefresh: dt => deltas.push(dt) });
    manager.start();
    now += 33;
    callback();
    assert.equal(deltas.at(-1), 0.033);
    now += 10000;
    callback();
    assert.equal(deltas.at(-1), 0.1);
    now += 33;
    callback();
    assert.equal(deltas.at(-1), 0.033);
    manager.stop();
    assert.equal(cleared, 42);
});
