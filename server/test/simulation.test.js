import assert from 'node:assert/strict';
import test from 'node:test';
import { advancePlayer, isMovementCommand, MOVE_SPEED, playerState } from '../src/world/simulation.js';
import { getHeight } from '../src/world/terrain-generator.js';

function player(id = 'first') {
    const position = { x: 2048, y: getHeight(2048, 4096), z: 4096 };
    return {
        id, position, anchor: { ...position }, revision: 1,
        input: { forward: 1, right: 0, yaw: 0 }, inputReceivedAt: 1000
    };
}

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
    assert.deepEqual(Object.keys(state).sort(), ['command', 'players', 'revision', 'terrainOffset']);
    assert.deepEqual(state.terrainOffset, [0, 0, 0]);
    assert.deepEqual(state.players, [{ id: 'second', position: [8, 0, 12] }]);
    first.position.x += 3;
    assert.equal(playerState(first, players).terrainOffset[0], -3);
    players.delete('second');
    assert.deepEqual(playerState(first, players).players, []);
});
