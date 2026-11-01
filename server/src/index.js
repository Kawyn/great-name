import { createSocketServer } from './socket-server.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
}

const server = createSocketServer({ port, host });

server.on('listening', () => {
    console.info(`Socket server listening on ws://${host}:${port}/socket`);
});

server.on('error', (error) => {
    console.error('Socket server error:', error);
    process.exitCode = 1;
});

const shutdown = () => {
    for (const socket of server.clients) {
        socket.terminate();
    }
    server.close();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
