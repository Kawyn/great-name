const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(path.join(__dirname, '..', 'src', 'network', 'socket.js'), 'utf8');
const heightMapSource = readFileSync(path.join(__dirname, '..', 'src', 'engine', 'components', 'terrain', 'HeightMapMesh.js'), 'utf8');

function loadClient(pageUrl, configuredUrl = '', status = null) {
    const sockets = [];
    const timers = new Map();
    const events = {};
    const logs = [];
    const dispatched = [];

    class MockWebSocket {
        static OPEN = 1;
        constructor(url) {
            this.url = url;
            this.events = {};
            this.sent = [];
            this.readyState = 1;
            sockets.push(this);
        }
        addEventListener(name, listener) {
            this.events[name] = listener;
        }
        send(data) {
            this.sent.push(JSON.parse(data));
        }
        close() {
            this.closed = true;
            this.events.close();
        }
    }

    const window = {
        location: new URL(pageUrl),
        addEventListener: (name, listener) => { events[name] = listener; },
        setTimeout: (callback, delay) => {
            timers.set(1, { callback, delay });
            return 1;
        },
        clearTimeout: (id) => timers.delete(id)
    };
    window.dispatchEvent = (event) => dispatched.push(event);
    runInNewContext(heightMapSource + source, {
        URL,
        CustomEvent: class {
            constructor(type, options = {}) {
                this.type = type;
                this.detail = options.detail;
            }
        },
        WebSocket: MockWebSocket,
        document: {
            querySelector: () => ({ content: configuredUrl }),
            getElementById: () => status
        },
        console: {
            info: (...args) => logs.push(['info', ...args]),
            warn: (...args) => logs.push(['warn', ...args]),
            error: (...args) => logs.push(['error', ...args])
        },
        window
    });
    return { sockets, timers, events, logs, state: window.GameConnection, dispatched };
}

test('connects to the page host without carrying its path or query', () => {
    const { sockets } = loadClient('http://localhost:5173/index.html?test=1#menu');
    assert.equal(sockets[0].url, 'ws://localhost:3001/socket');
});

test('network updates preserve visible scene initialization errors', () => {
    const status = {
        hidden: false,
        textContent: 'Resource load failed',
        getAttribute: name => name === 'data-scene-error' ? 'true' : null
    };
    const { sockets } = loadClient('http://localhost:5173/', '', status);
    sockets[0].events.open();
    sockets[0].events.close();
    assert.equal(status.textContent, 'Resource load failed');
    assert.equal(status.hidden, false);
});

const playerId = 'ac7700f7-2e7a-4dab-85b2-93cc879d8367';

test('requests registration on open and stores the server-assigned player ID', () => {
    const { sockets, state } = loadClient('http://localhost:5173/');
    assert.equal(state.playerId, null);
    assert.deepEqual(sockets[0].sent, []);
    sockets[0].events.open();
    assert.deepEqual(sockets[0].sent, [{ command: 'register' }]);
    sockets[0].events.message({ data: JSON.stringify({ command: 'registered', playerId }) });
    assert.equal(state.playerId, playerId);
    assert.deepEqual(sockets[0].sent, [{ command: 'register' }, { command: 'getWorld' }]);
});

test('clears registration on disconnect and registers again on a new connection', () => {
    const { sockets, state, timers } = loadClient('http://localhost:5173/');
    sockets[0].events.open();
    sockets[0].events.message({ data: JSON.stringify({ command: 'registered', playerId }) });
    sockets[0].events.close();
    assert.equal(state.playerId, null);
    timers.get(1).callback();
    sockets[1].events.open();
    assert.deepEqual(sockets[1].sent, [{ command: 'register' }]);
    const newId = 'e792aebc-3236-4d29-8b4b-0796a7ea0740';
    sockets[1].events.message({ data: JSON.stringify({ command: 'registered', playerId: newId }) });
    sockets[0].events.message({ data: JSON.stringify({ command: 'registered', playerId }) });
    sockets[0].events.close();
    assert.equal(state.playerId, newId);
});

test('reports malformed responses and server errors without accepting an ID', () => {
    const { sockets, state, logs } = loadClient('http://localhost:5173/');
    for (const data of ['{', 'null', '[]', '{}', '{"command":"registered","playerId":12}',
        '{"command":"registered","playerId":"invalid"}',
        '{"command":"error","code":"INVALID_COMMAND","message":"Bad command"}', new ArrayBuffer(0)]) {
        sockets[0].events.message({ data });
    }
    assert.equal(state.playerId, null);
    assert.equal(logs.length, 8);
    assert.ok(logs.every((entry) => entry[0] === 'error'));
});

test('keeps the registered ID on duplicate responses and rejects a changed ID', () => {
    const { sockets, state, logs, events } = loadClient('http://localhost:5173/');
    const respond = (id) => sockets[0].events.message({
        data: JSON.stringify({ command: 'registered', playerId: id })
    });
    respond(playerId);
    respond(playerId);
    assert.deepEqual(sockets[0].sent, [{ command: 'getWorld' }]);
    respond('e792aebc-3236-4d29-8b4b-0796a7ea0740');
    assert.equal(state.playerId, playerId);
    assert.equal(logs.at(-1)[0], 'error');
    events.pagehide();
    assert.equal(state.playerId, null);
    respond(playerId);
    assert.equal(state.playerId, null);
});

function worldFixture() {
    const chunks = [];
    for (let x = -6; x <= 6; x++) {
        for (let z = -6; z <= 6; z++) {
            chunks.push({
                x, z,
                heightMap: Array.from({ length: 35 }, () => Array(35).fill(0)),
                biomeWeights: Array.from({ length: 33 }, () => Array.from({ length: 33 }, () => [1, 0, 0, 0]))
            });
        }
    }
    return { command: 'world', chunkSize: 64, step: 2, radius: 6, chunks, revision: 1, terrainOffset: [0, 0, 0] };
}

test('receives validated terrain and clears it on disconnection', () => {
    const { sockets, state, dispatched, events } = loadClient('http://localhost:5173/');
    sockets[0].events.message({ data: JSON.stringify({ command: 'registered', playerId }) });
    const world = worldFixture();
    sockets[0].events.message({ data: JSON.stringify(world) });
    assert.equal(state.world.chunks.length, 169);
    assert.equal(dispatched.at(-1).type, 'worldreceived');
    assert.equal(dispatched.at(-1).detail, state.world);
    events.pagehide();
    assert.equal(state.world, null);
    assert.equal(dispatched.at(-1).type, 'worldcleared');
});

test('rejects unsolicited or malformed terrain without changing the current snapshot', () => {
    const { sockets, state, logs, dispatched } = loadClient('http://localhost:5173/');
    const world = worldFixture();
    sockets[0].events.message({ data: JSON.stringify(world) });
    assert.equal(state.world, null);
    sockets[0].events.message({ data: JSON.stringify({ command: 'registered', playerId }) });
    sockets[0].events.message({ data: JSON.stringify(world) });
    const accepted = state.world;
    world.chunks[0].heightMap = [[0]];
    world.revision = 2;
    sockets[0].events.message({ data: JSON.stringify(world) });
    assert.equal(state.world, accepted);
    assert.equal(dispatched.length, 1);
    assert.equal(logs.filter(entry => entry[0] === 'error').length, 2);
});

test('sends only input, applies matching simulation revisions, and clears state on disconnect', () => {
    const { sockets, state, events, dispatched, logs } = loadClient('http://localhost:5173/');
    state.sendInput(1, 0, 0);
    state.sendJump();
    assert.equal(sockets[0].sent.length, 0);
    sockets[0].events.message({ data: JSON.stringify({ command: 'registered', playerId }) });
    sockets[0].events.message({ data: JSON.stringify(worldFixture()) });
    state.sendJump();
    assert.deepEqual(sockets[0].sent.at(-1), { command: 'jump' });
    state.sendInput(1, -1, 45);
    assert.deepEqual(sockets[0].sent.at(-1), { command: 'move', forward: 1, right: -1, yaw: 45 });
    state.sendInput(100, 0, 0);
    assert.equal(logs.at(-1)[0], 'error');
    const otherId = 'e792aebc-3236-4d29-8b4b-0796a7ea0740';
    const update = { command: 'state', revision: 1, terrainOffset: [-3, 1, 0],
        players: [{ id: otherId, position: [8, 0, 12] }] };
    sockets[0].events.message({ data: JSON.stringify(update) });
    assert.equal(state.state.players[0].id, otherId);
    assert.equal(dispatched.at(-1).type, 'networkstate');
    const accepted = state.state;
    sockets[0].events.message({ data: JSON.stringify({ ...update, revision: 0 }) });
    assert.equal(state.state, accepted);
    sockets[0].events.message({ data: JSON.stringify({ ...update, players: [...update.players, ...update.players] }) });
    assert.equal(state.state, accepted);
    assert.equal(logs.at(-1)[0], 'error');
    events.pagehide();
    assert.equal(state.state, null);
});

test('merges incremental terrain atomically, retaining maps and rejecting missing, duplicate or stale chunks', () => {
    const { sockets, state, logs, dispatched } = loadClient('http://localhost:5173/');
    const receive = message => sockets[0].events.message({ data: JSON.stringify(message) });
    receive({ command: 'registered', playerId });
    receive(worldFixture());
    const old = state.world;
    const center = old.chunks.find(chunk => chunk.x === 0 && chunk.z === 0);
    const delta = {
        command: 'worldDelta', chunkSize: 64, step: 2, radius: 6,
        revision: 2, baseRevision: 1, chunkShift: [0, 1], terrainOffset: [0, 0, 64],
        chunks: old.chunks.filter(chunk => chunk.z === 6)
    };
    for (const invalid of [
        { ...delta, chunks: delta.chunks.slice(1) },
        { ...delta, chunks: [...delta.chunks, delta.chunks[0]] },
        { ...delta, baseRevision: 99 }, { ...delta, chunkShift: [0.5, 1] }
    ]) {
        receive(invalid);
        assert.equal(state.world, old);
        assert.equal(logs.at(-1)[0], 'error');
    }
    receive(delta);
    assert.equal(state.world.revision, 2);
    assert.equal(state.world.chunks.length, 169);
    assert.equal(state.world.chunks.find(chunk => chunk.x === 0 && chunk.z === -1).heightMap, center.heightMap);
    assert.equal(dispatched.at(-1).type, 'worldreceived');
    const accepted = state.world;
    receive(delta);
    assert.equal(state.world, accepted);
    const diagonal = {
        ...delta, baseRevision: 2, revision: 3, chunkShift: [-1, -1],
        chunks: worldFixture().chunks.filter(chunk => chunk.x === -6 || chunk.z === -6)
    };
    receive(diagonal);
    assert.equal(state.world.revision, 3);
    assert.equal(state.world.chunks.length, 169);
});

test('uses secure sockets for HTTPS and supports a configured endpoint', () => {
    assert.equal(loadClient('https://example.com/').sockets[0].url, 'wss://example.com:3001/socket');
    assert.equal(
        loadClient('https://example.com/', 'wss://api.example.com/socket').sockets[0].url,
        'wss://api.example.com/socket'
    );
});

test('reports connection events and reconnects after disconnection', () => {
    const { sockets, timers, logs } = loadClient('http://localhost:5173/');
    const error = { message: 'Connection refused' };
    sockets[0].events.open();
    sockets[0].events.error(error);
    sockets[0].events.close();
    assert.deepEqual(logs.map((entry) => entry[0]), ['info', 'error', 'warn']);
    assert.equal(logs[1][2], error);
    assert.equal(timers.get(1).delay, 2000);
    timers.get(1).callback();
    assert.equal(sockets.length, 2);
});

test('closes the socket and cancels reconnection when leaving the page', () => {
    const { sockets, timers, events } = loadClient('http://localhost:5173/');
    sockets[0].events.close();
    events.pagehide();
    assert.equal(timers.size, 0);
    assert.equal(sockets[0].closed, true);
});

test('restores the connection when returning from the browser page cache', () => {
    const { sockets, timers, events } = loadClient('http://localhost:5173/');
    events.pageshow();
    assert.equal(sockets.length, 1);
    events.pagehide();
    events.pageshow();
    assert.equal(sockets.length, 2);
    sockets[0].events.close();
    assert.equal(timers.size, 0);
});
