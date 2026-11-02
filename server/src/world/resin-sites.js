import { createHash } from 'node:crypto';
import { generateTrees } from './tree-generator.js';

export const validResinId = id => typeof id === 'string' && /^resin-[a-f0-9]{32}$/.test(id);

export function createResinSites(seed, getHeight) {
    const cache = new Map();
    const cellSize = 192;
    const cell = (x, z) => {
        const key = `${x}:${z}`;
        if (cache.has(key))
            return cache.get(key);
        const origin = { x: x * cellSize, y: 0, z: z * cellSize };
        const sites = generateTrees(origin, getHeight, cellSize, seed)
            .filter(tree => tree.seed % 5 === 0)
            .map(tree => {
                const x = origin.x + tree.position[0] + 0.8;
                const z = origin.z + tree.position[2] + 0.5;
                return {
                    id: `resin-${createHash('sha256').update(`${seed}:${x}:${z}`).digest('hex').slice(0, 32)}`,
                    position: { x, y: getHeight(x, z), z }, count: 1, kind: 'resin'
                };
            });
        if (cache.size >= 128)
            cache.delete(cache.keys().next().value);
        cache.set(key, sites);
        return sites;
    };
    return {
        nearby(position, radius = 384) {
            const sites = [];
            for (let x = Math.floor((position.x - radius - 1) / cellSize); x <= Math.floor((position.x + radius + 1) / cellSize); x++)
                for (let z = Math.floor((position.z - radius - 1) / cellSize); z <= Math.floor((position.z + radius + 1) / cellSize); z++)
                    for (const site of cell(x, z))
                        if (Math.hypot(site.position.x - position.x, site.position.y - position.y,
                            site.position.z - position.z) <= radius + 1e-9)
                            sites.push({ ...site, position: { ...site.position } });
            return sites;
        }
    };
}
