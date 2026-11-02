import { parentPort, workerData } from 'node:worker_threads';
import { createTerrainGenerator } from './terrain-generator.js';

const { generateWorld } = createTerrainGenerator(workerData?.seed ?? 12);

parentPort.on('message', ({ playerId, position, excludedChunks }) => {
    parentPort.postMessage({ playerId, world: generateWorld(position, excludedChunks) });
});
