import assert from 'node:assert/strict';
import test from 'node:test';
import { advancePlayer, isMovementCommand, MOVE_SPEED, playerState, speedMultiplier, SPEED_POTION_DURATION_MS } from '../src/world/simulation.js';
import { getHeight } from '../src/world/terrain-generator.js';

function player(id = 'first') {
    const position = { x: 2048, y: getHeight(2048, 4096), z: 4096 };
    return {
        id, position, anchor: { ...position }, revision: 1,
        input: { forward: 1, right: 0, yaw: 0 }, inputReceivedAt: 1000
    };
}

test('ordinary movement retains full control on steep slopes and does not drift when idle', () => {
    for (const degrees of [0, 45, 70]) {
        const heightAt = (x, z) => -z * Math.tan(degrees * Math.PI / 180);
        const p = { position: { x: 0, y: 0, z: 0 }, anchor: { x: 0, y: 0, z: 0 } };
        advancePlayer(p, 0.1, 1000, heightAt);
        assert.deepEqual(p.position, { x: 0, y: heightAt(0, 0), z: 0 });
        for (const forward of [-1, 1]) {
            p.input = { forward, right: 0, yaw: 0 }; p.inputReceivedAt = 1000;
            const before = p.position.z;
            advancePlayer(p, 0.1, 1000, heightAt);
            assert.ok(Math.abs(p.position.z - before - forward * 1.3) < 1e-9);
            assert.equal(p.position.y, heightAt(p.position.x, p.position.z));
        }
    }
});

test('higher airborne falls still land harder after removing slope sliding', () => {
    const impacts = [];
    for (const depth of [3, 15]) {
        const heightAt = () => 0;
        const p = { position: { x: 0, y: depth, z: 0 }, anchor: { x: 0, y: 0, z: 0 },
            airborne: true, verticalVelocity: 0 };
        for (let tick = 0; tick < 100 && p.airborne; tick++)
            advancePlayer(p, 0.05, 1100 + tick * 50, heightAt);
        assert.equal(p.position.y, 0);
        assert.equal(p.airborne, false);
        assert.equal(p.landingId, 1);
        impacts.push(p.landingSpeed);
    }
    assert.ok(impacts[1] > impacts[0] * 2);
});

test('origin star points toward server zero from every quadrant and reaches the zenith at the origin', () => {
    const p = player();
    for (const [x, z] of [[0, 0], [300, 0], [-300, 0], [0, 300], [0, -300], [900, -1200]]) {
        p.position = { x, y: 200, z };
        const direction = playerState(p, new Map()).originStar;
        assert.ok(Math.abs(Math.hypot(...direction) - 1) < 1e-10);
        assert.ok(direction[1] > 0);
        assert.ok(Math.abs(direction[0] / direction[1] + x / 5000) < 1e-10);
        assert.ok(Math.abs(direction[2] / direction[1] + z / 5000) < 1e-10);
        if (x === 0 && z === 0)
            assert.equal(direction[1], 1);
        p.position.y = -100;
        assert.deepEqual(playerState(p, new Map()).originStar, direction, 'height does not change horizontal guidance');
    }
});

test('validates bounded movement intent and rejects client positions, speed, identity, and time', () => {
    const valid = { command: 'move', forward: 1, right: -1, yaw: 90 };
    assert.equal(isMovementCommand(valid), true);
    for (const command of [
        { ...valid, forward: 2 }, { ...valid, right: Infinity }, { ...valid, yaw: NaN },
        { ...valid, yaw: 181 }, { ...valid, forward: '1' },
        { ...valid, position: [1000, 0, 0] }, { ...valid, speed: 999 },
        { ...valid, deltaTime: 1000 }, { ...valid, playerId: 'second' },
        { command: 'move', forward: 1 }
    ])
        assert.equal(isMovementCommand(command), false);
});

test('moves only at server speed, normalizes diagonals, and grounds players on server terrain', () => {
    assert.equal(MOVE_SPEED, 13);
    for (const input of [
        { forward: 1, right: 0, yaw: 0 },
        { forward: 1, right: 1, yaw: 45 },
        { forward: -1, right: -1, yaw: -180 }
    ]) {
        const p = player();
        p.input = input;
        const start = { ...p.position };
        advancePlayer(p, 0.05, 1050);
        assert.ok(Math.abs(Math.hypot(p.position.x - start.x, p.position.z - start.z) - MOVE_SPEED * 0.05) < 1e-9);
        assert.equal(p.position.y, getHeight(p.position.x, p.position.z));
    }
});

test('potions give exactly 25 percent for five minutes and one essence adds 10 percentage points without changing jumps', () => {
    assert.equal(SPEED_POTION_DURATION_MS, 300000);
    for (const [speedEssence, speedPotionUntil, now, multiplier] of [
        [false, undefined, 1100, 1], [false, 301000, 1100, 1.25],
        [false, 301000, 301000, 1], [true, undefined, 1100, 1.1],
        [true, 301000, 1100, 1.35], [true, 301000, 301000, 1.1]
    ]) {
        const p = player();
        Object.assign(p, { speedEssence, speedPotionUntil, inputReceivedAt: now });
        const start = { ...p.position };
        assert.equal(speedMultiplier(p, now), multiplier);
        advancePlayer(p, 0.1, now);
        assert.ok(Math.abs(Math.hypot(p.position.x - start.x, p.position.z - start.z) -
            MOVE_SPEED * multiplier * 0.1) < 1e-9);
    }
    const base = player(), enhanced = player();
    base.input = enhanced.input = null;
    base.jumpRequested = enhanced.jumpRequested = true;
    enhanced.speedEssence = true;
    enhanced.speedPotionUntil = 5000;
    advancePlayer(base, 0.1, 1100);
    advancePlayer(enhanced, 0.1, 1100);
    assert.equal(base.position.y, enhanced.position.y);
    assert.equal(base.verticalVelocity, enhanced.verticalVelocity);
});

test('server jump reaches two meters, rejects midair repeats and lands even when input expires', () => {
    const p = player();
    p.input = null;
    const ground = p.position.y;
    p.jumpRequested = true;
    let peak = ground;
    for (let tick = 0; tick < 30; tick++) {
        if (tick === 5)
            p.jumpRequested = true;
        advancePlayer(p, 0.05, 2000 + tick * 50);
        peak = Math.max(peak, p.position.y);
        assert.ok(p.position.y >= ground);
    }
    assert.ok(peak - ground > 1.98 && peak - ground <= 2.001);
    assert.equal(p.position.y, ground);
    assert.equal(p.verticalVelocity, 0);
    assert.equal(p.airborne, false);
    p.jumpRequested = true;
    advancePlayer(p, 0.05, 4000);
    assert.ok(p.position.y > ground);
});

test('stops expired input, clamps lag spikes, and prevents outrunning streamed terrain', () => {
    const p = player();
    const initial = { ...p.position };
    advancePlayer(p, 0.05, 1501);
    assert.deepEqual(p.position, initial);
    advancePlayer(p, 9999, 1100);
    assert.ok(Math.abs(p.position.z - initial.z - MOVE_SPEED * 0.1) < 1e-9);
    p.position.z = p.anchor.z + 128;
    p.position.y = getHeight(p.position.x, p.position.z);
    const edge = { ...p.position };
    advancePlayer(p, 0.05, 1100);
    assert.deepEqual(p.position, edge);
    p.anchor = null;
    advancePlayer(p, 0.05, 1100);
    assert.deepEqual(p.position, edge);
});

test('states expose only relative terrain and nearby other player positions', () => {
    const first = player('first');
    const second = player('second');
    second.position.x += 8;
    second.position.z += 12;
    const distant = player('distant');
    distant.position.x += 1000;
    const loading = player('loading');
    loading.anchor = null;
    const players = new Map([first, second, distant, loading].map(p => [p.id, p]));
    const state = playerState(first, players);
    assert.deepEqual(Object.keys(state).sort(), ['command', 'drops', 'motion', 'originStar', 'players', 'revision', 'terrainOffset']);
    assert.deepEqual(state.drops, []);
    assert.deepEqual(state.terrainOffset, [0, 0, 0]);
    assert.deepEqual(state.players, [{ id: 'second', position: [8, 0, 12], motion: state.motion }]);
    first.position.x += 3;
    assert.equal(playerState(first, players).terrainOffset[0], -3);
    players.delete('second');
    assert.deepEqual(playerState(first, players).players, []);
});
