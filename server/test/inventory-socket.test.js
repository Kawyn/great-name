import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import { createSocketServer } from '../src/socket-server.js';
import { createTerrainGenerator } from '../src/world/terrain-generator.js';
import { playerState, speedMultiplier, SPEED_POTION_DURATION_MS } from '../src/world/simulation.js';
import { performance } from 'node:perf_hooks';

async function start(t, options = {}) {
    const server = createSocketServer({ port: 0, ...options });
    await once(server, 'listening');
    t.after(() => close(server));
    return server;
}

test('craft commits emerald appearance without a further binder stage and broadcasts it', async t => {
    const server = await start(t), c = await client(t, server);
    const { id, journal } = await c.register();
    const p = server.players.get(id), store = server.inventoryStore;
    const item = type => store.snapshot(id).find(i => i.type === type);
    const craft = async (itemIds, requestId) => {
        c.send({ command: 'craft', itemIds, element: null, requestId });
        assert.equal((await c.next()).command, 'inventory');
        assert.equal((await c.next()).ok, true);
    };
    await craft([journal.id, item('salSmaragdinum').id], 'tablets');
    assert.equal(p.emeraldStage, 1);
    assert.equal(playerState({ ...p, anchor: { ...p.position } }, server.players).emeraldStage, 1);
    await craft([item('emeraldTablets').id, item('bitumen').id], 'binder');
    assert.equal(p.emeraldStage, 1);
    assert.equal(store.emeraldStage(id), 1);
    const observer = { id: randomUUID(), position: { ...p.position }, anchor: { ...p.position } };
    p.anchor = { ...p.position };
    assert.equal(playerState(observer, server.players).players.find(other => other.id === id).emeraldStage, 1);
    p.anchor = null;
});

test('burning the own journal broadcasts black appearance to self and nearby observers', async t => {
    const server = await start(t), c = await client(t, server);
    const { id, journal } = await c.register(), p = server.players.get(id);
    c.send({ command: 'craft', itemIds: [journal.id], element: 'fire', requestId: 'black' });
    assert.equal((await c.next()).command, 'inventory');
    assert.equal((await c.next()).ok, true);
    assert.equal(p.charred, true);
    assert.equal(server.inventoryStore.charred(id), true);
    p.anchor = { ...p.position };
    assert.equal(playerState(p, server.players).charred, true);
    const observer = { id: randomUUID(), position: { ...p.position }, anchor: { ...p.position } };
    assert.equal(playerState(observer, server.players).players.find(other => other.id === id).charred, true);
    p.anchor = null;
});

test('drinking applies only server-owned speed effects, refreshes the timer and resets on disconnect', async t => {
    const server = await start(t);
    const c = await client(t, server);
    c.send({ command: 'drink', itemId: 'missing', requestId: 'early' });
    assert.equal((await c.next()).code, 'NOT_REGISTERED');
    assert.equal((await c.next()).ok, false);
    const { id, journal } = await c.register();
    const p = server.players.get(id), store = server.inventoryStore;
    const make = () => {
        const site = store.resinSites({ x: 0, y: 0, z: 0 })[0];
        p.position = { ...site.position };
        store.pickup(id, p.position, site.id);
        store.craft(id, p.position, [journal.id], 'fire');
        const item = type => store.snapshot(id).find(item => item.type === type);
        store.craft(id, p.position, [item('ash').id], 'water');
        return store.craft(id, p.position, [item('resin').id, item('lye').id], null).producedItems[0];
    };
    const potion = make();
    c.send({ command: 'drink', itemId: potion.id, requestId: 'forged', speed: 500 });
    assert.equal((await c.next()).code, 'INVALID_INVENTORY_COMMAND');
    assert.equal((await c.next()).ok, false);
    assert.equal(speedMultiplier(p, performance.now()), 1);
    c.send({ command: 'drink', itemId: potion.id, requestId: 'drink' });
    assert.equal((await c.next()).items.some(item => item.id === potion.id), false);
    assert.equal((await c.next()).ok, true);
    assert.equal(speedMultiplier(p, performance.now()), 1.25);
    assert.ok(Math.abs(p.speedPotionUntil - performance.now() - SPEED_POTION_DURATION_MS) < 1000);
    c.send({ command: 'drink', itemId: potion.id, requestId: 'again' });
    assert.equal((await c.next()).code, 'ITEM_NOT_FOUND');
    assert.equal((await c.next()).ok, false);
    // Additional ingredients are obtained through the same authoritative collection and recipe path.
    const nextPotion = () => {
        const site = store.resinSites({ x: 0, y: 0, z: 0 })[0];
        p.position = { ...site.position };
        store.pickup(id, p.position, site.id);
        const item = type => store.snapshot(id).find(item => item.type === type);
        // A second alchemist contributes a journal, as in ordinary loot exchange.
        const donor = randomUUID();
        store.register(donor, p.position);
        store.disconnectAll([{ id: donor, position: p.position }]);
        const drop = store.drops.find(drop => drop.items.some(item => item.ownerId === donor));
        store.pickup(id, p.position, drop.id);
        const donated = store.snapshot(id).find(item => item.ownerId === donor);
        store.craft(id, p.position, [donated.id], 'fire');
        store.craft(id, p.position, [item('ash').id], 'water');
        return store.craft(id, p.position, [item('resin').id, item('lye').id], null).producedItems[0];
    };
    const refreshed = nextPotion();
    p.speedPotionUntil = performance.now() + 1000;
    c.send({ command: 'drink', itemId: refreshed.id, requestId: 'refresh' });
    await c.next();
    assert.equal((await c.next()).ok, true);
    assert.ok(p.speedPotionUntil > performance.now() + 299000);
    const essence = store.craft(id, p.position, [nextPotion().id], 'fire').producedItems[0];
    c.send({ command: 'drink', itemId: essence.id, requestId: 'essence' });
    await c.next();
    assert.equal((await c.next()).ok, true);
    assert.equal(speedMultiplier(p, performance.now()), 1.35);
    const spare = store.craft(id, p.position, [nextPotion().id], 'fire').producedItems[0];
    c.send({ command: 'drink', itemId: spare.id, requestId: 'twice' });
    assert.equal((await c.next()).code, 'ESSENCE_ALREADY_ACTIVE');
    assert.equal((await c.next()).ok, false);
    assert.ok(store.snapshot(id).some(item => item.id === spare.id));
    p.speedPotionUntil = performance.now();
    assert.equal(speedMultiplier(p, performance.now()), 1.1);
    const closed = once(p.socket, 'close');
    c.socket.close();
    await closed;
    assert.equal(server.players.has(id), false);
    const replacement = await client(t, server);
    const next = await replacement.register();
    assert.equal(speedMultiplier(server.players.get(next.id), performance.now()), 1);
    assert.notEqual(next.id, id);
});

test('resin pickup uses authoritative range and permits only one winner across clients', async t => {
    const server = await start(t);
    const first = await client(t, server), second = await client(t, server);
    const a = await first.register(), b = await second.register();
    const site = server.inventoryStore.resinSites({ x: 0, y: 0, z: 0 })[0];
    assert.ok(site);
    first.send({ command: 'pickup', dropId: site.id, position: site.position });
    assert.equal((await first.next()).code, 'INVALID_INVENTORY_COMMAND');
    server.players.get(a.id).position = { ...site.position, x: site.position.x + 7 };
    first.send({ command: 'pickup', dropId: site.id });
    assert.equal((await first.next()).code, 'RESOURCE_TOO_FAR');
    server.players.get(a.id).position = { ...site.position };
    server.players.get(b.id).position = { ...site.position };
    first.send({ command: 'pickup', dropId: site.id });
    const items = (await first.next()).items;
    assert.equal(items.filter(item => item.type === 'resin').length, 1);
    second.send({ command: 'pickup', dropId: site.id });
    assert.equal((await second.next()).code, 'RESOURCE_DEPLETED');
    assert.equal(server.inventoryStore.snapshot(b.id).length, 3);
});

test('stone placement and reading validate command fields, commit before acknowledging, and never transfer the mounted text', async t => {
    const server = await start(t);
    const c = await client(t, server);
    const { id, journal } = await c.register();
    const player = server.players.get(id);
    const site = server.inventoryStore.stoneSites({ x: 0, y: 0, z: 0 })[0];
    assert.ok(site);
    player.position = Object.fromEntries(['x', 'y', 'z'].map((key, index) => [key, site.position[index]]));
    const item = type => server.inventoryStore.snapshot(id).find(item => item.type === type);
    server.inventoryStore.append(id, player.position, journal.id, '<script>literal text</script>');
    server.inventoryStore.craft(id, player.position, [journal.id, item('salSmaragdinum').id], null);
    server.inventoryStore.craft(id, player.position, [item('emeraldTablets').id, item('bitumen').id], null);
    const tablet = item('preparedTablet');
    c.send({ command: 'placeInscription', itemId: tablet.id, stoneId: site.stoneId, position: player.position, requestId: 'forged' });
    assert.equal((await c.next()).code, 'INVALID_INVENTORY_COMMAND');
    assert.equal((await c.next()).ok, false);
    assert.equal(item('preparedTablet').id, tablet.id);
    c.send({ command: 'placeInscription', itemId: tablet.id, stoneId: site.stoneId, requestId: 'place' });
    assert.deepEqual((await c.next()).items, []);
    assert.deepEqual(await c.next(), { command: 'operationResult', requestId: 'place', ok: true });
    c.send({ command: 'readInscription', stoneId: site.stoneId, requestId: 'read' });
    const read = await c.next();
    assert.equal(read.command, 'operationResult');
    assert.equal(read.requestId, 'read');
    assert.equal(read.result.id, tablet.id);
    assert.deepEqual(read.result.entries, tablet.entries);
    assert.deepEqual(server.inventoryStore.snapshot(id), []);
    c.send({ command: 'placeInscription', itemId: tablet.id, stoneId: site.stoneId, requestId: 'twice' });
    assert.equal((await c.next()).code, 'STONE_OCCUPIED');
    assert.equal((await c.next()).ok, false);
    player.position.x += 7;
    c.send({ command: 'readInscription', stoneId: site.stoneId, requestId: 'distant' });
    assert.equal((await c.next()).code, 'STONE_TOO_FAR');
    assert.equal((await c.next()).ok, false);
});
async function close(server) {
    if (server.address())
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('own-tablet departure starts on authoritative distance, locks commands and commits one permanent ending', async t => {
    const server = await start(t);
    const c = await client(t, server);
    const { id, journal } = await c.register();
    const store = server.inventoryStore, player = server.players.get(id);
    const site = store.stoneSites({ x: 0, y: 0, z: 0 })[0];
    const position = Object.fromEntries(['x', 'y', 'z'].map((key, axis) => [key, site.position[axis]]));
    player.position = { ...position };
    const item = type => store.snapshot(id).find(item => item.type === type);
    store.craft(id, position, [journal.id, item('salSmaragdinum').id], null);
    store.craft(id, position, [item('emeraldTablets').id, item('bitumen').id], null);
    store.placeInscription(id, position, item('preparedTablet').id, site.stoneId);
    player.position.x += 18.1;
    player.anchor = { ...player.position };
    const nextCommand = async command => {
        for (let count = 0; count < 60; count++) {
            const message = await c.next();
            if (message.command === command)
                return message;
        }
        throw new Error(`Missing ${command}`);
    };
    const started = await nextCommand('journeyStarted');
    assert.equal(started.stoneId, site.stoneId);
    c.send({ command: 'jump' });
    assert.equal((await nextCommand('error')).code, 'DEPARTURE_ACTIVE');
    c.send({ command: 'craft', itemIds: [], element: 'fire', requestId: 'blocked' });
    assert.equal((await nextCommand('error')).code, 'DEPARTURE_ACTIVE');
    assert.equal((await nextCommand('operationResult')).ok, false);
    player.departure.startedAt = performance.now() - 20500;
    assert.equal((await nextCommand('journeyEnded')).stoneId, site.stoneId);
    assert.equal(player.departure.ended, true);
    assert.ok(store.stoneSites(position).find(entry => entry.stoneId === site.stoneId).scarf);
    const count = store.drops.length;
    const closed = once(player.socket, 'close');
    c.socket.close();
    await closed;
    assert.equal(store.drops.length, count, 'closing the completed view must not drop a second inventory');
    assert.equal(server.players.has(id), false);
});

test('two clients can collect one bundle partially without exceeding capacity or duplicating items', async t => {
    const server = await start(t);
    const first = await client(t, server), second = await client(t, server);
    const a = await first.register(), b = await second.register();
    const store = server.inventoryStore, position = server.players.get(a.id).position;
    server.players.get(b.id).position = { ...position };
    const donate = () => {
        const donor = randomUUID();
        store.register(donor, position);
        store.disconnectAll([{ id: donor, position }]);
        return store.drops.find(drop => drop.items.some(item => item.ownerId === donor));
    };
    for (let index = 0; index < 9; index++)
        store.pickup(a.id, position, donate().id);
    assert.equal(store.snapshot(a.id).length, 30);
    const bundle = donate();
    first.send({ command: 'pickup', dropId: bundle.id });
    const received = (await first.next()).items;
    assert.equal(received.length, 32);
    assert.deepEqual(store.drops.find(drop => drop.id === bundle.id).items, bundle.items.slice(2));
    first.send({ command: 'pickup', dropId: bundle.id });
    assert.equal((await first.next()).code, 'INVENTORY_FULL');
    second.send({ command: 'pickup', dropId: bundle.id });
    const rest = (await second.next()).items;
    assert.equal(rest.length, 4);
    assert.equal(rest[3].id, bundle.items[2].id);
    assert.equal(store.drops.some(drop => drop.id === bundle.id), false);
    assert.ok(rest.every(item => !received.some(other => other.id === item.id)));
});

async function client(t, server) {
    const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/socket`);
    t.after(() => socket.terminate());
    const queue = [];
    const waiters = [];
    socket.on('message', data => {
        queue.push(JSON.parse(data.toString()));
        waiters.shift()?.();
    });
    await once(socket, 'open');
    return {
        socket,
        send(message) { socket.send(JSON.stringify(message)); },
        async next() {
            if (!queue.length) {
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error('Missing server response.')), 15000);
                    waiters.push(() => { clearTimeout(timer); resolve(); });
                });
            }
            return queue.shift();
        },
        async register() {
            this.send({ command: 'register' });
            const registration = await this.next();
            const inventory = await this.next();
            assert.equal(registration.command, 'registered');
            assert.equal(inventory.command, 'inventory');
            return { id: registration.playerId, journal: inventory.items[0] };
        }
    };
}

test('drop and burn commands validate ownership and fields, and acknowledge only committed inventories', async t => {
    const server = await start(t);
    const c = await client(t, server);
    c.send({ command: 'inventoryDrop', itemId: 'missing', requestId: 'unregistered' });
    assert.equal((await c.next()).code, 'NOT_REGISTERED');
    assert.equal((await c.next()).ok, false);
    const { id, journal } = await c.register();
    c.send({ command: 'craft', itemIds: [journal.id], element: 'fire', producedTypes: ['lye'], requestId: 'forged' });
    assert.equal((await c.next()).code, 'INVALID_INVENTORY_COMMAND');
    assert.equal((await c.next()).ok, false);
    c.send({ command: 'inventoryDrop', itemId: journal.id, requestId: 'drop' });
    assert.equal((await c.next()).items[0].type, 'salSmaragdinum');
    assert.deepEqual(await c.next(), { command: 'operationResult', requestId: 'drop', ok: true });
    assert.equal(server.inventoryStore.snapshot(id).length, 2);
    assert.equal(server.inventoryStore.drops[0].items[0].id, journal.id);
    c.send({ command: 'pickup', dropId: server.inventoryStore.drops[0].id });
    assert.equal((await c.next()).items.find(item => item.id === journal.id).isNew, true);
    c.send({ command: 'craft', itemIds: [journal.id], element: 'fire', requestId: 'burn' });
    const ashSnapshot = await c.next();
    assert.equal(ashSnapshot.items.length, 3);
    const ash = ashSnapshot.items.find(item => item.type === 'ash');
    assert.equal(ash.isNew, true);
    assert.equal(ash.burnable, false);
    assert.equal(server.inventoryStore.snapshot(id).find(item => item.type === 'ash').id, ash.id);
    const result = await c.next();
    assert.equal(result.command, 'operationResult');
    assert.equal(result.requestId, 'burn');
    assert.equal(result.ok, true);
    assert.equal(result.result.outcome, 'ashes');
    assert.deepEqual(result.result.consumedIds, [journal.id]);
    assert.equal(result.result.producedItems[0].id, ash.id);
    assert.equal(server.inventoryStore.drops.length, 0);
    c.send({ command: 'craft', itemIds: [journal.id], element: 'fire', requestId: 'duplicate' });
    assert.equal((await c.next()).code, 'ITEM_NOT_FOUND');
    assert.equal((await c.next()).ok, false);
    assert.equal(server.inventoryStore.snapshot(id).length, 3, 'duplicate burn never grants more ash');
});

test('craft socket rejects malformed and foreign selections and reports unchanged results without consuming inputs', async t => {
    const server = await start(t);
    const c = await client(t, server);
    c.send({ command: 'craft', itemIds: ['missing'], element: 'fire', requestId: 'early' });
    assert.equal((await c.next()).code, 'NOT_REGISTERED');
    assert.equal((await c.next()).ok, false);
    const { journal } = await c.register();
    for (const payload of [
        { itemIds: [journal.id, journal.id], element: null },
        { itemIds: [journal.id], element: 'void' },
        { itemIds: [randomUUID()], element: 'fire' },
        { itemIds: [journal.id], element: 'fire', ownerId: journal.ownerId }
    ]) {
        c.send({ command: 'craft', ...payload, requestId: 'invalid' });
        assert.equal((await c.next()).command, 'error');
        assert.equal((await c.next()).ok, false);
    }
    c.send({ command: 'craft', itemIds: [journal.id], element: 'water', requestId: 'water' });
    assert.equal((await c.next()).items[0].id, journal.id);
    const result = await c.next();
    assert.equal(result.ok, true);
    assert.deepEqual(result.result, { outcome: 'dried', consumedIds: [], producedItems: [] });
});

test('journal responses follow committed snapshots; failures include matching results and safely retain literal text', async t => {
    const directory = resolve('data', `test-${randomUUID()}`);
    mkdirSync(directory, { recursive: true });
    let server;
    let restarted;
    t.after(async () => {
        if (restarted) await close(restarted);
        if (server) await close(server);
        rmSync(directory, { force: true, recursive: true });
    });
    const dataFile = resolve(directory, 'world.json');
    server = await start(t, { dataFile });
    const c = await client(t, server);
    c.send({ command: 'journalAppend', itemId: 'missing', text: 'x', requestId: 'unregistered' });
    assert.equal((await c.next()).code, 'NOT_REGISTERED');
    assert.deepEqual(await c.next(), {
        command: 'operationResult', requestId: 'unregistered', ok: false,
        message: 'Register before managing inventory.'
    });
    const { id, journal } = await c.register();
    assert.equal(journal.ownerId, id);
    assert.deepEqual(journal.entries, []);
    assert.equal(journal.isNew, false);
    assert.equal(journal.burnable, true);
    const text = '<img src=x onerror=alert(1)>\n\tliteral';
    c.send({ command: 'journalAppend', itemId: journal.id, text, requestId: 'append' });
    const updated = await c.next();
    assert.equal(updated.command, 'inventory');
    assert.equal(updated.items[0].entries[0].text, text);
    assert.equal(JSON.parse(readFileSync(dataFile, 'utf8')).players[0].items[0].entries[0].text, text);
    assert.deepEqual(await c.next(), { command: 'operationResult', requestId: 'append', ok: true });
    c.send({ command: 'journalStrike', itemId: journal.id, entryIndex: 0, start: 0, end: 4, requestId: 'strike' });
    assert.deepEqual((await c.next()).items[0].entries[0].strikes, [[0, 4]]);
    assert.equal((await c.next()).ok, true);
    for (const command of [
        { command: 'journalAppend', text: 'bad\u0000' },
        { command: 'journalAppend', text: 'bad', ownerId: id },
        { command: 'journalStrike', entryIndex: 0, start: -1, end: 9 }
    ]) {
        c.send({ ...command, itemId: journal.id, requestId: 'invalid' });
        assert.equal((await c.next()).command, 'error');
        const result = await c.next();
        assert.equal(result.command, 'operationResult');
        assert.equal(result.requestId, 'invalid');
        assert.equal(result.ok, false);
    }
    c.send({ command: 'inventorySeen', itemId: journal.id });
    assert.equal((await c.next()).items[0].isNew, false);
    c.send({ command: 'register' });
    assert.equal((await c.next()).playerId, id);
    assert.equal((await c.next()).items.length, 3);
    const second = await client(t, server);
    await second.register();
    const heldPosition = { ...server.players.get(id).position };
    await close(server);
    restarted = await start(t, { dataFile });
    assert.equal(restarted.inventoryStore.drops.length, 2);
    const drop = restarted.inventoryStore.drops[0];
    assert.deepEqual(drop.position, heldPosition);
    assert.equal(drop.items[0].entries[0].text, text);
    assert.deepEqual(drop.items[0].entries[0].strikes, [[0, 4]]);
    assert.equal(drop.items[0].isNew, false);
});

test('disconnect loses journal into one bundle; server distance and concurrent pickups prevent duplication and owner forgery', async t => {
    const server = await start(t);
    const owner = await client(t, server);
    const a = await owner.register();
    const first = await client(t, server);
    const second = await client(t, server);
    const b = await first.register();
    const c = await second.register();
    const originalPosition = { ...server.players.get(a.id).position };
    const disconnected = once(server.players.get(a.id).socket, 'close');
    owner.socket.close();
    await disconnected;
    const drop = server.inventoryStore.drops[0];
    assert.equal(drop.items.length, 3);
    assert.deepEqual(drop.position, originalPosition);
    first.send({ command: 'pickup', dropId: drop.id, position: originalPosition });
    assert.equal((await first.next()).code, 'INVALID_INVENTORY_COMMAND');
    first.send({ command: 'pickup', dropId: drop.id });
    assert.equal((await first.next()).code, 'DROP_TOO_FAR');
    server.players.get(b.id).position = { ...originalPosition, x: originalPosition.x + 6 };
    server.players.get(c.id).position = { ...originalPosition };
    first.send({ command: 'pickup', dropId: drop.id });
    second.send({ command: 'pickup', dropId: drop.id });
    const results = await Promise.all([first.next(), second.next()]);
    assert.equal(results.filter(result => result.command === 'inventory').length, 1);
    assert.equal(results.find(result => result.command === 'error').code, 'DROP_NOT_FOUND');
    assert.equal(server.inventoryStore.drops.length, 0);
    assert.equal([...server.players.keys()].flatMap(id => server.inventoryStore.snapshot(id))
        .filter(item => item.id === a.journal.id).length, 1);
    const winner = results[0].command === 'inventory' ? first : second;
    const winnerId = winner === first ? b.id : c.id;
    winner.send({ command: 'journalAppend', itemId: a.journal.id, text: 'tamper', requestId: 'forged' });
    assert.equal((await winner.next()).code, 'JOURNAL_FORBIDDEN');
    assert.equal((await winner.next()).ok, false);
    const winnerClosed = once(server.players.get(winnerId).socket, 'close');
    winner.socket.close();
    await winnerClosed;
    assert.equal(server.inventoryStore.drops.length, 1);
    assert.equal(server.inventoryStore.drops[0].items.length, 6);
});

test('drop state exposes relative coordinates and count only, bounded to 384 meters', () => {
    const position = { x: 5000, y: 20, z: -9000 };
    const player = { id: randomUUID(), position, anchor: { ...position }, revision: 1 };
    const drop = { id: randomUUID(), position: { ...position, x: position.x + 384 }, items: [{ id: 'private' }] };
    const distant = { ...drop, id: randomUUID(), position: { ...position, y: position.y + 385 } };
    assert.deepEqual(playerState(player, new Map([[player.id, player]]), [drop, distant]).drops,
        [{ id: drop.id, position: [384, 0, 0], count: 1 }]);
    const crowded = Array.from({ length: 1001 }, (_, index) => ({
        ...drop, id: `drop-${index}`, position: { ...position, x: position.x + index / 10 }
    })).reverse();
    const visible = playerState(player, new Map([[player.id, player]]), crowded).drops;
    assert.equal(visible.length, 1000);
    assert.equal(visible[0].id, 'drop-0');
    assert.equal(visible.at(-1).id, 'drop-999');
});

test('storage failure sends error and failed journal result without optimistic mutation', async t => {
    const directory = resolve('data', `test-${randomUUID()}`);
    mkdirSync(directory, { recursive: true });
    let server;
    t.after(async () => {
        if (server) await close(server);
        rmSync(directory, { force: true, recursive: true });
    });
    const dataFile = resolve(directory, 'world.json');
    server = await start(t, { dataFile });
    const c = await client(t, server);
    const { id, journal } = await c.register();
    const persisted = readFileSync(dataFile, 'utf8');
    rmSync(dataFile);
    mkdirSync(dataFile);
    try {
        c.send({ command: 'journalAppend', itemId: journal.id, text: 'uncommitted', requestId: 'write-failed' });
        assert.equal((await c.next()).code, 'STORAGE_FAILED');
        const result = await c.next();
        assert.equal(result.command, 'operationResult');
        assert.equal(result.requestId, 'write-failed');
        assert.equal(result.ok, false);
        assert.deepEqual(server.inventoryStore.snapshot(id)[0].entries, []);
    }
    finally {
        rmSync(dataFile, { recursive: true });
        writeFileSync(dataFile, persisted);
    }
});

test('nonmovement rate limit reports failed journal operations; oversized payloads close without mutation', async t => {
    const server = await start(t);
    const c = await client(t, server);
    const { id, journal } = await c.register();
    for (let i = 0; i < 40; i++)
        c.send({ command: 'journalAppend', itemId: journal.id, text: 'x\u0000', requestId: `rate-${i}` });
    let limited = false;
    for (let i = 0; i < 40; i++) {
        const error = await c.next();
        const result = await c.next();
        limited ||= error.code === 'RATE_LIMIT';
        assert.equal(result.ok, false);
        assert.equal(result.requestId, `rate-${i}`);
    }
    assert.equal(limited, true);
    assert.deepEqual(server.inventoryStore.snapshot(id)[0].entries, []);
    const oversized = await client(t, server);
    const registered = await oversized.register();
    const closed = once(oversized.socket, 'close');
    const serverClosed = new Promise(resolve => server.players.get(registered.id).socket.once('close', resolve));
    oversized.send({ command: 'journalAppend', itemId: registered.journal.id, text: 'x'.repeat(40 * 1024), requestId: 'huge' });
    assert.equal((await closed)[0], 1009);
    await serverClosed;
    assert.deepEqual(server.inventoryStore.drops[0].items[0].entries, []);
});

test('persisted seed drives registration height, simulation, worker terrain, and stones across restart', { timeout: 20000 }, async t => {
    const directory = resolve('data', `test-${randomUUID()}`);
    mkdirSync(directory, { recursive: true });
    let first;
    let restarted;
    t.after(async () => {
        if (restarted) await close(restarted);
        if (first) await close(first);
        rmSync(directory, { force: true, recursive: true });
    });
    const dataFile = resolve(directory, 'world.json');
    const seed = 937;
    const terrain = createTerrainGenerator(seed);
    first = await start(t, { dataFile, seed });
    const c = await client(t, first);
    const { id } = await c.register();
    const player = first.players.get(id);
    const position = { ...player.position };
    assert.equal(position.y, terrain.getHeight(position.x, position.z));
    const excluded = [];
    for (let x = -6; x <= 6; x++)
        for (let z = -6; z <= 6; z++)
            if (x !== 0 || z !== 0)
                excluded.push({ x, z });
    const expected = terrain.generateWorld(position, excluded).chunks[0];
    c.send({ command: 'getWorld' });
    const world = await c.next();
    assert.equal(world.command, 'world');
    assert.deepEqual(world.chunks.find(chunk => chunk.x === 0 && chunk.z === 0), expected);
    assert.equal((await c.next()).command, 'state');
    c.send({ command: 'move', forward: 1, right: 0, yaw: 0 });
    await c.next();
    assert.equal(player.position.y, terrain.getHeight(player.position.x, player.position.z));
    await close(first);
    restarted = await start(t, { dataFile, seed: 12 });
    assert.equal(restarted.inventoryStore.seed, seed);
    const other = await client(t, restarted);
    const registration = await other.register();
    assert.notEqual(registration.id, id);
    assert.deepEqual(restarted.players.get(registration.id).position, position);
    other.send({ command: 'getWorld' });
    const repeat = await other.next();
    assert.deepEqual(repeat.chunks.find(chunk => chunk.x === 0 && chunk.z === 0), expected);
});
