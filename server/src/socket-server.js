import { WebSocket, WebSocketServer } from 'ws';
import { randomInt, randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { getHeight } from './world/terrain-generator.js';
import { performance } from 'node:perf_hooks';
import { advancePlayer, isMovementCommand, playerState, terrainOffset } from './world/simulation.js';

export function createSocketServer({ port = 3001, host = '127.0.0.1' } = {}) {
    const server = new WebSocketServer({ port, host, path: '/socket' });
    const players = new Map();
    server.players = players;
    let worldWorker;
    let closing = false;
    const pendingWorlds = new Set();
    const spawn = { x: randomInt(-128, 129) * 64, z: randomInt(-128, 129) * 64 };

    const sendWorld = (player) => {
        player.lastWorldSentAt = performance.now();
        player.socket.send(JSON.stringify({
            ...player.world,
            revision: player.revision,
            terrainOffset: terrainOffset(player)
        }));
        player.socket.send(JSON.stringify(playerState(player, players)));
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
            const worker = new Worker(new URL('./world/world-worker.js', import.meta.url));
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
                        recipient.socket.send(JSON.stringify(playerState(recipient, players)));
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
            advancePlayer(player, deltaTime, now);
            if (player.anchor && !pendingWorlds.has(player.id) &&
                Math.max(Math.abs(player.position.x - player.anchor.x), Math.abs(player.position.z - player.anchor.z)) >= 64) {
                requestWorld(player);
            }
        }
        for (const player of players.values()) {
            if (player.anchor && player.socket.readyState === WebSocket.OPEN && player.socket.bufferedAmount < 1024 * 1024)
                player.socket.send(JSON.stringify(playerState(player, players)));
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
        const sendError = (code, message) => {
            console.warn(`Rejected client command: ${code}`);
            socket.send(JSON.stringify({ command: 'error', code, message }));
        };

        console.info('Client connected.');
        socket.on('message', (data, isBinary) => {
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

            switch (message.command) {
                case 'register':
                    if (playerId === null) {
                        playerId = randomUUID();
                        // Join near an existing player so multiplayer is immediately visible.
                        const nearby = players.values().next().value?.position ?? spawn;
                        const x = nearby.x + (players.size ? 8 : 0);
                        const z = nearby.z + (players.size ? 12 : 0);
                        players.set(playerId, {
                            id: playerId, socket, position: { x, y: getHeight(x, z), z },
                            anchor: null, world: null, revision: 0, input: null, inputReceivedAt: 0
                        });
                    }
                    socket.send(JSON.stringify({ command: 'registered', playerId }));
                    break;
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
                    players.get(playerId).input = {
                        forward: message.forward, right: message.right, yaw: message.yaw
                    };
                    players.get(playerId).inputReceivedAt = performance.now();
                    break;
                default:
                    sendError('UNKNOWN_COMMAND', 'Unknown command.');
            }
        });
        socket.on('error', (error) => {
            console.error('Client socket error:', error);
        });
        socket.on('close', () => {
            if (playerId !== null)
                players.delete(playerId);
            console.info('Client disconnected.');
        });
    });

    return server;
}
