import { placementHash } from './stone-generator.js';

export function generateTrees(origin, getHeight, size = 64, seed = 12) {
    const trees = [];
    const hash = (x, z, salt) => placementHash(x, z, salt + seed * 31 + 701);
    const random = (x, z, salt) => hash(x, z, salt) / 4294967296;
    const cell = 192;
    for (let cx = Math.floor((origin.x - 42) / cell); cx <= Math.floor((origin.x + size + 42) / cell); cx++) {
        for (let cz = Math.floor((origin.z - 42) / cell); cz <= Math.floor((origin.z + size + 42) / cell); cz++) {
            if (random(cx, cz, 1) > 0.48)
                continue;
            const centerX = (cx + 0.2 + random(cx, cz, 2) * 0.6) * cell;
            const centerZ = (cz + 0.2 + random(cx, cz, 3) * 0.6) * cell;
            const count = 3 + hash(cx, cz, 4) % 6;
            for (let index = 0; index < count; index++) {
                const salt = 10 + index * 5;
                const angle = random(cx, cz, salt) * Math.PI * 2;
                const radius = Math.sqrt(random(cx, cz, salt + 1)) * 38;
                const x = centerX + Math.cos(angle) * radius;
                const z = centerZ + Math.sin(angle) * radius;
                if (x < origin.x || x >= origin.x + size || z < origin.z || z >= origin.z + size)
                    continue;
                const slope = Math.hypot(getHeight(x + 2, z) - getHeight(x - 2, z),
                    getHeight(x, z + 2) - getHeight(x, z - 2)) / 4;
                if (slope > 0.65)
                    continue;
                trees.push({
                    seed: hash(cx, cz, salt + 2), size: 4 + random(cx, cz, salt + 3) * 5,
                    position: [x - origin.x, getHeight(x, z) - origin.y - 0.22, z - origin.z]
                });
            }
        }
    }
    return trees;
}
