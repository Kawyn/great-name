import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { createInventoryStore } from '../src/inventory-store.js';

const origin = { x: 2048, y: 30, z: -4096 };
function storageFile(t) {
    const directory = resolve('data', `test-${randomUUID()}`);
    mkdirSync(directory, { recursive: true });
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    return resolve(directory, 'world.json');
}

test('own journal tablets permanently change appearance; binder does not deepen the color', t => {
    const dataFile = storageFile(t);
    const store = createInventoryStore({ dataFile });
    const owner = randomUUID(), stranger = randomUUID();
    store.register(owner, origin); store.register(stranger, origin);
    const item = type => store.snapshot(owner).find(item => item.type === type);
    assert.equal(store.emeraldStage(owner), 0);
    store.craft(owner, origin, [item('journal').id], 'water');
    assert.equal(store.emeraldStage(owner), 0);
    assert.throws(() => store.craft(owner, origin, [item('journal').id, 'missing'], null));
    assert.equal(store.emeraldStage(owner), 0);
    store.craft(owner, origin, [item('journal').id, item('salSmaragdinum').id], null);
    assert.equal(store.emeraldStage(owner), 1);
    assert.equal(JSON.parse(readFileSync(dataFile, 'utf8')).players.find(p => p.id === owner).emeraldStage, 1);
    store.craft(owner, origin, [item('emeraldTablets').id, item('bitumen').id], null);
    assert.equal(store.emeraldStage(owner), 1);
    store.drop(owner, origin, item('preparedTablet').id);
    assert.equal(store.emeraldStage(owner), 1);
    store.pickup(stranger, origin, store.drops[0].id);
    assert.equal(store.emeraldStage(stranger), 0, 'carrying someone else tablet does not change appearance');
    assert.equal(JSON.parse(readFileSync(dataFile, 'utf8')).players.find(p => p.id === owner).emeraldStage, 1);
});

test('only burning the own journal persists a permanent black appearance for the current life', t => {
    const dataFile = storageFile(t), owner = randomUUID(), stranger = randomUUID();
    const store = createInventoryStore({ dataFile });
    store.register(owner, origin); store.register(stranger, origin);
    const ownJournal = store.snapshot(owner).find(i => i.type === 'journal');
    assert.equal(store.charred(owner), false);
    store.craft(owner, origin, [ownJournal.id], 'water');
    assert.equal(store.charred(owner), false);
    assert.throws(() => store.craft(owner, origin, ['missing'], 'fire'));
    assert.equal(store.charred(owner), false);
    store.craft(owner, origin, [ownJournal.id], 'fire');
    assert.equal(store.charred(owner), true);
    assert.equal(store.emeraldStage(owner), 0);
    assert.equal(JSON.parse(readFileSync(dataFile, 'utf8')).players.find(p => p.id === owner).charred, true);
    store.drop(stranger, origin, store.snapshot(stranger).find(i => i.type === 'journal').id);
    store.pickup(owner, origin, store.drops[0].id);
    store.craft(owner, origin, [store.snapshot(owner).find(i => i.ownerId === stranger).id], 'fire');
    assert.equal(store.charred(owner), true);
    assert.equal(store.charred(stranger), false);
    const reader = randomUUID(), donor = randomUUID();
    store.register(reader, origin); store.register(donor, origin);
    store.drop(donor, origin, store.snapshot(donor).find(i => i.type === 'journal').id);
    store.pickup(reader, origin, store.drops[0].id);
    store.craft(reader, origin, [store.snapshot(reader).find(i => i.ownerId === donor).id], 'fire');
    assert.equal(store.charred(reader), false, 'burning foreign writings does not transform their reader');
    const saved = JSON.parse(readFileSync(dataFile, 'utf8'));
    saved.players.find(p => p.id === owner).charred = 'true';
    writeFileSync(dataFile, JSON.stringify(saved));
    assert.throws(() => createInventoryStore({ dataFile }), /Invalid/);
});

test('transforming someone else journal or preparing their tablet never impersonates its owner', () => {
    const store = createInventoryStore(), owner = randomUUID(), crafter = randomUUID();
    store.register(owner, origin); store.register(crafter, origin);
    store.disconnectAll([{ id: owner, position: origin }]);
    store.pickup(crafter, origin, store.drops[0].id);
    const items = () => store.snapshot(crafter);
    store.craft(crafter, origin, [items().find(i => i.ownerId === owner).id,
        items().find(i => i.type === 'salSmaragdinum').id], null);
    assert.equal(store.emeraldStage(crafter), 0);
    store.craft(crafter, origin, [items().find(i => i.type === 'emeraldTablets').id,
        items().find(i => i.type === 'bitumen').id], null);
    assert.equal(store.emeraldStage(crafter), 0);
});

test('persists journal entries, seen flags, seed, position, and one disconnect bundle across restarts', t => {
    const dataFile = storageFile(t);
    let store = createInventoryStore({ dataFile, seed: 873, spawn: origin });
    const owner = randomUUID();
    store.register(owner, origin);
    const journal = store.snapshot(owner)[0];
    assert.equal(store.snapshot(owner).length, 3);
    const salt = store.snapshot(owner)[1];
    assert.equal(salt.type, 'salSmaragdinum');
    assert.equal(salt.isNew, false);
    assert.equal(salt.burnable, false);
    assert.equal(store.snapshot(owner)[2].type, 'bitumen');
    assert.equal(store.snapshot(owner)[2].isNew, false);
    assert.equal(journal.author, `Alchemist ${owner.slice(0, 8)}`);
    const moved = { ...origin, x: origin.x + 37 };
    const text = '<script>alert("plain text only")</script>\n\tA memory';
    store.append(owner, moved, journal.id, text);
    store.strike(owner, moved, journal.id, 0, 0, 8);
    store.strike(owner, moved, journal.id, 0, 4, 12);
    store.seen(owner, moved, journal.id);
    const disk = JSON.parse(readFileSync(dataFile, 'utf8'));
    assert.deepEqual(disk.players[0].position, moved);
    assert.equal(disk.players[0].items[0].isNew, false);
    store.disconnectAll([{ id: owner, position: moved }]);
    store = createInventoryStore({ dataFile, seed: 12 });
    assert.equal(store.seed, 873);
    assert.deepEqual(store.spawn, origin);
    assert.equal(store.drops.length, 1);
    assert.deepEqual(store.drops[0].position, moved);
    assert.deepEqual(store.drops[0].items[0].entries, [{ text, strikes: [[0, 12]] }]);
    const reader = randomUUID();
    store.register(reader, moved);
    const dropId = store.drops[0].id;
    store.pickup(reader, moved, dropId);
    assert.equal(store.snapshot(reader).length, 6);
    assert.equal(store.snapshot(reader)[3].isNew, true);
    assert.equal(store.snapshot(reader)[3].ownerId, owner);
    assert.throws(() => store.append(reader, moved, journal.id, 'overwrite'), { code: 'JOURNAL_FORBIDDEN' });
    assert.throws(() => store.strike(reader, moved, journal.id, 0, 0, 1), { code: 'JOURNAL_FORBIDDEN' });
    assert.throws(() => store.append(owner, moved, journal.id, 'lost journal'), { code: 'NOT_REGISTERED' });
    assert.throws(() => store.pickup(reader, moved, dropId), { code: 'DROP_NOT_FOUND' });
    store.disconnectAll([{ id: reader, position: moved }]);
    const restarted = createInventoryStore({ dataFile });
    assert.equal(restarted.drops.length, 1);
    assert.equal(restarted.drops[0].items.length, 6);
    assert.equal(restarted.drops[0].items.find(item => item.id === journal.id).entries[0].text, text);
});

test('startup recovers held inventories exactly once at their last mutation position', t => {
    const dataFile = storageFile(t);
    const store = createInventoryStore({ dataFile });
    const owner = randomUUID();
    store.register(owner, origin);
    const journal = store.snapshot(owner)[0];
    const lastPosition = { ...origin, z: origin.z + 99 };
    store.append(owner, lastPosition, journal.id, 'Survives a crash.');
    const recovered = createInventoryStore({ dataFile });
    assert.equal(recovered.drops.length, 1);
    assert.deepEqual(recovered.drops[0].position, lastPosition);
    assert.equal(recovered.drops[0].items[0].entries[0].text, 'Survives a crash.');
    assert.deepEqual(createInventoryStore({ dataFile }).drops, recovered.drops);
    assert.deepEqual(JSON.parse(readFileSync(dataFile, 'utf8')).players, []);
});

test('pickup enforces six-meter three-dimensional distance and rejects duplicate pickups', () => {
    const store = createInventoryStore();
    const owner = randomUUID();
    const picker = randomUUID();
    store.register(owner, origin);
    store.register(picker, origin);
    store.disconnectAll([{ id: owner, position: origin }]);
    const dropId = store.drops[0].id;
    for (const position of [{ ...origin, x: origin.x + 6.001 }, { ...origin, y: origin.y + 7 }])
        assert.throws(() => store.pickup(picker, position, dropId), { code: 'DROP_TOO_FAR' });
    assert.equal(store.drops.length, 1);
    store.pickup(picker, { ...origin, x: origin.x + 6 }, dropId);
    assert.equal(store.drops.length, 0);
    assert.throws(() => store.pickup(picker, origin, dropId), { code: 'DROP_NOT_FOUND' });
});

test('invalid journal inputs do not mutate inventory, ownership is required, and bounded ranges merge', () => {
    const store = createInventoryStore();
    const owner = randomUUID();
    const other = randomUUID();
    store.register(owner, origin);
    store.register(other, origin);
    const journal = store.snapshot(owner)[0];
    const before = store.snapshot(owner);
    for (const text of [null, {}, 42, '', ' \n\t', 'a'.repeat(4001), 'text\u0000', '\u001b[31m', 'x\r\n', '\u0085'])
        assert.throws(() => store.append(owner, origin, journal.id, text), { code: 'INVALID_JOURNAL_TEXT' });
    assert.deepEqual(store.snapshot(owner), before);
    assert.throws(() => store.append(other, origin, journal.id, 'forged'), { code: 'JOURNAL_FORBIDDEN' });
    store.append(owner, origin, journal.id, 'abcdef');
    for (const args of [[-1, 0, 1], [0, -1, 1], [0, 1, 1], [0, 0, 7], [0, 0.5, 2], ['0', 0, 1]])
        assert.throws(() => store.strike(owner, origin, journal.id, ...args), { code: 'INVALID_JOURNAL_RANGE' });
    store.strike(owner, origin, journal.id, 0, 2, 4);
    store.strike(owner, origin, journal.id, 0, 0, 2);
    store.strike(owner, origin, journal.id, 0, 3, 6);
    assert.deepEqual(store.snapshot(owner)[0].entries[0].strikes, [[0, 6]]);
    for (let i = 1; i < 200; i++)
        store.append(owner, origin, journal.id, 'entry');
    assert.throws(() => store.append(owner, origin, journal.id, 'too many'), { code: 'JOURNAL_FULL' });
    assert.equal(store.snapshot(owner)[0].entries.length, 200);
});

test('corrupt JSON, invalid schemas, and duplicated item identities fail without resetting storage', t => {
    const dataFile = storageFile(t);
    for (const value of ['{broken', 'null', '{}']) {
        writeFileSync(dataFile, value);
        assert.throws(() => createInventoryStore({ dataFile }));
        assert.equal(readFileSync(dataFile, 'utf8'), value);
    }
    rmSync(dataFile);
    const store = createInventoryStore({ dataFile });
    const owner = randomUUID();
    store.register(owner, origin);
    const invalid = JSON.parse(readFileSync(dataFile, 'utf8'));
    invalid.drops.push({ id: randomUUID(), position: origin, items: invalid.players[0].items });
    writeFileSync(dataFile, JSON.stringify(invalid));
    assert.throws(() => createInventoryStore({ dataFile }), /Invalid inventory storage schema/);
});

test('failed disk transaction leaves in-memory inventory and drops untouched', t => {
    const dataFile = storageFile(t);
    const store = createInventoryStore({ dataFile });
    const owner = randomUUID();
    store.register(owner, origin);
    const before = store.snapshot(owner);
    rmSync(dataFile);
    mkdirSync(dataFile);
    assert.throws(() => store.append(owner, origin, before[0].id, 'not committed'));
    assert.deepEqual(store.snapshot(owner), before);
    assert.throws(() => store.drop(owner, origin, before[0].id));
    assert.throws(() => store.craft(owner, origin, [before[0].id], 'fire'));
    assert.deepEqual(store.snapshot(owner), before);
    assert.throws(() => store.disconnectAll([{ id: owner, position: origin }]));
    assert.equal(store.drops.length, 0);
});

test('dropping one held journal persists a single-item bundle, and burning a found journal is permanent', t => {
    const dataFile = storageFile(t);
    const store = createInventoryStore({ dataFile, spawn: origin });
    const owner = randomUUID();
    const reader = randomUUID();
    store.register(owner, origin);
    store.register(reader, origin);
    const journal = store.snapshot(owner)[0];
    assert.equal(journal.isNew, false);
    assert.equal(journal.burnable, true);
    store.append(owner, origin, journal.id, 'Preserved on the ground.');
    assert.throws(() => store.drop(reader, origin, journal.id), { code: 'ITEM_NOT_FOUND' });
    assert.throws(() => store.craft(reader, origin, [journal.id], 'fire'), { code: 'ITEM_NOT_FOUND' });
    const position = { ...origin, x: origin.x + 2 };
    store.drop(owner, position, journal.id);
    assert.equal(store.snapshot(owner).length, 2);
    assert.deepEqual(store.drops[0].position, position);
    assert.equal(store.drops[0].items[0].entries[0].text, 'Preserved on the ground.');
    assert.equal(JSON.parse(readFileSync(dataFile, 'utf8')).drops[0].items[0].id, journal.id);
    assert.throws(() => store.drop(owner, position, journal.id), { code: 'ITEM_NOT_FOUND' });
    store.pickup(reader, position, store.drops[0].id);
    assert.equal(store.snapshot(reader).find(item => item.id === journal.id).isNew, true);
    store.craft(reader, position, [journal.id], 'fire');
    assert.equal(store.snapshot(reader).length, 4);
    const ash = store.snapshot(reader).find(item => item.type === 'ash');
    assert.ok(ash);
    assert.notEqual(ash.id, journal.id);
    assert.equal(ash.isNew, true);
    assert.equal(ash.burnable, false);
    assert.equal(store.craft(reader, position, [ash.id], 'fire').outcome, 'unchanged');
    assert.equal(store.drops.length, 0);
    assert.throws(() => store.craft(reader, position, [journal.id], 'fire'), { code: 'ITEM_NOT_FOUND' });
    store.disconnectAll([{ id: owner, position }, { id: reader, position }]);
    const restarted = createInventoryStore({ dataFile });
    assert.equal(restarted.drops.flatMap(drop => drop.items).some(item => item.id === journal.id), false);
    assert.equal(restarted.drops.flatMap(drop => drop.items).filter(item => item.id === ash.id).length, 1);
    const collector = randomUUID();
    restarted.register(collector, position);
    restarted.pickup(collector, position, restarted.drops.find(drop => drop.items.some(item => item.id === ash.id)).id);
    restarted.drop(collector, position, ash.id);
    assert.ok(restarted.drops.some(drop => drop.items.length === 1 && drop.items[0].id === ash.id));
});

test('burnability comes from server types, even if storage contains forged capability metadata', t => {
    const dataFile = storageFile(t);
    createInventoryStore({ dataFile, spawn: origin });
    const state = JSON.parse(readFileSync(dataFile, 'utf8'));
    state.drops.push({
        id: randomUUID(), position: origin,
        items: ['emeraldTablets', 'citrineArsenicum', 'argentumVivum']
            .map(type => ({ id: randomUUID(), type, isNew: false, burnable: true }))
    });
    writeFileSync(dataFile, JSON.stringify(state));
    const store = createInventoryStore({ dataFile });
    const owner = randomUUID();
    store.register(owner, origin);
    store.pickup(owner, origin, store.drops[0].id);
    for (const item of store.snapshot(owner).slice(1)) {
        assert.equal(item.burnable, false);
        assert.equal(store.craft(owner, origin, [item.id], 'fire').outcome, 'unchanged');
    }
    assert.equal(store.snapshot(owner).length, 6);
});

test('a full inventory rejects pickup without losing or duplicating items', t => {
    const dataFile = storageFile(t);
    createInventoryStore({ dataFile, spawn: origin });
    const state = JSON.parse(readFileSync(dataFile, 'utf8'));
    const largeDropId = randomUUID();
    state.drops.push({
        id: largeDropId, position: origin,
        items: Array.from({ length: 29 }, () => ({ id: randomUUID(), type: 'argentumVivum', isNew: false }))
    });

    writeFileSync(dataFile, JSON.stringify(state));
    const store = createInventoryStore({ dataFile });
    const player = randomUUID();
    const owner = randomUUID();
    store.register(player, origin);
    store.register(owner, origin);
    store.pickup(player, origin, largeDropId);
    store.disconnectAll([{ id: owner, position: origin }]);
    const remaining = store.drops[0];
    assert.equal(store.snapshot(player).length, 32);
    assert.throws(() => store.pickup(player, origin, remaining.id), { code: 'INVENTORY_FULL' });
    assert.deepEqual(store.drops, [remaining]);
    assert.equal(store.snapshot(player).length, 32);
    const journal = store.snapshot(player).find(item => item.type === 'journal');
    store.craft(player, origin, [journal.id], 'fire');
    assert.equal(store.snapshot(player).length, 32, 'burning replaces one item even at full capacity');
    assert.equal(store.snapshot(player).filter(item => item.type === 'ash').length, 1);
});

test('partial pickup preserves the same ground bundle, item identities, journal contents and disk atomicity', t => {
    const dataFile = storageFile(t);
    createInventoryStore({ dataFile, spawn: origin });
    const state = JSON.parse(readFileSync(dataFile, 'utf8'));
    const id = randomUUID(), journalOwner = randomUUID();
    const items = Array.from({ length: 65 }, () => ({ id: randomUUID(), type: 'resin', isNew: false }));
    items[30] = { id: randomUUID(), type: 'journal', isNew: false, ownerId: journalOwner,
        author: `Alchemist ${journalOwner.slice(0, 8)}`, entries: [{ text: 'Preserved writing', strikes: [[0, 3]] }] };
    state.drops.push({ id, position: origin, items });
    writeFileSync(dataFile, JSON.stringify(state));
    const store = createInventoryStore({ dataFile });
    assert.equal(store.drops.length, 1, 'legacy bundles stay together');
    const player = randomUUID();
    store.register(player, origin);
    store.pickup(player, origin, id);
    assert.equal(store.snapshot(player).length, 32);
    assert.deepEqual(store.snapshot(player).slice(3),
        items.slice(0, 29).map(item => ({ ...item, isNew: true, burnable: false })));
    assert.deepEqual(store.drops, [{ id, position: origin, items: items.slice(29) }]);
    const collector = randomUUID();
    store.register(collector, origin);
    const before = store.drops;
    rmSync(dataFile);
    mkdirSync(dataFile);
    assert.throws(() => store.pickup(collector, origin, id));
    assert.equal(store.snapshot(collector).length, 3);
    assert.deepEqual(store.drops, before, 'failed partial pickup must roll back both containers');
    rmSync(dataFile, { recursive: true });
    store.pickup(collector, origin, id);
    assert.equal(store.snapshot(collector).length, 32);
    assert.deepEqual(store.snapshot(collector)[4].entries, items[30].entries);
    assert.deepEqual(store.drops, [{ id, position: origin, items: items.slice(58) }]);
    const last = randomUUID();
    store.register(last, origin);
    store.pickup(last, origin, id);
    assert.equal(store.snapshot(last).length, 10);
    assert.equal(store.drops.length, 0);
    const heldIDs = [player, collector, last].flatMap(owner => store.snapshot(owner).map(item => item.id));
    assert.equal(new Set(heldIDs).size, heldIDs.length);
    assert.ok(items.every(item => heldIDs.includes(item.id)));
    assert.equal(JSON.parse(readFileSync(dataFile, 'utf8')).drops.length, 0);
});
