import { createSocketServer } from './socket-server.js';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
}

const dataFile = process.env.DATA_FILE ?? fileURLToPath(new URL('../data/world.json', import.meta.url));
if (!dataFile.trim())
    throw new Error('DATA_FILE must be a nonempty file path.');
const server = createSocketServer({ port, host, dataFile });

server.on('listening', () => {
    console.info(`Socket server listening on ws://${host}:${port}/socket`);
});

server.on('error', (error) => {
    console.error('Socket server error:', error);
    process.exitCode = 1;
});

const shutdown = () => {
    server.close();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
