import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createInventoryStore } from '../src/inventory-store.js';
import { createTerrainGenerator } from '../src/world/terrain-generator.js';
import { createResinSites } from '../src/world/resin-sites.js';
import { generateTrees } from '../src/world/tree-generator.js';
import { playerState } from '../src/world/simulation.js';

const origin = { x: 0, y: 0, z: 0 };
const { getHeight } = createTerrainGenerator(12);
const sites = createResinSites(12, getHeight).nearby(origin);

test('resin occurs beside a sparse subset of seeded trees and is stable across cache eviction and query origins', () => {
    assert.ok(sites.length > 0 && sites.length < 50);
    const generator = createResinSites(12, getHeight);
    const trees = generateTrees({ x: -576, y: 0, z: -576 }, getHeight, 1152, 12);
    assert.ok(trees.length > sites.length);
    for (const site of sites) {
        assert.match(site.id, /^resin-[a-f0-9]{32}$/);
        assert.equal(site.position.y, getHeight(site.position.x, site.position.z));
        assert.ok(trees.some(tree => Math.abs(tree.position[0] - 576 + 0.8 - site.position.x) < 1e-8 &&
            Math.abs(tree.position[2] - 576 + 0.5 - site.position.z) < 1e-8 && tree.seed % 5 === 0));
        assert.deepEqual(generator.nearby(site.position, 6).find(other => other.id === site.id), site);
    }
    for (let index = 0; index < 140; index++)
        generator.nearby({ x: index * 1000, y: 0, z: 1000 }, 6);
    assert.deepEqual(generator.nearby(origin), sites);
    assert.notDeepEqual(createResinSites(13, getHeight).nearby(origin), sites);
    const packet = playerState({ position: origin, anchor: origin, revision: 1 }, new Map(), sites);
    assert.ok(packet.drops.every(drop => drop.kind === 'resin' && drop.count === 1));
});

test('gathering is range-checked, shared, atomic, persistent and supplies both transformation paths', t => {
    const directory = mkdtempSync(join(tmpdir(), 'alchemy-resin-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const dataFile = join(directory, 'world.json');
    let store = createInventoryStore({ dataFile, spawn: origin });
    const first = randomUUID(), second = randomUUID();
    const site = sites[0], position = site.position;
    store.register(first, position);
    store.register(second, position);
    const before = readFileSync(dataFile, 'utf8');
    assert.throws(() => store.pickup(first, { ...position, x: position.x + 6.01 }, site.id), { code: 'RESOURCE_TOO_FAR' });
    assert.equal(readFileSync(dataFile, 'utf8'), before);
    assert.throws(() => store.pickup(first, position, `resin-${'f'.repeat(32)}`), { code: 'RESOURCE_TOO_FAR' });
    store.pickup(first, { ...position, x: position.x + 6 }, site.id);
    assert.equal(store.resinSites(position).some(other => other.id === site.id), false);
    const resin = store.snapshot(first).find(item => item.type === 'resin');
    assert.equal(resin.isNew, true);
    assert.throws(() => store.pickup(second, position, site.id), { code: 'RESOURCE_DEPLETED' });
    assert.equal(store.snapshot(second).some(item => item.type === 'resin'), false);
    assert.throws(() => store.craft(second, position, [resin.id], 'fire'), { code: 'ITEM_NOT_FOUND' });
    for (const element of ['water', 'earth'])
        assert.equal(store.craft(first, position, [resin.id], element).outcome, 'unchanged');
    const hardened = store.craft(first, position, [resin.id], 'air');
    assert.equal(hardened.outcome, 'hardenedResin');
    assert.equal(store.snapshot(first).some(item => item.id === resin.id), false);
    const binder = store.craft(first, position, [hardened.producedItems[0].id], 'fire');
    assert.equal(binder.producedItems[0].type, 'bitumen');
    assert.equal(binder.outcome, 'resinBinder');
    const next = sites[1];
    assert.ok(next);
    store.pickup(first, next.position, next.id);
    const fresh = store.snapshot(first).find(item => item.type === 'resin');
    assert.equal(store.craft(first, next.position, [fresh.id], 'fire').producedItems[0].type, 'bitumen');
    store = createInventoryStore({ dataFile });
    assert.equal(store.resinSites(position).some(other => other.id === site.id), false);
    assert.ok(store.drops.some(drop => drop.items.some(item => item.id === binder.producedItems[0].id)));
});

test('old worlds migrate without resetting and invalid depletion data is rejected', t => {
    const directory = mkdtempSync(join(tmpdir(), 'alchemy-resin-schema-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const dataFile = join(directory, 'world.json');
    createInventoryStore({ dataFile, spawn: origin });
    const old = JSON.parse(readFileSync(dataFile, 'utf8'));
    delete old.harvestedResin;
    writeFileSync(dataFile, JSON.stringify(old));
    const migrated = createInventoryStore({ dataFile });
    assert.deepEqual(migrated.spawn, origin);
    assert.ok(migrated.resinSites(origin).length > 0);
    for (const harvestedResin of [null, ['invalid'], [sites[0].id, sites[0].id]]) {
        writeFileSync(dataFile, JSON.stringify({ ...old, harvestedResin }));
        assert.throws(() => createInventoryStore({ dataFile }), /schema/);
    }
});

test('a full inventory cannot consume a resin site and a failed disk commit grants nothing', t => {
    const directory = mkdtempSync(join(tmpdir(), 'alchemy-resin-capacity-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const dataFile = join(directory, 'world.json');
    createInventoryStore({ dataFile, spawn: origin });
    const state = JSON.parse(readFileSync(dataFile, 'utf8'));
    const site = sites[0], dropId = randomUUID();
    state.drops.push({ id: dropId, position: site.position, items: Array.from({ length: 29 },
        () => ({ id: randomUUID(), type: 'ash', isNew: false })) });
    writeFileSync(dataFile, JSON.stringify(state));
    const store = createInventoryStore({ dataFile }), id = randomUUID();
    store.register(id, site.position);
    store.pickup(id, site.position, dropId);
    assert.equal(store.snapshot(id).length, 32);
    assert.throws(() => store.pickup(id, site.position, site.id), { code: 'INVENTORY_FULL' });
    assert.ok(store.resinSites(site.position).some(other => other.id === site.id));
    store.drop(id, site.position, store.snapshot(id).at(-1).id);
    const before = store.snapshot(id);
    rmSync(dataFile);
    // Make the destination unwritable as a file while leaving temporary-file creation possible.
    mkdirSync(dataFile);
    assert.throws(() => store.pickup(id, site.position, site.id), /EISDIR|EPERM|EACCES/);
    assert.deepEqual(store.snapshot(id), before);
    assert.ok(store.resinSites(site.position).some(other => other.id === site.id));
});
