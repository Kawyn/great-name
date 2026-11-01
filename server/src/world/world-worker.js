import { parentPort } from 'node:worker_threads';
import { generateWorld } from './terrain-generator.js';

parentPort.on('message', ({ playerId, position, excludedChunks }) => {
    parentPort.postMessage({ playerId, world: generateWorld(position, excludedChunks) });
});
