import StoneGeometry from '../../../client/src/shared/StoneGeometry.js';
import { generateStones } from './stone-generator.js';

export const validStoneId = id => typeof id === 'string' && /^stone-[a-f0-9]{32}$/.test(id);

export function createStoneSites(seed, getHeight) {
    const cache = new Map();
    const cell = (x, z) => {
        const id = `${x}:${z}`;
        if (cache.has(id))
            return cache.get(id);
        const stone = generateStones({ x: x * 512, y: 0, z: z * 512 }, getHeight, 512, seed)
            .find(stone => stone.id);
        const site = stone ? StoneGeometry.mountingPoint({
            ...stone, position: [stone.position[0] + x * 512, stone.position[1], stone.position[2] + z * 512]
        }, getHeight) : null;
        if (cache.size >= 128)
            cache.delete(cache.keys().next().value);
        cache.set(id, site ? { stoneId: stone.id, ...site } : null);
        return cache.get(id);
    };
    return {
        nearby(position, radius = 384) {
            const sites = [];
            for (let x = Math.floor((position.x - radius) / 512); x <= Math.floor((position.x + radius) / 512); x++)
                for (let z = Math.floor((position.z - radius) / 512); z <= Math.floor((position.z + radius) / 512); z++) {
                    const site = cell(x, z);
                    if (site && Math.hypot(site.position[0] - position.x,
                        site.position[1] - position.y, site.position[2] - position.z) <= radius)
                        sites.push(site);
                }
            return sites;
        }
    };
}
