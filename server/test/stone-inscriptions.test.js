import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createInventoryStore } from '../src/inventory-store.js';
import { createStoneSites } from '../src/world/stone-inscriptions.js';
import { createTerrainGenerator } from '../src/world/terrain-generator.js';
import { generateStones } from '../src/world/stone-generator.js';
import StoneGeometry from '../../client/src/shared/StoneGeometry.js';

function setup(t) {
    const directory = mkdtempSync(join(tmpdir(), 'stone-inscriptions-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const dataFile = join(directory, 'world.json');
    const store = createInventoryStore({ dataFile, spawn: { x: 0, y: 0, z: 0 } });
    const playerId = randomUUID();
    const site = store.stoneSites({ x: 0, y: 0, z: 0 })[0];
    assert.ok(site, 'seed 12 has a reachable large stone');
    const position = Object.fromEntries(['x', 'y', 'z'].map((key, index) => [key, site.position[index]]));
    store.register(playerId, position);
    const item = type => store.snapshot(playerId).find(item => item.type === type);
    const journal = item('journal');
    store.append(playerId, position, journal.id, '<img>Words left behind.\nSecond line.');
    store.strike(playerId, position, journal.id, 0, 5, 10);
    const original = item('journal');
    store.craft(playerId, position, [journal.id, item('salSmaragdinum').id], null);
    const emerald = item('emeraldTablets');
    const bitumen = item('bitumen');
    const recipe = store.craft(playerId, position, [bitumen.id, emerald.id], null);
    assert.equal(recipe.outcome, 'preparedTablet');
    const tablet = item('preparedTablet');
    assert.deepEqual(tablet.entries, original.entries);
    assert.equal(tablet.author, original.author);
    assert.equal(tablet.burnable, false);
    assert.equal(store.snapshot(playerId).length, 1);
    return { store, playerId, site, position, tablet, dataFile };
}

test('preparing and placing a tablet persists its exact authorship and writing permanently on one stone', t => {
    const { store, playerId, site, position, tablet, dataFile } = setup(t);
    store.placeInscription(playerId, position, tablet.id, site.stoneId);
    assert.deepEqual(store.snapshot(playerId), []);
    assert.equal(store.stoneSites(position).find(entry => entry.stoneId === site.stoneId).occupied, true);
    const { burnable, ...storedTablet } = tablet;
    assert.deepEqual(store.readInscription(playerId, position, site.stoneId), storedTablet);
    const disk = JSON.parse(readFileSync(dataFile, 'utf8'));
    assert.equal(disk.inscriptions.length, 1);
    assert.equal(disk.inscriptions[0].items[0].id, tablet.id);
    assert.deepEqual(disk.inscriptions[0].items[0].entries, tablet.entries);
    store.disconnectAll([{ id: playerId, position }]);
    assert.equal(store.drops.length, 0);
    const restarted = createInventoryStore({ dataFile });
    const reader = randomUUID();
    restarted.register(reader, position);
    const text = restarted.readInscription(reader, position, site.stoneId);
    assert.equal(text.author, tablet.author);
    assert.deepEqual(text.entries, tablet.entries);
    assert.throws(() => restarted.append(reader, position, tablet.id, 'Overwrite'), { code: 'JOURNAL_FORBIDDEN' });
    assert.throws(() => restarted.pickup(reader, position, disk.inscriptions[0].id), { code: 'DROP_NOT_FOUND' });
    assert.throws(() => restarted.craft(reader, position, [tablet.id], 'fire'), { code: 'ITEM_NOT_FOUND' });
});

test('placement validates proximity, prepared item ownership and unique stone occupancy without losing ingredients', t => {
    const { store, playerId, site, position, tablet } = setup(t);
    const before = store.snapshot(playerId);
    const far = { ...position, x: position.x + 6.01 };
    assert.throws(() => store.placeInscription(playerId, far, tablet.id, site.stoneId), { code: 'STONE_TOO_FAR' });
    assert.throws(() => store.placeInscription(playerId, position, tablet.id, 'forged'), { code: 'INVALID_STONE' });
    assert.throws(() => store.placeInscription(playerId, position, randomUUID(), site.stoneId), { code: 'ITEM_NOT_FOUND' });
    assert.throws(() => store.readInscription(playerId, position, site.stoneId), { code: 'INSCRIPTION_NOT_FOUND' });
    const other = randomUUID();
    store.register(other, position);
    assert.throws(() => store.placeInscription(other, position, tablet.id, site.stoneId), { code: 'ITEM_NOT_FOUND' });
    const ownJournal = store.snapshot(other).find(item => item.type === 'journal');
    assert.throws(() => store.placeInscription(other, position, ownJournal.id, site.stoneId), { code: 'ITEM_NOT_FOUND' });
    assert.deepEqual(store.snapshot(playerId), before);
    store.placeInscription(playerId, position, tablet.id, site.stoneId);
    assert.throws(() => store.placeInscription(other, position, ownJournal.id, site.stoneId), { code: 'STONE_OCCUPIED' });
    assert.throws(() => store.readInscription(other, far, site.stoneId), { code: 'STONE_TOO_FAR' });
});

test('a failed placement write leaves both the tablet and stone untouched', t => {
    const { store, playerId, site, position, tablet, dataFile } = setup(t);
    const original = readFileSync(dataFile, 'utf8');
    rmSync(dataFile);
    mkdirSync(dataFile);
    assert.throws(() => store.placeInscription(playerId, position, tablet.id, site.stoneId));
    assert.equal(store.snapshot(playerId)[0].id, tablet.id);
    assert.equal(store.stoneSites(position).find(entry => entry.stoneId === site.stoneId).occupied, false);
    rmSync(dataFile, { recursive: true });
    writeFileSync(dataFile, original);
});

test('legacy saves migrate without erasing loot and corrupted duplicate inscriptions are rejected', t => {
    const { store, playerId, site, position, tablet, dataFile } = setup(t);
    const old = JSON.parse(readFileSync(dataFile, 'utf8'));
    delete old.inscriptions;
    writeFileSync(dataFile, JSON.stringify(old));
    const migrated = createInventoryStore({ dataFile });
    assert.equal(migrated.drops[0].items[0].id, tablet.id);
    store.placeInscription(playerId, position, tablet.id, site.stoneId);
    const invalid = JSON.parse(readFileSync(dataFile, 'utf8'));
    invalid.inscriptions.push(structuredClone(invalid.inscriptions[0]));
    const text = JSON.stringify(invalid);
    writeFileSync(dataFile, text);
    assert.throws(() => createInventoryStore({ dataFile }), /Invalid inventory storage schema/);
    assert.equal(readFileSync(dataFile, 'utf8'), text);
});

test('previously mounted tablets relocate above the sand on restart without changing writing or stone identity', t => {
    const { store, playerId, site, position, tablet, dataFile } = setup(t);
    store.placeInscription(playerId, position, tablet.id, site.stoneId);
    store.disconnectAll([{ id: playerId, position }]);
    const old = JSON.parse(readFileSync(dataFile, 'utf8'));
    old.inscriptions[0].position.y -= 2;
    old.inscriptions[0].normal = [0, -0.8, 0.6];
    writeFileSync(dataFile, JSON.stringify(old));
    createInventoryStore({ dataFile });
    const migrated = JSON.parse(readFileSync(dataFile, 'utf8')).inscriptions[0];
    assert.deepEqual(migrated.position, position);
    assert.deepEqual(migrated.normal, site.normal);
    assert.deepEqual(migrated.items[0].entries, tablet.entries);
    assert.equal(migrated.stoneId, site.stoneId);
});

test('mounting sites are deterministic triangle-surface anchors on large stones, independent of chunk lattice', () => {
    const { getHeight } = createTerrainGenerator(12);
    const sites = createStoneSites(12, getHeight).nearby({ x: 0, y: 0, z: 0 });
    for (const site of sites) {
        const stone = generateStones({ x: -512, y: 0, z: -512 }, getHeight, 1024)
            .find(stone => stone.id === site.stoneId);
        assert.ok(stone.size >= 25);
        const worldStone = { ...stone, position: [stone.position[0] - 512, stone.position[1], stone.position[2] - 512] };
        assert.deepEqual(StoneGeometry.mountingPoint(worldStone, getHeight), { position: site.position, normal: site.normal });
        assert.ok(Math.abs(Math.hypot(...site.normal) - 1) < 1e-8);
        assert.ok(Math.abs(site.normal[1]) <= 0.4, 'tablets attach to walls rather than downward-facing overhangs');
        const clearance = site.position[1] - getHeight(site.position[0], site.position[2]);
        assert.ok(clearance > 1.7 && clearance < 3.8, 'tablets remain visibly above local sand');
    }
});
