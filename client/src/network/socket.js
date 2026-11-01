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
    const isVector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
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
        world = null;
        worldRequested = false;
        state = null;
        window.dispatchEvent(new CustomEvent('worldcleared'));
    };

    window.GameConnection = {
        get playerId() { return playerId; },
        get world() { return world; },
        get state() { return state; },
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
                    if (!isVector(message.terrainOffset) || !Array.isArray(message.players) ||
                        !message.players.every(other => {
                            if (!other || !isPlayerId(other.id) || other.id === playerId ||
                                ids.has(other.id) || !isVector(other.position))
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
