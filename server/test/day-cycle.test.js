import assert from 'node:assert/strict';
import test from 'node:test';
import { dayCycle, DAY_DURATION_SECONDS, DAY_CYCLE_EPOCH_MS } from '../src/world/day-cycle.js';

test('one authoritative day is exactly 30 minutes and remains continuous across midnight and restarts', () => {
    assert.equal(DAY_DURATION_SECONDS, 1800);
    for (const [time, phase] of [[0, 0], [450000, 0.25], [900000, 0.5], [1350000, 0.75], [1800000, 0]]) {
        assert.deepEqual(dayCycle(DAY_CYCLE_EPOCH_MS + time), { phase, duration: 1800 });
    }
    const now = DAY_CYCLE_EPOCH_MS;
    assert.deepEqual(dayCycle(now), dayCycle(now + 1800000));
    assert.equal(dayCycle(now - 1).phase, 1799999 / 1800000);
    assert.equal(dayCycle(now + 1800001).phase, 1 / 1800000);
    assert.equal(dayCycle(1793581985566).phase, 0.54, 'requested reference time is early night');
    assert.ok(dayCycle(0).phase >= 0 && dayCycle(0).phase < 1);
    for (const invalid of [-1, NaN, Infinity, undefined])
        assert.throws(() => dayCycle(invalid), /authoritative/);
});
