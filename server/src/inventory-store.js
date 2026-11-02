import { randomInt, randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ELEMENTS, resolveCraft } from './crafting.js';
import { createTerrainGenerator } from './world/terrain-generator.js';
import { createStoneSites, validStoneId } from './world/stone-inscriptions.js';
import { createResinSites, validResinId } from './world/resin-sites.js';

const TYPES = new Set(['journal', 'emeraldTablets', 'preparedTablet', 'bitumen', 'salSmaragdinum', 'citrineArsenicum', 'argentumVivum', 'ash', 'water', 'lye', 'resin', 'hardenedResin', 'speedPotion', 'speedEssence']);
export const INVENTORY_CAPACITY = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const controls = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;
const positionIsValid = position => position && ['x', 'y', 'z'].every(key => Number.isFinite(position[key]));
export const validRequestId = value => typeof value === 'string' && value.length > 0 &&
    value.length <= 128 && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
export const validJournalText = value => typeof value === 'string' && value.trim().length > 0 &&
    value.length <= 4000 && !controls.test(value);

export class InventoryError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function reject(code, message) {
    throw new InventoryError(code, message);
}

function validateState(state) {
    const invalid = () => { throw new Error('Invalid inventory storage schema; refusing to reset persisted data.'); };
    if (!state || state.version !== 1 || !Number.isInteger(state.seed) || state.seed < 0 || state.seed > 65535 ||
        !positionIsValid(state.spawn) || !Array.isArray(state.players) || !Array.isArray(state.drops) ||
        !Array.isArray(state.inscriptions) || !Array.isArray(state.harvestedResin) ||
        !state.harvestedResin.every(validResinId) ||
        new Set(state.harvestedResin).size !== state.harvestedResin.length)
        invalid();
    const containers = new Set();
    const items = new Set();
    const stones = new Set();
    for (const inscription of state.inscriptions) {
        if (!inscription || !validStoneId(inscription.stoneId) || stones.has(inscription.stoneId) ||
            (inscription.scarf !== undefined && (!positionIsValid(inscription.scarf) ||
                !positionIsValid(inscription.lootPosition))) ||
            !Array.isArray(inscription.normal) || inscription.normal.length !== 3 ||
            !inscription.normal.every(Number.isFinite) || Math.abs(Math.hypot(...inscription.normal) - 1) > 0.001 ||
            !Array.isArray(inscription.items) || inscription.items.length !== 1 ||
            inscription.items[0]?.type !== 'preparedTablet')
            invalid();
        stones.add(inscription.stoneId);
    }
    for (const [group, held] of [[state.players, true], [state.drops, false], [state.inscriptions, false]]) {
        for (const container of group) {
            if (!container || !UUID.test(container.id) || containers.has(container.id) ||
                !positionIsValid(container.position) || !Array.isArray(container.items) ||
                container.items.length > 1000 ||
                (!held && container.items.length === 0))
                invalid();
            containers.add(container.id);
            if (held && container.emeraldStage !== undefined &&
                (!Number.isInteger(container.emeraldStage) || container.emeraldStage < 0 || container.emeraldStage > 2))
                invalid();
            if (held && container.charred !== undefined && typeof container.charred !== 'boolean')
                invalid();
            if (held && container.departureStoneId !== undefined &&
                (!validStoneId(container.departureStoneId) || !state.inscriptions.some(entry =>
                    entry.stoneId === container.departureStoneId && entry.items[0]?.ownerId === container.id && !entry.scarf)))
                invalid();
            for (const item of container.items) {
                if (!item || !UUID.test(item.id) || items.has(item.id) || !TYPES.has(item.type) ||
                    typeof item.isNew !== 'boolean')
                    invalid();
                items.add(item.id);
                if (item.type === 'journal' || (['emeraldTablets', 'preparedTablet'].includes(item.type) &&
                    ['ownerId', 'author', 'entries'].some(key => item[key] !== undefined))) {
                    if (!UUID.test(item.ownerId) || item.author !== `Alchemist ${item.ownerId.slice(0, 8)}` ||
                        !Array.isArray(item.entries) || item.entries.length > 200)
                        invalid();
                    for (const entry of item.entries) {
                        if (!entry || !validJournalText(entry.text) || !Array.isArray(entry.strikes))
                            invalid();
                        let lastEnd = -1;
                        for (const strike of entry.strikes) {
                            if (!Array.isArray(strike) || strike.length !== 2 ||
                                !Number.isInteger(strike[0]) || !Number.isInteger(strike[1]) ||
                                strike[0] < 0 || strike[0] >= strike[1] || strike[1] > entry.text.length ||
                                strike[0] <= lastEnd)
                                invalid();
                            lastEnd = strike[1];
                        }
                    }
                }
            }
        }
    }
}

function atomicWrite(file, state) {
    mkdirSync(dirname(file), { recursive: true });
    const pending = `${file}.${randomUUID()}.pending`;
    let fd;
    try {
        fd = openSync(pending, 'wx', 0o600);
        writeFileSync(fd, JSON.stringify(state));
        fsyncSync(fd);
        closeSync(fd);
        fd = undefined;
        renameSync(pending, file);
    }
    finally {
        if (fd !== undefined)
            closeSync(fd);
        try { unlinkSync(pending); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
}

function leaveRemains(next, player, inscription, getHeight) {
    const x = inscription.position.x + inscription.normal[0] * 2.5;
    const z = inscription.position.z + inscription.normal[2] * 2.5;
    inscription.scarf = { x, y: getHeight(x, z) + 0.12, z };
    const lootPosition = { x: x + inscription.normal[2] * 1.2, z: z - inscription.normal[0] * 1.2 };
    lootPosition.y = getHeight(lootPosition.x, lootPosition.z);
    inscription.lootPosition = lootPosition;
    if (player.items.length)
        next.drops.push({ id: randomUUID(), position: lootPosition, items: player.items });
    next.players = next.players.filter(entry => entry.id !== player.id);
}

export function createInventoryStore({ dataFile, seed = 12, spawn } = {}) {
    const file = dataFile === undefined ? null : resolve(dataFile);
    let state;
    if (file) {
        try { state = JSON.parse(readFileSync(file, 'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (state === undefined) {
        state = {
            version: 1, seed,
            spawn: spawn ?? { x: randomInt(-128, 129) * 64, y: 0, z: randomInt(-128, 129) * 64 },
            players: [], drops: [], inscriptions: [], harvestedResin: []
        };
        validateState(state);
        if (file)
            atomicWrite(file, state);
    }
    else {
        if (state && state.inscriptions === undefined)
            state.inscriptions = [];
        if (state && state.harvestedResin === undefined)
            state.harvestedResin = [];
        validateState(state);
        if (state.players.length) {
            const recovered = structuredClone(state);
            const { getHeight } = createTerrainGenerator(recovered.seed);
            for (const player of recovered.players) {
                if (player.departureStoneId)
                    leaveRemains(recovered, player, recovered.inscriptions.find(entry =>
                        entry.stoneId === player.departureStoneId), getHeight);
                else if (player.items.length)
                    recovered.drops.push({ id: randomUUID(), position: player.position, items: player.items });
            }
            recovered.players = [];
            atomicWrite(file, recovered);
            state = recovered;
        }
    }

    const { getHeight } = createTerrainGenerator(state.seed);
    const sites = createStoneSites(state.seed, getHeight);
    const resinSites = createResinSites(state.seed, createTerrainGenerator(state.seed).getHeight);
    let anchorsChanged = false;
    for (const inscription of state.inscriptions) {
        const site = sites.nearby(inscription.position, 64).find(site => site.stoneId === inscription.stoneId);
        if (!site)
            throw new Error(`Cannot locate the mounted tablet's stone: ${inscription.stoneId}`);
        const position = { x: site.position[0], y: site.position[1], z: site.position[2] };
        if (['x', 'y', 'z'].some(key => inscription.position[key] !== position[key]) ||
            site.normal.some((value, axis) => value !== inscription.normal[axis])) {
            inscription.position = position;
            inscription.normal = [...site.normal];
            anchorsChanged = true;
        }
    }
    if (anchorsChanged && file)
        atomicWrite(file, state);
    const nearbySite = (position, stoneId) => {
        if (!validStoneId(stoneId))
            reject('INVALID_STONE', 'This stone cannot hold a tablet.');
        const site = sites.nearby(position, 6).find(site => site.stoneId === stoneId);
        if (!site)
            reject('STONE_TOO_FAR', 'Move closer to the stone.');
        return site;
    };
    const transaction = mutation => {
        const next = structuredClone(state);
        const result = mutation(next);
        validateState(next);
        if (file)
            atomicWrite(file, next);
        state = next;
        return result;
    };
    const holder = (next, playerId, position) => {
        const player = next.players.find(player => player.id === playerId);
        if (!player)
            reject('NOT_REGISTERED', 'Register before managing inventory.');
        if (!positionIsValid(position))
            throw new Error('Invalid authoritative position.');
        player.position = { ...position };
        return player;
    };
    const ownedJournal = (player, itemId) => {
        const journal = player.items.find(item => item.id === itemId && item.type === 'journal');
        if (!journal || journal.ownerId !== player.id)
            reject('JOURNAL_FORBIDDEN', 'Only the original owner holding this journal can modify it.');
        return journal;
    };

    return {
        get seed() { return state.seed; },
        get spawn() { return { ...state.spawn }; },
        get drops() { return structuredClone(state.drops); },
        get dropStates() {
            return state.drops.map(drop => ({ id: drop.id, position: { ...drop.position }, count: drop.items.length }));
        },
        resinSites(position) {
            const harvested = new Set(state.harvestedResin);
            return resinSites.nearby(position).filter(site => !harvested.has(site.id));
        },
        stoneSites(position) {
            return sites.nearby(position).map(site => {
                const entry = state.inscriptions.find(entry => entry.stoneId === site.stoneId);
                return { ...site, occupied: !!entry,
                    ...(entry?.scarf ? { scarf: [entry.scarf.x, entry.scarf.y, entry.scarf.z] } : {}) };
            });
        },
        departureSite(playerId) {
            const entry = state.inscriptions.find(entry => entry.items[0].ownerId === playerId && !entry.scarf);
            return entry ? { stoneId: entry.stoneId, position: { ...entry.position } } : null;
        },
        beginJourney(playerId, position, stoneId) {
            transaction(next => {
                const player = holder(next, playerId, position);
                if (!next.inscriptions.some(entry => entry.stoneId === stoneId &&
                    entry.items[0].ownerId === playerId && !entry.scarf))
                    reject('INVALID_DEPARTURE', 'The departure requires this alchemist\'s own tablet.');
                player.departureStoneId = stoneId;
            });
        },
        endJourney(playerId, stoneId) {
            transaction(next => {
                const player = next.players.find(entry => entry.id === playerId);
                const inscription = next.inscriptions.find(entry => entry.stoneId === stoneId &&
                    entry.items[0].ownerId === playerId && !entry.scarf);
                if (!player || player.departureStoneId !== stoneId || !inscription)
                    reject('INVALID_DEPARTURE', 'This alchemist has no unfinished departure at this stone.');
                leaveRemains(next, player, inscription, getHeight);
            });
        },
        readInscription(playerId, position, stoneId) {
            if (!state.players.some(player => player.id === playerId))
                reject('NOT_REGISTERED', 'Register before reading a tablet.');
            nearbySite(position, stoneId);
            const inscription = state.inscriptions.find(entry => entry.stoneId === stoneId);
            if (!inscription)
                reject('INSCRIPTION_NOT_FOUND', 'There is no tablet here.');
            return structuredClone(inscription.items[0]);
        },
        placeInscription(playerId, position, itemId, stoneId) {
            const site = nearbySite(position, stoneId);
            transaction(next => {
                const player = holder(next, playerId, position);
                if (next.inscriptions.some(entry => entry.stoneId === stoneId))
                    reject('STONE_OCCUPIED', 'A tablet already rests on this stone.');
                const tablet = player.items.find(item => item.id === itemId && item.type === 'preparedTablet');
                if (!tablet)
                    reject('ITEM_NOT_FOUND', 'A prepared tablet is required.');
                next.inscriptions.push({
                    id: randomUUID(), stoneId, normal: [...site.normal],
                    position: { x: site.position[0], y: site.position[1], z: site.position[2] },
                    items: [tablet]
                });
                player.items = player.items.filter(item => item.id !== itemId);
            });
        },
        snapshot(playerId) {
            return structuredClone(state.players.find(player => player.id === playerId)?.items ?? [])
                .map(item => ({ ...item, burnable: item.type === 'journal' }));
        },
        emeraldStage(playerId) {
            const player = state.players.find(player => player.id === playerId);
            if (!player)
                reject('NOT_REGISTERED', 'Register before reading the alchemist appearance.');
            return player.emeraldStage ?? 0;
        },
        charred(playerId) {
            const player = state.players.find(player => player.id === playerId);
            if (!player)
                reject('NOT_REGISTERED', 'Register before reading the alchemist appearance.');
            return player.charred ?? false;
        },
        register(playerId, position) {
            transaction(next => {
                if (next.players.some(player => player.id === playerId))
                    throw new Error('Player is already registered.');
                next.players.push({
                    id: playerId, position: { ...position },
                    items: [{
                        id: randomUUID(), type: 'journal', ownerId: playerId,
                        author: `Alchemist ${playerId.slice(0, 8)}`, entries: [], isNew: false
                    }, { id: randomUUID(), type: 'salSmaragdinum', isNew: false },
                    { id: randomUUID(), type: 'bitumen', isNew: false }]
                });
            });
        },
        disconnectAll(players) {
            transaction(next => {
                for (const { id, position } of players) {
                    const player = next.players.find(player => player.id === id);
                    if (!player)
                        continue;
                    if (player.departureStoneId) {
                        leaveRemains(next, player, next.inscriptions.find(entry =>
                            entry.stoneId === player.departureStoneId), getHeight);
                        continue;
                    }
                    if (player.items.length)
                        next.drops.push({ id: randomUUID(), position: { ...position }, items: player.items });
                    next.players = next.players.filter(player => player.id !== id);
                }
            });
        },
        pickup(playerId, position, dropId) {
            transaction(next => {
                const player = holder(next, playerId, position);
                if (validResinId(dropId)) {
                    const site = resinSites.nearby(position, 6).find(site => site.id === dropId);
                    if (!site)
                        reject('RESOURCE_TOO_FAR', 'Move closer to the resin.');
                    if (next.harvestedResin.includes(dropId))
                        reject('RESOURCE_DEPLETED', 'There is nothing left to gather here.');
                    if (player.items.length >= INVENTORY_CAPACITY)
                        reject('INVENTORY_FULL', 'There is no room in your bag.');
                    next.harvestedResin.push(dropId);
                    player.items.push({ id: randomUUID(), type: 'resin', isNew: true });
                    return;
                }
                const drop = next.drops.find(drop => drop.id === dropId);
                if (!drop)
                    reject('DROP_NOT_FOUND', 'This loot bundle no longer exists.');
                if (Math.hypot(position.x - drop.position.x, position.y - drop.position.y,
                    position.z - drop.position.z) > 6)
                    reject('DROP_TOO_FAR', 'Move within six meters of the loot bundle.');
                const available = INVENTORY_CAPACITY - player.items.length;
                if (available <= 0)
                    reject('INVENTORY_FULL', 'There is no room in your bag.');
                const picked = drop.items.splice(0, available);
                player.items.push(...picked.map(item => ({ ...item, isNew: true })));
                if (!drop.items.length)
                    next.drops = next.drops.filter(candidate => candidate.id !== dropId);
            });
        },
        drop(playerId, position, itemId) {
            transaction(next => {
                const player = holder(next, playerId, position);
                const item = player.items.find(item => item.id === itemId);
                if (!item)
                    reject('ITEM_NOT_FOUND', 'This item is not in your inventory.');
                next.drops.push({ id: randomUUID(), position: { ...position }, items: [item] });
                player.items = player.items.filter(candidate => candidate.id !== itemId);
            });
        },
        drink(playerId, position, itemId, hasEssence = false) {
            return transaction(next => {
                const player = holder(next, playerId, position);
                const item = player.items.find(item => item.id === itemId);
                if (!item)
                    reject('ITEM_NOT_FOUND', 'This item is not in your inventory.');
                if (!['speedPotion', 'speedEssence'].includes(item.type))
                    reject('NOT_DRINKABLE', 'This cannot be drunk.');
                if (item.type === 'speedEssence' && hasEssence)
                    reject('ESSENCE_ALREADY_ACTIVE', 'The essence can strengthen you only once.');
                player.items = player.items.filter(candidate => candidate.id !== itemId);
                return { type: item.type };
            });
        },
        craft(playerId, position, itemIds, element) {
            return transaction(next => {
                const player = holder(next, playerId, position);
                if (!Array.isArray(itemIds) || !itemIds.every(id => typeof id === 'string') ||
                    new Set(itemIds).size !== itemIds.length ||
                    !((element === null && itemIds.length === 2) ||
                        (ELEMENTS.has(element) && itemIds.length === 1)))
                    reject('INVALID_CRAFT', 'Choose two different items or one item and one element.');
                const items = itemIds.map(id => player.items.find(item => item.id === id));
                if (items.some(item => !item))
                    reject('ITEM_NOT_FOUND', 'A selected item is no longer in your bag.');
                const recipe = resolveCraft(items, element);
                const { outcome, consumedIds } = recipe;
                const producedItems = recipe.producedItems.map(item => ({ ...item, id: randomUUID(), isNew: true }));
                if (player.items.length - consumedIds.length + producedItems.length > INVENTORY_CAPACITY)
                    reject('INVENTORY_FULL', 'There is no room in your bag.');
                player.items = player.items.filter(item => !consumedIds.includes(item.id));
                player.items.push(...producedItems);
                for (const item of producedItems) {
                    if (item.ownerId === playerId && item.type === 'emeraldTablets')
                        player.emeraldStage = 1;
                }
                if (outcome === 'ashes' && items.some(item =>
                    item.type === 'journal' && item.ownerId === playerId && consumedIds.includes(item.id)))
                    player.charred = true;
                return { outcome, consumedIds, producedItems };
            });
        },
        seen(playerId, position, itemId) {
            transaction(next => {
                const item = holder(next, playerId, position).items.find(item => item.id === itemId);
                if (!item)
                    reject('ITEM_NOT_FOUND', 'This item is not in your inventory.');
                item.isNew = false;
            });
        },
        append(playerId, position, itemId, text) {
            transaction(next => {
                const journal = ownedJournal(holder(next, playerId, position), itemId);
                if (!validJournalText(text))
                    reject('INVALID_JOURNAL_TEXT', 'Use nonempty plain text of at most 4000 characters, without control characters except newline and tab.');
                if (journal.entries.length >= 200)
                    reject('JOURNAL_FULL', 'A journal can contain at most 200 entries.');
                journal.entries.push({ text, strikes: [] });
            });
        },
        strike(playerId, position, itemId, entryIndex, start, end) {
            transaction(next => {
                const journal = ownedJournal(holder(next, playerId, position), itemId);
                const entry = Number.isInteger(entryIndex) && entryIndex >= 0 ? journal.entries[entryIndex] : null;
                if (!entry || !Number.isInteger(start) || !Number.isInteger(end) ||
                    start < 0 || start >= end || end > entry.text.length)
                    reject('INVALID_JOURNAL_RANGE', 'Supply a valid entry and a nonempty [start, end) character range.');
                const merged = [];
                for (const range of [...entry.strikes, [start, end]].sort((a, b) => a[0] - b[0])) {
                    const last = merged.at(-1);
                    if (last && range[0] <= last[1])
                        last[1] = Math.max(last[1], range[1]);
                    else
                        merged.push([...range]);
                }
                entry.strikes = merged;
            });
        }
    };
}
