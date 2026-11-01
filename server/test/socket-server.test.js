import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import WebSocket from 'ws';
import { createSocketServer } from '../src/socket-server.js';
import { MOVE_SPEED } from '../src/world/simulation.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

async function connectClient(t, server) {
    const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/socket`);
    t.after(() => socket.terminate());
    await once(socket, 'open');
    return socket;
}

async function sendCommand(socket, message) {
    const response = once(socket, 'message');
    socket.send(message);
    const [data] = await response;
    return JSON.parse(data.toString());
}

function waitForMessage(socket, predicate) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Timed out waiting for server message.'));
        }, 15000);
        const cleanup = () => {
            clearTimeout(timeout);
            socket.off('message', onMessage);
            socket.off('error', onError);
        };
        const onError = error => {
            cleanup();
            reject(error);
        };
        const onMessage = data => {
            const message = JSON.parse(data.toString());
            if (predicate(message)) {
                cleanup();
                resolve(message);
            }
        };
        socket.on('message', onMessage);
        socket.on('error', onError);
    });
}

async function startServer(t) {
    const server = createSocketServer({ port: 0 });
    t.after(async () => {
        for (const socket of server.clients) {
            socket.terminate();
        }
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    });
    await once(server, 'listening');
    return server;
}

test('accepts independent client connections and removes disconnected clients', async (t) => {
    const server = await startServer(t);
    const url = `ws://127.0.0.1:${server.address().port}/socket`;
    const first = new WebSocket(url);
    const second = new WebSocket(url);
    t.after(() => {
        first.terminate();
        second.terminate();
    });
    await Promise.all([once(first, 'open'), once(second, 'open')]);
    assert.equal(server.clients.size, 2);

    const disconnected = Promise.race(
        [...server.clients].map((socket) => once(socket, 'close'))
    );
    first.close();
    await disconnected;
    assert.equal(server.clients.size, 1);
    assert.equal(second.readyState, WebSocket.OPEN);
});

test('rejects connections outside the socket endpoint', async (t) => {
    const server = await startServer(t);
    const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/other`);
    t.after(() => socket.terminate());
    const [error] = await once(socket, 'error');
    assert.match(error.message, /Unexpected server response: 400/);
});

test('assigns distinct UUIDs, registers once per connection, and cleans up on disconnect', async (t) => {
    const server = await startServer(t);
    const first = await connectClient(t, server);
    const second = await connectClient(t, server);
    assert.equal(server.players.size, 0);
    const registration = await sendCommand(first, '{"command":"register","playerId":"client-chosen"}');
    assert.equal(registration.command, 'registered');
    assert.match(registration.playerId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.deepEqual(Object.keys(registration).sort(), ['command', 'playerId']);
    const duplicate = await sendCommand(first, '{"command":"register"}');
    assert.deepEqual(duplicate, registration);
    assert.equal(server.players.size, 1);
    const other = await sendCommand(second, '{"command":"register"}');
    assert.notEqual(other.playerId, registration.playerId);
    assert.equal(server.players.size, 2);
    assert.equal(server.players.get(registration.playerId).id, registration.playerId);

    const disconnected = once(server.players.get(registration.playerId).socket, 'close');
    first.close();
    await disconnected;
    assert.equal(server.players.has(registration.playerId), false);
    assert.equal(server.players.size, 1);
    const reconnected = await connectClient(t, server);
    const newRegistration = await sendCommand(reconnected, '{"command":"register"}');
    assert.notEqual(newRegistration.playerId, registration.playerId);
});

test('returns explicit errors for invalid commands and remains usable', async (t) => {
    const server = await startServer(t);
    const socket = await connectClient(t, server);
    for (const [data, code] of [
        [Buffer.from('{}'), 'INVALID_MESSAGE'],
        ['{', 'INVALID_JSON'],
        ['null', 'INVALID_COMMAND'],
        ['[]', 'INVALID_COMMAND'],
        ['{}', 'INVALID_COMMAND'],
        ['{"command":42}', 'INVALID_COMMAND'],
        ['{"command":"missing"}', 'UNKNOWN_COMMAND']
    ]) {
        const error = await sendCommand(socket, data);
        assert.deepEqual(Object.keys(error).sort(), ['code', 'command', 'message']);
        assert.equal(error.command, 'error');
        assert.equal(error.code, code);
        assert.equal(typeof error.message, 'string');
        assert.equal(server.players.size, 0);
    }
    assert.equal((await sendCommand(socket, '{"command":"register"}')).command, 'registered');
    assert.equal(server.players.size, 1);
});

test('browser client registers and receives the world from the real server', { timeout: 15000 }, async (t) => {
    const server = await startServer(t);
    const events = {};
    const window = {
        location: new URL('http://127.0.0.1:5173/'),
        addEventListener: (name, callback) => { events[name] = callback; },
        setTimeout,
        clearTimeout
    };
    let resolveRegistration;
    let rejectRegistration;
    const registered = new Promise((resolve, reject) => {
        resolveRegistration = resolve;
        rejectRegistration = reject;
    });
    const source = readFileSync(new URL('../../client/src/network/socket.js', import.meta.url), 'utf8');
    const heightMapSource = readFileSync(new URL('../../client/src/engine/components/terrain/HeightMapMesh.js', import.meta.url), 'utf8');
    window.dispatchEvent = (event) => {
        if (event.type === 'worldreceived')
            resolveRegistration();
    };
    runInNewContext(heightMapSource + source, {
        window,
        URL,
        WebSocket,
        CustomEvent: class {
            constructor(type, options = {}) {
                this.type = type;
                this.detail = options.detail;
            }
        },
        document: {
            querySelector: () => ({ content: `ws://127.0.0.1:${server.address().port}/socket` }),
            getElementById: () => null
        },
        console: {
            info() {},
            error: (...args) => rejectRegistration(new Error(args.join(' '))),
            warn: console.warn
        }
    });
    t.after(() => events.pagehide());
    await registered;
    const id = window.GameConnection.playerId;
    assert.equal(server.players.size, 1);
    assert.ok(server.players.has(id));
    const position = server.players.get(id).position;
    assert.ok(Object.values(position).every(Number.isFinite));
    const world = window.GameConnection.world;
    assert.equal(world.chunks.length, 169);
    assert.deepEqual(Object.keys(world).sort(), ['chunkSize', 'chunks', 'command', 'radius', 'revision', 'step', 'terrainOffset']);
    assert.equal(world.chunks.find(chunk => chunk.x === 0 && chunk.z === 0).heightMap[1][1], 0);
    const disconnected = once(server.players.get(id).socket, 'close');
    events.pagehide();
    await disconnected;
    assert.equal(window.GameConnection.playerId, null);
    assert.equal(window.GameConnection.world, null);
    assert.equal(server.players.size, 0);
});

test('does not allow unregistered clients to request world data', async (t) => {
    const server = await startServer(t);
    const socket = await connectClient(t, server);
    const response = await sendCommand(socket, '{"command":"getWorld","position":{"x":0,"y":0,"z":0}}');
    assert.equal(response.command, 'error');
    assert.equal(response.code, 'NOT_REGISTERED');
    assert.equal(server.players.size, 0);
});

test('jump command is authoritative and rejects physics fields before starting a grounded jump', async (t) => {
    const server = await startServer(t);
    const socket = await connectClient(t, server);
    assert.equal((await sendCommand(socket, '{"command":"jump"}')).code, 'NOT_REGISTERED');
    const { playerId } = await sendCommand(socket, '{"command":"register"}');
    assert.equal((await sendCommand(socket, '{"command":"jump","velocity":999}')).code, 'INVALID_JUMP');
    assert.equal((await sendCommand(socket, '{"command":"jump"}')).code, 'WORLD_NOT_READY');
    const world = waitForMessage(socket, m => m.command === 'world');
    socket.send('{"command":"getWorld"}');
    await world;
    const player = server.players.get(playerId);
    const ground = player.position.y;
    const jumping = waitForMessage(socket, m => m.command === 'state' && player.airborne);
    socket.send('{"command":"jump"}');
    await jumping;
    assert.ok(player.position.y > ground);
    assert.ok(player.position.y <= ground + 2);
    const landed = waitForMessage(socket, m => m.command === 'state' && !player.airborne);
    socket.send('{"command":"jump"}');
    await landed;
    assert.equal(player.position.y, ground);
});

test('authoritative movement streams terrain and nearby players without accepting teleport or speed cheats', { timeout: 30000 }, async (t) => {
    const server = await startServer(t);
    const first = await connectClient(t, server);
    const second = await connectClient(t, server);
    const a = await sendCommand(first, '{"command":"register"}');
    const b = await sendCommand(second, '{"command":"register"}');
    const worldA = waitForMessage(first, message => message.command === 'world');
    const worldB = waitForMessage(second, message => message.command === 'world');
    first.send('{"command":"getWorld"}');
    second.send('{"command":"getWorld"}');
    await Promise.all([worldA, worldB]);
    const others = await waitForMessage(first, message => message.command === 'state' && message.players.length === 1);
    assert.equal(others.players[0].id, b.playerId);
    assert.deepEqual(others.players[0].position.slice(0, 1), [8]);
    assert.equal(others.players[0].position[2], 12);
    const player = server.players.get(a.playerId);
    const start = { ...player.position };
    for (const extra of [{ position: { x: 999999, y: 100, z: 0 } }, { speed: 1000 }, { deltaTime: 9999 }, { playerId: b.playerId }]) {
        const error = waitForMessage(first, message => message.command === 'error');
        first.send(JSON.stringify({ command: 'move', forward: 1, right: 0, yaw: 0, ...extra }));
        assert.equal((await error).code, 'INVALID_MOVEMENT');
    }
    assert.deepEqual(player.position, start);
    const nextWorld = waitForMessage(first, message => message.command === 'worldDelta' && message.revision === 2);
    const began = performance.now();
    const input = JSON.stringify({ command: 'move', forward: 1, right: 0, yaw: 0 });
    // Packet frequency must not multiply displacement; the server consumes only the latest intent.
    const interval = setInterval(() => {
        for (let i = 0; i < 20; i++)
            first.send(input);
    }, 50);
    t.after(() => clearInterval(interval));
    const updatedWorld = await nextWorld;
    clearInterval(interval);
    const stop = { command: 'move', forward: 0, right: 0, yaw: 0 };
    first.send(JSON.stringify(stop));
    assert.ok(player.position.z - start.z >= 64);
    assert.ok(player.position.z - start.z <= MOVE_SPEED * (performance.now() - began) / 1000 + 3);
    assert.ok(updatedWorld.terrainOffset.every(Number.isFinite));
    assert.equal(updatedWorld.baseRevision, 1);
    assert.deepEqual(updatedWorld.chunkShift, [0, 1]);
    assert.equal(updatedWorld.chunks.length, 13);
    assert.ok(updatedWorld.chunks.every(chunk => chunk.z === 6));
    assert.equal(player.world.chunks.length, 169);
    assert.ok(JSON.stringify(updatedWorld).length < JSON.stringify(player.world).length / 8);
    assert.equal(Object.hasOwn(updatedWorld, 'position'), false);
    const newState = await waitForMessage(first, message => message.command === 'state' && message.revision === 2);
    assert.equal(newState.players[0].id, b.playerId);
    const removed = waitForMessage(first, message => message.command === 'state' && message.players.length === 0);
    second.close();
    await removed;
    assert.equal(server.players.has(b.playerId), false);
    first.send(input);
    await new Promise(resolve => setTimeout(resolve, 800));
    const stoppedPosition = { ...player.position };
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.deepEqual(player.position, stoppedPosition);
});
