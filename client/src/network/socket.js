(() => {
    const configuredUrl = document.querySelector('meta[name="socket-url"]').content;
    const url = new URL(configuredUrl || window.location.href);

    if (!configuredUrl) {
        url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        url.port = '3001';
        url.pathname = '/socket';
        url.search = '';
        url.hash = '';
    }

    let socket;
    let reconnectTimeout;
    let stopped = false;
    let playerId = null;
    let world = null;
    let worldRequested = false;
    let state = null;
    let inventory = null;
    let nextRequestId = 0;
    const requests = new Map();
    const isVector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
    const isEmeraldStage = value => value === undefined || Number.isInteger(value) && value >= 0 && value <= 2;
    const isCharred = value => value === undefined || typeof value === 'boolean';
    const isMotion = value => value === undefined || value && typeof value.airborne === 'boolean' &&
        Number.isFinite(value.verticalVelocity) &&
        Number.isSafeInteger(value.landingId) && value.landingId >= 0 &&
        Number.isFinite(value.landingSpeed) && value.landingSpeed >= 0;
    const isPlayerId = value => typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    const setStatus = (text, id, parameters = {}) => {
        const status = document.getElementById('world-status');
        if (status && status.getAttribute('data-scene-error') !== 'true') {
            status.hidden = false;
            status.textContent = text;
            GameInterface.localize(status, id, parameters, text);
        }
    };
    const clearWorld = () => {
        inventory = null;
        for (const { reject, timer } of requests.values()) {
            window.clearTimeout(timer);
            reject(new Error('Connection closed before the server committed the operation.'));
        }
        requests.clear();
        world = null;
        worldRequested = false;
        state = null;
        window.dispatchEvent(new CustomEvent('worldcleared'));
    };

    window.GameConnection = {
        get playerId() { return playerId; },
        get world() { return world; },
        get state() { return state; },
        get inventory() { return inventory; },
        endJourneyView() {
            stopped = true;
            window.clearTimeout(reconnectTimeout);
            socket.close(1000, 'Journey ended');
        },
        sendCommand(message) {
            if (!playerId || stopped || socket.readyState !== WebSocket.OPEN)
                throw new Error('Not connected to the game server.');
            socket.send(JSON.stringify(message));
        },
        request(command, fields) {
            const requestId = `client-${++nextRequestId}`;
            return new Promise((resolve, reject) => {
                const timer = window.setTimeout(() => {
                    requests.delete(requestId);
                    reject(new Error('Server operation timed out. Check the inventory before retrying.'));
                }, 10000);
                requests.set(requestId, { resolve, reject, timer });
                try {
                    this.sendCommand({ ...fields, command, requestId });
                }
                catch (error) {
                    window.clearTimeout(timer);
                    requests.delete(requestId);
                    reject(error);
                }
            });
        },
        sendJump() {
            if (!world || stopped || socket.readyState !== WebSocket.OPEN)
                return;
            socket.send(JSON.stringify({ command: 'jump' }));
        },
        sendInput(forward, right, yaw) {
            if (![forward, right, yaw].every(Number.isFinite) ||
                Math.abs(forward) > 1 || Math.abs(right) > 1 || Math.abs(yaw) > 180) {
                console.error('Invalid movement input.');
                return;
            }
            if (!world || stopped || socket.readyState !== WebSocket.OPEN)
                return;
            socket.send(JSON.stringify({ command: 'move', forward, right, yaw }));
        }
    };

    const connect = () => {
        const connection = new WebSocket(url.href);
        socket = connection;
        connection.addEventListener('open', () => {
            if (stopped || socket !== connection)
                return;
            console.info('Connected to the socket server.');
            setStatus('Rejestracja gracza...', 'status.registering');
            connection.send(JSON.stringify({ command: 'register' }));
        });
        connection.addEventListener('message', (event) => {
            if (stopped || socket !== connection)
                return;

            if (typeof event.data !== 'string') {
                console.error('Invalid server message: expected JSON text.');
                return;
            }

            let message;
            try {
                message = JSON.parse(event.data);
            }
            catch (error) {
                if (!(error instanceof SyntaxError))
                    throw error;
                console.error('Invalid server JSON:', error);
                return;
            }

            if (!message || typeof message !== 'object' || Array.isArray(message)) {
                console.error('Invalid server command:', message);
                return;
            }

            switch (message.command) {
                case 'inventory':
                    try {
                        if (playerId === null)
                            throw new Error('Inventory received before registration.');
                        ServerInventory.validate(message.items);
                    }
                    catch (error) {
                        console.error('Invalid server inventory:', error);
                        return;
                    }
                    inventory = message.items;
                    window.dispatchEvent(new CustomEvent('inventoryreceived', { detail: inventory }));
                    break;
                case 'operationResult': {
                    const request = requests.get(message.requestId);
                    if (!request || typeof message.ok !== 'boolean')
                        break;
                    requests.delete(message.requestId);
                    window.clearTimeout(request.timer);
                    if (message.ok)
                        request.resolve(message.result);
                    else
                        request.reject(new Error(message.message || 'Server rejected the operation.'));
                    break;
                }
                case 'registered':
                    if (!isPlayerId(message.playerId)) {
                        console.error('Invalid player ID:', message.playerId);
                        return;
                    }
                    if (playerId !== null && playerId !== message.playerId) {
                        console.error('Server changed the player ID on an existing connection.');
                        return;
                    }
                    playerId = message.playerId;
                    console.info('Player registered:', playerId);
                    if (!worldRequested) {
                        worldRequested = true;
                        setStatus('Serwer generuje teren...', 'status.generating');
                        connection.send(JSON.stringify({ command: 'getWorld' }));
                    }
                    break;
                case 'world':
                    if (playerId === null || !worldRequested) {
                        console.error('Received terrain before registration.');
                        setStatus('Blad: teren otrzymany przed rejestracja.', 'status.unregistered');
                        return;
                    }
                    try {
                        HeightMapMesh.validateWorld(message);
                        if (!Number.isSafeInteger(message.revision) || message.revision < 1 ||
                            !isVector(message.terrainOffset))
                            throw new Error('Invalid terrain snapshot revision or offset.');
                    }
                    catch (error) {
                        console.error('Invalid server terrain:', error);
                        setStatus('Blad danych terenu z serwera.', 'status.invalidTerrain');
                        return;
                    }
                    if (world && message.revision <= world.revision)
                        break;
                    world = message;
                    state = null;
                    setStatus('Przygotowywanie terenu...', 'status.preparing');
                    window.dispatchEvent(new CustomEvent('worldreceived', { detail: world }));
                    break;
                case 'worldDelta': {
                    try {
                        if (!world || message.baseRevision !== world.revision ||
                            message.revision !== world.revision + 1 ||
                            !Array.isArray(message.chunkShift) || message.chunkShift.length !== 2 ||
                            !message.chunkShift.every(value => Number.isSafeInteger(value) && Math.abs(value) <= 2) ||
                            message.chunkShift.every(value => value === 0) ||
                            !isVector(message.terrainOffset) || !Array.isArray(message.chunks))
                            throw new Error('Invalid incremental terrain revision or shift.');
                        const [dx, dz] = message.chunkShift;
                        const retained = world.chunks
                            .map(chunk => ({ ...chunk, x: chunk.x - dx, z: chunk.z - dz }))
                            .filter(chunk => Math.abs(chunk.x) <= world.radius && Math.abs(chunk.z) <= world.radius);
                        const next = { ...message, command: 'world', chunks: [...retained, ...message.chunks] };
                        HeightMapMesh.validateWorld(next);
                        world = next;
                    }
                    catch (error) {
                        console.error('Invalid incremental server terrain:', error);
                        setStatus('Blad aktualizacji terenu z serwera.', 'status.invalidDelta');
                        return;
                    }
                    state = null;
                    window.dispatchEvent(new CustomEvent('worldreceived', { detail: world }));
                    break;
                }
                case 'state': {
                    if (!world || message.revision !== world.revision)
                        break;
                    const ids = new Set();
                    if (!isVector(message.terrainOffset) || !Array.isArray(message.players) || !isEmeraldStage(message.emeraldStage) ||
                        !isCharred(message.charred) || !isMotion(message.motion) ||
                        (message.originStar !== undefined && (!isVector(message.originStar) ||
                            message.originStar[1] <= 0 || Math.abs(Math.hypot(...message.originStar) - 1) > 0.0001)) ||
                        (message.dayCycle !== undefined && (!message.dayCycle ||
                            !Number.isFinite(message.dayCycle.phase) || message.dayCycle.phase < 0 || message.dayCycle.phase >= 1 ||
                            !Number.isFinite(message.dayCycle.duration) || message.dayCycle.duration <= 0)) ||
                        (message.drops !== undefined && !LootDrops.validate(message.drops)) ||
                        (message.stoneSites !== undefined && !StoneInscriptions.validate(message.stoneSites)) ||
                        !message.players.every(other => {
                            if (!other || !isPlayerId(other.id) || other.id === playerId ||
                                ids.has(other.id) || !isVector(other.position) || !isEmeraldStage(other.emeraldStage) ||
                                !isCharred(other.charred) || !isMotion(other.motion))
                                return false;
                            ids.add(other.id);
                            return true;
                        })) {
                        console.error('Invalid server simulation state:', message);
                        return;
                    }
                    state = message;
                    window.dispatchEvent(new CustomEvent('networkstate', { detail: state }));
                    break;
                }
                case 'journeyStarted':
                    if (!isVector(message.direction) || Math.abs(Math.hypot(...message.direction) - 1) > 0.001 ||
                        message.direction[1] !== 0 || !Number.isFinite(message.speed) || message.speed <= 0 ||
                        message.speed > 100 || !/^stone-[a-f0-9]{32}$/.test(message.stoneId)) {
                        console.error('Invalid departure start:', message);
                        return;
                    }
                    window.dispatchEvent(new CustomEvent('journeystarted', { detail: message }));
                    break;
                case 'journeyEnded':
                    if (!/^stone-[a-f0-9]{32}$/.test(message.stoneId)) {
                        console.error('Invalid departure completion:', message);
                        return;
                    }
                    window.dispatchEvent(new CustomEvent('journeyended', { detail: message }));
                    break;
                case 'error':
                    console.error('Server command error:', message.code, message.message);
                    setStatus(`Blad serwera: ${message.message}`, 'status.error', { message: message.message });
                    break;
                default:
                    console.error('Unknown server command:', message.command);
            }
        });
        connection.addEventListener('error', (event) => {
            console.error('Socket connection error:', event);
        });
        connection.addEventListener('close', () => {
            if (!stopped && socket === connection) {
                playerId = null;
                clearWorld();
                setStatus('Brak polaczenia z serwerem. Ponawianie...', 'status.disconnected');
                console.warn('Socket disconnected. Reconnecting in 2 seconds.');
                reconnectTimeout = window.setTimeout(connect, 2000);
            }
        });
    };

    window.addEventListener('pagehide', () => {
        stopped = true;
        playerId = null;
        clearWorld();
        window.clearTimeout(reconnectTimeout);
        socket.close();
    });

    window.addEventListener('pageshow', () => {
        if (stopped) {
            stopped = false;
            connect();
        }
    });

    connect();
})();
