import { WebSocket, WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { createTerrainGenerator } from './world/terrain-generator.js';
import { performance } from 'node:perf_hooks';
import { advancePlayer, isMovementCommand, playerState, terrainOffset, SPEED_POTION_DURATION_MS, MOVE_SPEED, speedMultiplier } from './world/simulation.js';
import { createInventoryStore, InventoryError, validRequestId } from './inventory-store.js';
import { dayCycle } from './world/day-cycle.js';
import { beginDeparture, DEPARTURE_END_SECONDS } from './world/departure.js';

export function createSocketServer({ port = 3001, host = '127.0.0.1', dataFile, seed = 12 } = {}) {
    const store = createInventoryStore({ dataFile, seed });
    const { getHeight } = createTerrainGenerator(store.seed);
    const server = new WebSocketServer({ port, host, path: '/socket', maxPayload: 32 * 1024 });
    const players = new Map();
    server.players = players;
    server.inventoryStore = store;
    let worldWorker;
    let closing = false;
    const pendingWorlds = new Set();
    const spawn = store.spawn;
    const clockEpoch = Date.now();
    const clockStarted = performance.now();
    const worldClock = () => dayCycle(clockEpoch + performance.now() - clockStarted);
    const stateFor = (player, cycle = worldClock()) => ({
        ...playerState(player, players, [...store.dropStates, ...store.resinSites(player.position)]),
        dayCycle: cycle,
        stoneSites: store.stoneSites(player.position).map(site => ({
            ...site, position: site.position.map((value, axis) => value - [player.position.x, player.position.y, player.position.z][axis]),
            ...(site.scarf ? { scarf: site.scarf.map((value, axis) =>
                value - [player.position.x, player.position.y, player.position.z][axis]) } : {})
        }))
    });
    const sendInventory = player => player.socket.send(JSON.stringify({
        command: 'inventory', items: store.snapshot(player.id)
    }));
    const originalClose = server.close.bind(server);
    const finishDeparture = player => {
        store.endJourney(player.id, player.departure.stoneId);
        player.departure.ended = true;
        player.input = null;
    };
    server.close = callback => {
        if (!closing) {
            closing = true;
            clearInterval(simulation);
            if (worldWorker)
                worldWorker.terminate();
            pendingWorlds.clear();
            try {
                for (const player of players.values())
                    if (player.departure && !player.departure.ended)
                        finishDeparture(player);
                store.disconnectAll([...players.values()]);
            }
            catch (error) {
                console.error('Could not persist shutdown loot; held items will recover on restart:', error);
                process.exitCode = 1;
            }
            players.clear();
            for (const socket of server.clients)
                socket.terminate();
        }
        return originalClose(callback);
    };

    const sendWorld = (player) => {
        player.lastWorldSentAt = performance.now();
        player.socket.send(JSON.stringify({
            ...player.world,
            revision: player.revision,
            terrainOffset: terrainOffset(player)
        }));
        player.socket.send(JSON.stringify(stateFor(player)));
    };
    const failWorlds = (error) => {
        console.error('World generation failed:', error);
        for (const id of pendingWorlds) {
            const recipient = players.get(id);
            if (recipient?.socket.readyState === WebSocket.OPEN) {
                recipient.socket.send(JSON.stringify({
                    command: 'error',
                    code: 'WORLD_GENERATION_FAILED',
                    message: 'Could not generate the surrounding terrain.'
                }));
            }
        }
        pendingWorlds.clear();
        worldWorker = null;
    };

    const requestWorld = (player) => {
        if (pendingWorlds.has(player.id))
            return;
        if (!worldWorker) {
            const worker = new Worker(new URL('./world/world-worker.js', import.meta.url), {
                workerData: { seed: store.seed }
            });
            worldWorker = worker;
            worker.on('message', ({ playerId, world }) => {
                pendingWorlds.delete(playerId);
                const recipient = players.get(playerId);
                if (recipient?.socket.readyState === WebSocket.OPEN) {
                    const baseRevision = recipient.revision;
                    const chunkShift = recipient.pendingShift;
                    const retained = recipient.pendingChunks;
                    recipient.anchor = recipient.pendingAnchor;
                    recipient.pendingAnchor = null;
                    recipient.pendingChunks = null;
                    recipient.world = { ...world, chunks: [...retained, ...world.chunks] };
                    recipient.revision++;
                    if (baseRevision === 0) {
                        sendWorld(recipient);
                    }
                    else {
                        recipient.lastWorldSentAt = performance.now();
                        recipient.socket.send(JSON.stringify({
                            ...world, command: 'worldDelta', baseRevision,
                            revision: recipient.revision, chunkShift,
                            terrainOffset: terrainOffset(recipient)
                        }));
                        recipient.socket.send(JSON.stringify(stateFor(recipient)));
                    }
                }
            });
            worker.on('error', failWorlds);
            worker.on('exit', code => {
                if (!closing && worldWorker === worker)
                    failWorlds(new Error(`World worker exited unexpectedly (${code}).`));
            });
        }
        pendingWorlds.add(player.id);
        player.pendingShift = player.anchor ? [
            Math.trunc((player.position.x - player.anchor.x) / 64),
            Math.trunc((player.position.z - player.anchor.z) / 64)
        ] : [0, 0];
        const [dx, dz] = player.pendingShift;
        // Keep a stable chunk lattice and height origin private to this connection.
        player.pendingAnchor = player.anchor ? {
            x: player.anchor.x + dx * 64, y: player.anchor.y, z: player.anchor.z + dz * 64
        } : { ...player.position };
        player.pendingChunks = player.world ? player.world.chunks
            .map(chunk => ({ ...chunk, x: chunk.x - dx, z: chunk.z - dz }))
            .filter(chunk => Math.abs(chunk.x) <= 6 && Math.abs(chunk.z) <= 6) : [];
        worldWorker.postMessage({
            playerId: player.id, position: player.pendingAnchor,
            excludedChunks: player.pendingChunks.map(({ x, z }) => ({ x, z }))
        });
    };
    let previousTick = performance.now();
    const simulation = setInterval(() => {
        const now = performance.now();
        const deltaTime = (now - previousTick) / 1000;
        previousTick = now;
        for (const player of players.values()) {
            if (player.departure?.ended)
                continue;
            if (!player.departure) {
                const departure = beginDeparture(player, store.departureSite(player.id), now);
                if (departure) {
                    try {
                        store.beginJourney(player.id, player.position, departure.stoneId);
                        player.socket.send(JSON.stringify({ command: 'journeyStarted', ...departure,
                            speed: MOVE_SPEED * speedMultiplier(player, now) }));
                    }
                    catch (error) {
                        player.departure = null;
                        console.error('Could not commit departure start:', error);
                        player.socket.send(JSON.stringify({ command: 'error', code: 'STORAGE_FAILED',
                            message: 'The departure could not begin.' }));
                        player.socket.close(1011, 'Departure storage failed');
                        continue;
                    }
                }
            }
            advancePlayer(player, deltaTime, now, getHeight);
            if (player.departure && (now - player.departure.startedAt) / 1000 >= DEPARTURE_END_SECONDS) {
                try {
                    finishDeparture(player);
                    sendInventory(player);
                    player.socket.send(JSON.stringify({ command: 'journeyEnded', stoneId: player.departure.stoneId }));
                }
                catch (error) {
                    console.error('Could not commit alchemist departure:', error);
                    player.socket.send(JSON.stringify({ command: 'error', code: 'STORAGE_FAILED',
                        message: 'The departure could not be committed.' }));
                    player.socket.close(1011, 'Departure storage failed');
                }
            }
            if (player.anchor && !pendingWorlds.has(player.id) &&
                Math.max(Math.abs(player.position.x - player.anchor.x), Math.abs(player.position.z - player.anchor.z)) >= 64) {
                requestWorld(player);
            }
        }
        const cycle = worldClock();
        for (const player of players.values()) {
            if (player.anchor && player.socket.readyState === WebSocket.OPEN && player.socket.bufferedAmount < 1024 * 1024)
                player.socket.send(JSON.stringify(stateFor(player, cycle)));
        }
    }, 50);
    server.on('close', () => {
        closing = true;
        clearInterval(simulation);
        if (worldWorker)
            worldWorker.terminate();
        pendingWorlds.clear();
    });

    server.on('connection', (socket) => {
        let playerId = null;
        let currentMessage;
        let tokens = 30;
        let tokenTime = performance.now();
        const sendError = (code, message) => {
            console.warn(`Rejected client command: ${code}`);
            socket.send(JSON.stringify({ command: 'error', code, message }));
            if (['journalAppend', 'journalStrike', 'inventoryDrop', 'craft', 'drink', 'placeInscription', 'readInscription'].includes(currentMessage?.command) &&
                validRequestId(currentMessage.requestId))
                socket.send(JSON.stringify({
                    command: 'operationResult', requestId: currentMessage.requestId, ok: false, message
                }));
        };

        console.info('Client connected.');
        socket.on('message', (data, isBinary) => {
            currentMessage = null;
            if (closing)
                return;
            if (isBinary) {
                sendError('INVALID_MESSAGE', 'Commands must be JSON text messages.');
                return;
            }

            let message;
            try {
                message = JSON.parse(data.toString());
            }
            catch (error) {
                if (!(error instanceof SyntaxError))
                    throw error;
                sendError('INVALID_JSON', 'The message is not valid JSON.');
                return;
            }

            if (!message || typeof message !== 'object' || Array.isArray(message) ||
                typeof message.command !== 'string') {
                sendError('INVALID_COMMAND', 'A command string is required.');
                return;
            }

            currentMessage = message;
            if (playerId !== null && players.get(playerId)?.departure &&
                !['getWorld', 'move'].includes(message.command)) {
                sendError('DEPARTURE_ACTIVE', 'This alchemist cannot act during departure.');
                return;
            }
            if (message.command !== 'move') {
                const now = performance.now();
                tokens = Math.min(30, tokens + (now - tokenTime) / 100);
                tokenTime = now;
                if (tokens < 1) {
                    sendError('RATE_LIMIT', 'Wait before sending another inventory or world operation.');
                    return;
                }
                tokens--;
            }

            try {
            switch (message.command) {
                case 'register':
                    if (playerId === null) {
                        const id = randomUUID();
                        // Join near an existing player so multiplayer is immediately visible.
                        const companion = [...players.values()].find(player => !player.departure?.ended);
                        const nearby = companion?.position ?? spawn;
                        const x = nearby.x + (companion ? 8 : 0);
                        const z = nearby.z + (companion ? 12 : 0);
                        const position = { x, y: getHeight(x, z), z };
                        store.register(id, position);
                        playerId = id;
                        players.set(playerId, {
                            id: playerId, socket, position,
                            anchor: null, world: null, revision: 0, input: null, inputReceivedAt: 0
                        });
                    }
                    socket.send(JSON.stringify({ command: 'registered', playerId }));
                    sendInventory(players.get(playerId));
                    break;
                case 'pickup':
                case 'inventorySeen':
                case 'inventoryDrop':
                case 'craft':
                case 'drink':
                case 'placeInscription':
                case 'readInscription':
                case 'journalAppend':
                case 'journalStrike': {
                    if (playerId === null) {
                        sendError('NOT_REGISTERED', 'Register before managing inventory.');
                        break;
                    }
                    const acknowledged = message.command.startsWith('journal') ||
                        ['inventoryDrop', 'craft', 'drink', 'placeInscription', 'readInscription'].includes(message.command);
                    const fields = {
                        pickup: ['command', 'dropId'],
                        inventorySeen: ['command', 'itemId'],
                        inventoryDrop: ['command', 'itemId', 'requestId'],
                        craft: ['command', 'itemIds', 'element', 'requestId'],
                        drink: ['command', 'itemId', 'requestId'],
                        placeInscription: ['command', 'itemId', 'stoneId', 'requestId'],
                        readInscription: ['command', 'stoneId', 'requestId'],
                        journalAppend: ['command', 'itemId', 'text', 'requestId'],
                        journalStrike: ['command', 'itemId', 'entryIndex', 'start', 'end', 'requestId']
                    }[message.command];
                    if (Object.keys(message).length !== fields.length ||
                        !fields.every(field => Object.hasOwn(message, field)) ||
                        (!['craft', 'readInscription'].includes(message.command) &&
                            typeof message[message.command === 'pickup' ? 'dropId' : 'itemId'] !== 'string') ||
                        (['placeInscription', 'readInscription'].includes(message.command) && typeof message.stoneId !== 'string') ||
                        (acknowledged && !validRequestId(message.requestId))) {
                        sendError('INVALID_INVENTORY_COMMAND', 'Supply only the required inventory command fields and a valid operation requestId.');
                        break;
                    }
                    const player = players.get(playerId);
                    const { position } = player;
                    let result;
                    if (message.command === 'pickup')
                        store.pickup(playerId, position, message.dropId);
                    else if (message.command === 'inventorySeen')
                        store.seen(playerId, position, message.itemId);
                    else if (message.command === 'inventoryDrop')
                        store.drop(playerId, position, message.itemId);
                    else if (message.command === 'craft') {
                        result = store.craft(playerId, position, message.itemIds, message.element);
                        player.emeraldStage = store.emeraldStage(playerId);
                        player.charred = store.charred(playerId);
                    }
                    else if (message.command === 'drink') {
                        result = store.drink(playerId, position, message.itemId, player.speedEssence === true);
                        if (result.type === 'speedEssence')
                            player.speedEssence = true;
                        else
                            player.speedPotionUntil = performance.now() + SPEED_POTION_DURATION_MS;
                    }
                    else if (message.command === 'placeInscription')
                        store.placeInscription(playerId, position, message.itemId, message.stoneId);
                    else if (message.command === 'readInscription')
                        result = store.readInscription(playerId, position, message.stoneId);
                    else if (message.command === 'journalAppend')
                        store.append(playerId, position, message.itemId, message.text);
                    else
                        store.strike(playerId, position, message.itemId, message.entryIndex, message.start, message.end);
                    if (message.command !== 'readInscription')
                        sendInventory(player);
                    if (acknowledged)
                        socket.send(JSON.stringify({ command: 'operationResult', requestId: message.requestId, ok: true,
                            ...(result ? { result } : {}) }));
                    break;
                }
                case 'getWorld':
                    if (playerId === null) {
                        sendError('NOT_REGISTERED', 'Register before requesting the world.');
                        break;
                    }
                    if (players.get(playerId).world) {
                        const player = players.get(playerId);
                        if (performance.now() - player.lastWorldSentAt < 1000 || socket.bufferedAmount > 1024 * 1024) {
                            sendError('WORLD_RATE_LIMIT', 'Wait before requesting another terrain snapshot.');
                            break;
                        }
                        sendWorld(players.get(playerId));
                    }
                    else {
                        requestWorld(players.get(playerId));
                    }
                    break;
                case 'jump': {
                    if (playerId === null) {
                        sendError('NOT_REGISTERED', 'Register before jumping.');
                        break;
                    }
                    if (Object.keys(message).length !== 1) {
                        sendError('INVALID_JUMP', 'Jump accepts no client physics or position fields.');
                        break;
                    }
                    const player = players.get(playerId);
                    if (!player.anchor) {
                        sendError('WORLD_NOT_READY', 'Wait for the terrain before jumping.');
                        break;
                    }
                    if (!player.airborne)
                        player.jumpRequested = true;
                    break;
                }
                case 'move':
                    if (playerId === null) {
                        sendError('NOT_REGISTERED', 'Register before sending movement input.');
                        break;
                    }
                    if (!isMovementCommand(message)) {
                        sendError('INVALID_MOVEMENT', 'Expected forward/right in [-1, 1] and yaw in [-180, 180], without extra fields.');
                        break;
                    }
                    if (!players.get(playerId).anchor) {
                        sendError('WORLD_NOT_READY', 'Wait for the terrain before moving.');
                        break;
                    }
                    if (players.get(playerId).departure)
                        break;
                    players.get(playerId).input = {
                        forward: message.forward, right: message.right, yaw: message.yaw
                    };
                    players.get(playerId).inputReceivedAt = performance.now();
                    break;
                default:
                    sendError('UNKNOWN_COMMAND', 'Unknown command.');
            }
            }
            catch (error) {
                if (error instanceof InventoryError)
                    sendError(error.code, error.message);
                else {
                    console.error('Inventory operation failed:', error);
                    sendError('STORAGE_FAILED', 'The operation could not be committed. Please retry later.');
                }
            }
        });
        socket.on('error', (error) => {
            console.error('Client socket error:', error);
        });
        socket.on('close', () => {
            if (playerId !== null && players.has(playerId)) {
                try {
                    const player = players.get(playerId);
                    if (player.departure && !player.departure.ended)
                        finishDeparture(player);
                    store.disconnectAll([players.get(playerId)]);
                }
                catch (error) {
                    console.error('Could not persist disconnected loot; held items will recover on restart:', error);
                }
                players.delete(playerId);
            }
            console.info('Client disconnected.');
        });
    });

    return server;
}
