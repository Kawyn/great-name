import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createInventoryStore } from '../src/inventory-store.js';

const position = { x: 0, y: 0, z: 0 };

test('resin and lye make a drinkable draught in either order; fire concentrates it and drinking consumes only owned potions', t => {
    for (const reverse of [false, true]) {
        const { store, playerId, item, dataFile } = setup(t, ['resin', 'lye']);
        const ids = [item('resin').id, item('lye').id];
        const potion = store.craft(playerId, position, reverse ? ids.reverse() : ids, null);
        assert.equal(potion.outcome, 'speedPotion');
        assert.equal(potion.producedItems[0].type, 'speedPotion');
        const id = item('speedPotion').id;
        const before = store.snapshot(playerId);
        assert.throws(() => store.drink(randomUUID(), position, id), { code: 'NOT_REGISTERED' });
        assert.throws(() => store.drink(playerId, position, item('journal').id), { code: 'NOT_DRINKABLE' });
        assert.deepEqual(store.snapshot(playerId), before);
        for (const element of ['air', 'earth', 'water'])
            assert.equal(store.craft(playerId, position, [id], element).outcome, 'unchanged');
        if (reverse) {
            assert.deepEqual(store.drink(playerId, position, id), { type: 'speedPotion' });
        }
        else {
            const essence = store.craft(playerId, position, [id], 'fire');
            assert.equal(essence.outcome, 'speedEssence');
            const essenceId = item('speedEssence').id;
            const committed = readFileSync(dataFile, 'utf8');
            assert.throws(() => store.drink(playerId, position, essenceId, true), { code: 'ESSENCE_ALREADY_ACTIVE' });
            assert.equal(readFileSync(dataFile, 'utf8'), committed);
            assert.deepEqual(store.drink(playerId, position, essenceId), { type: 'speedEssence' });
        }
        assert.throws(() => store.drink(playerId, position, id), { code: 'ITEM_NOT_FOUND' });
        assert.equal(store.snapshot(playerId).some(item => ['speedPotion', 'speedEssence'].includes(item.type)), false);
    }
});

test('undrunk potions persist and transfer, while failed consumption commits leave the inventory unchanged', t => {
    const { store, playerId, item, dataFile } = setup(t, ['speedPotion', 'speedEssence']);
    const potion = item('speedPotion');
    store.drop(playerId, position, potion.id);
    const recipient = randomUUID();
    store.register(recipient, position);
    store.pickup(recipient, position, store.drops.find(drop => drop.items.some(item => item.id === potion.id)).id);
    assert.ok(store.snapshot(recipient).some(item => item.id === potion.id));
    const restored = createInventoryStore({ dataFile });
    assert.ok(restored.drops.some(drop => drop.items.some(item => item.id === potion.id)));
    const next = randomUUID();
    restored.register(next, position);
    restored.pickup(next, position, restored.drops.find(drop => drop.items.some(item => item.id === potion.id)).id);
    const before = restored.snapshot(next);
    rmSync(dataFile);
    mkdirSync(dataFile);
    assert.throws(() => restored.drink(next, position, potion.id), /EISDIR|EPERM|EACCES/);
    assert.deepEqual(restored.snapshot(next), before);
});

test('Bitumen prepares inscribed and legacy tablets in either order; prepared tablets resist fire', t => {
    for (const reverse of [false, true]) {
        const { store, playerId, item } = setup(t, ['emeraldTablets']);
        const tablet = item('emeraldTablets');
        const ids = [tablet.id, item('bitumen').id];
        const result = store.craft(playerId, position, reverse ? ids.reverse() : ids, null);
        assert.equal(result.outcome, 'preparedTablet');
        const prepared = item('preparedTablet');
        assert.equal(prepared.entries, undefined, 'legacy text remains a localized immutable tablet');
        assert.equal(prepared.burnable, false);
        const before = store.snapshot(playerId);
        assert.equal(store.craft(playerId, position, [prepared.id], 'fire').outcome, 'unchanged');
        assert.deepEqual(store.snapshot(playerId), before);
    }
});

function setup(t, types = []) {
    const directory = mkdtempSync(join(tmpdir(), 'alchemy-crafting-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const dataFile = join(directory, 'world.json');
    createInventoryStore({ dataFile, spawn: position });
    const state = JSON.parse(readFileSync(dataFile, 'utf8'));
    if (types.length)
        state.drops.push({ id: randomUUID(), position,
            items: types.map(type => ({ id: randomUUID(), type, isNew: false })) });
    writeFileSync(dataFile, JSON.stringify(state));
    const store = createInventoryStore({ dataFile });
    const playerId = randomUUID();
    store.register(playerId, position);
    if (types.length)
        store.pickup(playerId, position, store.drops[0].id);
    const item = type => store.snapshot(playerId).find(item => item.type === type);
    return { store, playerId, item, dataFile };
}

test('all four elements accept a journal; water, earth and air preserve its exact entries and identity', t => {
    const { store, playerId, item } = setup(t);
    const journal = item('journal');
    store.append(playerId, position, journal.id, 'A secret in ink.');
    store.strike(playerId, position, journal.id, 0, 0, 1);
    const before = store.snapshot(playerId);
    for (const [element, outcome] of [['water', 'dried'], ['earth', 'unchanged'], ['air', 'unchanged']]) {
        assert.deepEqual(store.craft(playerId, position, [journal.id], element),
            { outcome, consumedIds: [], producedItems: [] });
        assert.deepEqual(store.snapshot(playerId), before);
    }
    const result = store.craft(playerId, position, [journal.id], 'fire');
    assert.equal(result.outcome, 'ashes');
    assert.deepEqual(result.consumedIds, [journal.id]);
    assert.equal(result.producedItems.length, 1);
    assert.equal(result.producedItems[0].type, 'ash');
    assert.equal(result.producedItems[0].isNew, true);
    assert.equal(store.snapshot(playerId).some(item => item.id === journal.id), false);
    assert.throws(() => store.craft(playerId, position, [journal.id], 'fire'), { code: 'ITEM_NOT_FOUND' });
    assert.equal(store.snapshot(playerId).length, 3);
});

test('air consumes ash without a replacement and unknown material combinations consume nothing', t => {
    const { store, playerId, item } = setup(t, ['ash', 'emeraldTablets']);
    const ash = item('ash');
    const tablet = item('emeraldTablets');
    const before = store.snapshot(playerId);
    for (const element of ['fire', 'earth']) {
        assert.equal(store.craft(playerId, position, [ash.id], element).outcome, 'unchanged');
        assert.deepEqual(store.snapshot(playerId), before);
    }
    for (const element of ['fire', 'air', 'earth', 'water'])
        assert.equal(store.craft(playerId, position, [tablet.id], element).outcome, 'unchanged');
    assert.equal(store.craft(playerId, position, [ash.id, tablet.id], null).outcome, 'unchanged');
    assert.deepEqual(store.snapshot(playerId), before);
    assert.deepEqual(store.craft(playerId, position, [ash.id], 'air'),
        { outcome: 'scattered', consumedIds: [ash.id], producedItems: [] });
    assert.equal(store.snapshot(playerId).some(item => item.id === ash.id), false);
});

test('ash and physical water make persistent lye in either order', t => {
    for (const reverse of [false, true]) {
        const { store, playerId, item, dataFile } = setup(t, ['ash', 'water']);
        const ash = item('ash');
        const water = item('water');
        const ids = reverse ? [water.id, ash.id] : [ash.id, water.id];
        const result = store.craft(playerId, position, ids, null);
        assert.equal(result.outcome, 'lye');
        assert.deepEqual(result.consumedIds, ids);
        assert.equal(result.producedItems[0].type, 'lye');
        assert.equal(store.snapshot(playerId).length, 4);
        const disk = JSON.parse(readFileSync(dataFile, 'utf8'));
        assert.equal(disk.players[0].items.find(item => item.type === 'lye').id, result.producedItems[0].id);
        assert.throws(() => store.craft(playerId, position, ids, null), { code: 'ITEM_NOT_FOUND' });
        const recovered = createInventoryStore({ dataFile });
        assert.equal(recovered.drops[0].items.filter(item => item.type === 'lye').length, 1);
        assert.equal(recovered.drops[0].items.some(item => item.id === ash.id || item.id === water.id), false);
    }
});

test('ash and elemental water produce one persistent lye and consume the ash exactly once', t => {
    const { store, playerId, item, dataFile } = setup(t, ['ash']);
    const ash = item('ash');
    const result = store.craft(playerId, position, [ash.id], 'water');
    assert.equal(result.outcome, 'lye');
    assert.deepEqual(result.consumedIds, [ash.id]);
    assert.equal(result.producedItems.length, 1);
    assert.equal(result.producedItems[0].type, 'lye');
    assert.equal(result.producedItems[0].isNew, true);
    assert.throws(() => store.craft(playerId, position, [ash.id], 'water'), { code: 'ITEM_NOT_FOUND' });
    const recovered = createInventoryStore({ dataFile });
    assert.equal(recovered.drops[0].items.filter(item => item.type === 'lye').length, 1);
    assert.equal(recovered.drops[0].items.some(item => item.id === ash.id), false);
});

test('craft validates exact arity, elements, unique identities and held ownership before changing state', t => {
    const { store, playerId, item } = setup(t, ['ash']);
    const id = item('journal').id;
    const before = store.snapshot(playerId);
    for (const [ids, element] of [
        [[], 'fire'], [[id, id], null], [[id], null], [[id, item('ash').id], 'fire'],
        [[id], 'void'], [[id], {}], [[id], undefined], [[id, id, id], null],
        ['not-an-array', 'fire'], [[7], 'fire']
    ])
        assert.throws(() => store.craft(playerId, position, ids, element), { code: 'INVALID_CRAFT' });
    assert.throws(() => store.craft(playerId, position, [randomUUID()], 'fire'), { code: 'ITEM_NOT_FOUND' });
    assert.throws(() => store.craft(randomUUID(), position, [id], 'fire'), { code: 'NOT_REGISTERED' });
    assert.deepEqual(store.snapshot(playerId), before);
});

test('emerald salt preserves a journal as an immutable, fireproof tablet in either ingredient order', t => {
    for (const reverse of [false, true]) {
        const { store, playerId, item, dataFile } = setup(t);
        const journal = item('journal');
        const salt = item('salSmaragdinum');
        store.append(playerId, position, journal.id, '<script>literal & ink</script>\nSecond line.');
        store.append(playerId, position, journal.id, 'Another entry.');
        store.strike(playerId, position, journal.id, 0, 8, 15);
        const original = item('journal');
        const ids = reverse ? [salt.id, journal.id] : [journal.id, salt.id];
        const result = store.craft(playerId, position, ids, null);
        assert.equal(result.outcome, 'emeraldTablets');
        assert.deepEqual(result.consumedIds, ids);
        assert.equal(result.producedItems.length, 1);
        const tablet = store.snapshot(playerId).find(item => item.type === 'emeraldTablets');
        assert.equal(tablet.type, 'emeraldTablets');
        assert.equal(tablet.author, original.author);
        assert.equal(tablet.ownerId, original.ownerId);
        assert.deepEqual(tablet.entries, original.entries);
        assert.equal(tablet.burnable, false);
        assert.equal(tablet.isNew, true);
        assert.notEqual(tablet.id, journal.id);
        assert.equal(store.snapshot(playerId).length, 2);
        assert.equal(store.craft(playerId, position, [tablet.id], 'fire').outcome, 'unchanged');
        assert.deepEqual(store.snapshot(playerId).find(item => item.id === tablet.id), tablet);
        assert.throws(() => store.append(playerId, position, tablet.id, 'Forgery'), { code: 'JOURNAL_FORBIDDEN' });
        assert.throws(() => store.strike(playerId, position, tablet.id, 0, 0, 1), { code: 'JOURNAL_FORBIDDEN' });
        assert.throws(() => store.craft(playerId, position, ids, null), { code: 'ITEM_NOT_FOUND' });
        const recovered = createInventoryStore({ dataFile });
        assert.deepEqual(recovered.drops[0].items.find(item => item.id === tablet.id).entries, original.entries);
        const reader = randomUUID();
        recovered.register(reader, position);
        recovered.pickup(reader, position, recovered.drops[0].id);
        assert.deepEqual(recovered.snapshot(reader).find(item => item.id === tablet.id), tablet);
    }
});

test('empty and foreign journals can also be preserved', t => {
    const { store, playerId, item } = setup(t);
    const journal = item('journal');
    const salt = item('salSmaragdinum');
    const reader = randomUUID();
    store.register(reader, position);
    store.disconnectAll([{ id: playerId, position }]);
    store.pickup(reader, position, store.drops[0].id);
    const result = store.craft(reader, position, [journal.id, salt.id], null);
    assert.deepEqual(result.producedItems[0].entries, []);
    assert.equal(result.producedItems[0].author, journal.author);
    assert.equal(result.producedItems[0].ownerId, playerId);
});

test('persisted inscriptions reject partial authorship and invalid strike ranges without resetting storage', t => {
    const { store, playerId, item, dataFile } = setup(t);
    store.append(playerId, position, item('journal').id, 'Ink');
    store.craft(playerId, position, [item('journal').id, item('salSmaragdinum').id], null);
    const valid = JSON.parse(readFileSync(dataFile, 'utf8'));
    for (const corrupt of [
        tablet => { delete tablet.author; },
        tablet => { tablet.entries[0].strikes = [[0, 99]]; }
    ]) {
        const state = structuredClone(valid);
        corrupt(state.players[0].items.find(item => item.type === 'emeraldTablets'));
        const text = JSON.stringify(state);
        writeFileSync(dataFile, text);
        assert.throws(() => createInventoryStore({ dataFile }), /Invalid inventory storage schema/);
        assert.equal(readFileSync(dataFile, 'utf8'), text);
    }
});
