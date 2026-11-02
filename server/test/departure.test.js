import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createInventoryStore } from '../src/inventory-store.js';
import { beginDeparture, DEPARTURE_END_SECONDS } from '../src/world/departure.js';
import { advancePlayer, playerState } from '../src/world/simulation.js';

function mounted(t) {
    const directory = mkdtempSync(join(tmpdir(), 'great-name-departure-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const dataFile = join(directory, 'world.json');
    const store = createInventoryStore({ dataFile, seed: 12, spawn: { x: 0, y: 0, z: 0 } });
    const id = randomUUID(), foreign = randomUUID();
    const site = store.stoneSites({ x: 0, y: 0, z: 0 })[0];
    const position = Object.fromEntries(['x', 'y', 'z'].map((key, axis) => [key, site.position[axis]]));
    store.register(id, position);
    store.register(foreign, position);
    const item = type => store.snapshot(id).find(item => item.type === type);
    const journal = item('journal');
    store.append(id, position, journal.id, 'These words remain.');
    store.strike(id, position, journal.id, 0, 0, 5);
    store.craft(id, position, [journal.id, item('salSmaragdinum').id], null);
    store.craft(id, position, [item('emeraldTablets').id, item('bitumen').id], null);
    const donor = randomUUID();
    store.register(donor, position);
    store.disconnectAll([{ id: donor, position }]);
    store.pickup(id, position, store.drops[0].id);
    const leftovers = store.snapshot(id).filter(item => item.type !== 'preparedTablet').map(item => item.id);
    store.placeInscription(id, position, item('preparedTablet').id, site.stoneId);
    assert.equal(store.emeraldStage(id), 1, 'mounting the tablet must not undo the alchemist transformation');
    return { store, dataFile, id, foreign, site, position, leftovers };
}

test('departure requires the own mounted journal, the 18m threshold and a grounded alchemist', t => {
    const { store, id, foreign, site, position } = mounted(t);
    assert.equal(store.departureSite(foreign), null);
    const anchor = { ...position }, player = { anchor, position: { ...position, x: position.x + 17.99 } };
    const own = store.departureSite(id);
    assert.equal(beginDeparture(player, own, 1000), null);
    player.position.x = position.x + 18;
    player.airborne = true;
    assert.equal(beginDeparture(player, own, 1000), null);
    player.airborne = false;
    const start = beginDeparture(player, own, 1000);
    assert.equal(start.stoneId, site.stoneId);
    assert.deepEqual(start.direction, [1, 0, 0]);
    assert.equal(beginDeparture(player, own, 2000), null);
});

test('cutscene entry keeps normal and potion speed immediately, while rejecting changes of direction', () => {
    for (const multiplier of [1, 1.35]) {
        const player = { id: randomUUID(), position: { x: 18, y: 0, z: 0 }, anchor: { x: 0, y: 0, z: 0 },
            speedEssence: multiplier > 1, speedPotionUntil: multiplier > 1 ? 100000 : 0 };
        beginDeparture(player, { stoneId: `stone-${'a'.repeat(32)}`, position: { x: 0, y: 0, z: 0 } }, 0);
        player.input = { forward: -1, right: 1, yaw: -90 };
        player.inputReceivedAt = 5000;
        advancePlayer(player, 0.1, 1000, () => 0);
        assert.ok(Math.abs(player.position.x - (18 + 1.3 * multiplier)) < 1e-8, 'no pause while the camera travels');
        advancePlayer(player, 0.1, 5000, () => 0);
        assert.ok(Math.abs(player.position.x - (18 + 2.6 * multiplier)) < 1e-8);
        assert.ok(Math.abs(player.position.z) < 1e-8);
        const end = { ...player.position };
        advancePlayer(player, 0.1, 12000, () => 0);
        assert.deepEqual(player.position, end);
        player.departure.ended = true;
        const observer = { id: randomUUID(), position: { x: 0, y: 0, z: 0 }, anchor: { x: 0, y: 0, z: 0 } };
        assert.deepEqual(playerState(observer, new Map([[player.id, player]])).players, []);
        assert.equal(DEPARTURE_END_SECONDS, 20);
    }
});

test('a potion still expires normally during departure without removing the permanent speed increase', () => {
    const player = { position: { x: 18, y: 0, z: 0 }, anchor: { x: 0, y: 0, z: 0 },
        speedEssence: true, speedPotionUntil: 2000 };
    beginDeparture(player, { stoneId: `stone-${'a'.repeat(32)}`, position: { x: 0, y: 0, z: 0 } }, 0);
    advancePlayer(player, 0.1, 1000, () => 0);
    assert.ok(Math.abs(player.position.x - (18 + 1.3 * 1.35)) < 1e-8);
    const beforeExpiry = player.position.x;
    advancePlayer(player, 0.1, 2000, () => 0);
    assert.ok(Math.abs(player.position.x - beforeExpiry - 1.3 * 1.1) < 1e-8);
});

test('departure retains the current outward travel heading instead of turning a diagonal walker toward the radial line', () => {
    const player = { anchor: {}, position: { x: 18, y: 0, z: 0 },
        input: { forward: 1, right: 0, yaw: 45 }, inputReceivedAt: 1000 };
    const event = beginDeparture(player, { stoneId: `stone-${'a'.repeat(32)}`,
        position: { x: 0, y: 0, z: 0 } }, 1000);
    assert.ok(Math.abs(event.direction[0] - Math.SQRT1_2) < 1e-8);
    assert.ok(Math.abs(event.direction[2] - Math.SQRT1_2) < 1e-8);
});

test('departure atomically leaves all items and a persistent scarf near the stone, never duplicating or moving its writing', t => {
    const { store, dataFile, id, foreign, site, position, leftovers } = mounted(t);
    assert.throws(() => store.beginJourney(foreign, position, site.stoneId), { code: 'INVALID_DEPARTURE' });
    store.beginJourney(id, position, site.stoneId);
    store.endJourney(id, site.stoneId);
    assert.deepEqual(store.snapshot(id), []);
    const visible = store.stoneSites(position).find(entry => entry.stoneId === site.stoneId);
    assert.equal(visible.scarf.length, 3);
    const drop = store.drops[0];
    assert.deepEqual(drop.items.map(item => item.id), leftovers);
    assert.ok(Math.hypot(drop.position.x - position.x, drop.position.z - position.z) < 5);
    const text = store.readInscription(foreign, position, site.stoneId);
    assert.equal(text.ownerId, id);
    assert.deepEqual(text.entries, [{ text: 'These words remain.', strikes: [[0, 5]] }]);
    assert.throws(() => store.endJourney(id, site.stoneId), { code: 'INVALID_DEPARTURE' });
    const restarted = createInventoryStore({ dataFile });
    assert.deepEqual(restarted.stoneSites(position).find(entry => entry.stoneId === site.stoneId).scarf, visible.scarf);
    assert.ok(restarted.drops.some(entry => entry.id === drop.id));
});

test('interrupted departures finish at the stone on disconnect and on crash recovery; failed commits roll back', t => {
    const { store, dataFile, id, site, position, leftovers } = mounted(t);
    store.beginJourney(id, position, site.stoneId);
    const saved = readFileSync(dataFile, 'utf8');
    rmSync(dataFile);
    mkdirSync(dataFile);
    assert.throws(() => store.endJourney(id, site.stoneId));
    assert.equal(store.snapshot(id).length, leftovers.length);
    assert.equal(store.stoneSites(position).find(entry => entry.stoneId === site.stoneId).scarf, undefined);
    rmSync(dataFile, { recursive: true });
    store.disconnectAll([{ id, position: { ...position, x: position.x + 200 } }]);
    assert.deepEqual(store.drops[0].items.map(item => item.id), leftovers);
    assert.ok(Math.abs(store.drops[0].position.x - position.x) < 5);
    const recoveredFile = dataFile + '-recovery.json';
    // Restore the last committed in-progress departure to simulate an unclean shutdown.
    writeFileSync(recoveredFile, saved);
    const recovered = createInventoryStore({ dataFile: recoveredFile });
    assert.deepEqual(recovered.snapshot(id), []);
    assert.ok(recovered.stoneSites(position).find(entry => entry.stoneId === site.stoneId).scarf);
    assert.deepEqual(recovered.drops.find(drop => drop.items.some(item => leftovers.includes(item.id)))
        .items.map(item => item.id), leftovers);
    const again = createInventoryStore({ dataFile: recoveredFile });
    assert.equal(again.drops.filter(drop => drop.items.some(item => leftovers.includes(item.id))).length, 1);
});
