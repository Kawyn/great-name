function hash(x, z, salt) {
    let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(salt, 1442695041);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return (value ^ (value >>> 16)) >>> 0;
}

function foundation(x, z, size, type, getHeight) {
    const radius = size * (type === 'monolith' ? 0.35 : 0.75);
    const heights = [getHeight(x, z)];
    for (let sample = 0; sample < 8; sample++) {
        const angle = sample * Math.PI / 4;
        heights.push(getHeight(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius));
    }
    return { low: Math.min(...heights), high: Math.max(...heights) };
}

export function generateStones(origin, getHeight, size = 64) {
    const stones = [];
    const cellSize = 512;
    // World-space cells make placements independent of each player's chunk lattice.
    for (let cx = Math.floor((origin.x - 64) / cellSize); cx <= Math.floor((origin.x + size + 64) / cellSize); cx++) {
        for (let cz = Math.floor((origin.z - 64) / cellSize); cz <= Math.floor((origin.z + size + 64) / cellSize); cz++) {
            const centerX = (cx + 0.48 + hash(cx, cz, 1) / 4294967296 * 0.04) * cellSize;
            const centerZ = (cz + 0.48 + hash(cx, cz, 2) / 4294967296 * 0.04) * cellSize;
            const mainSize = 25 + hash(cx, cz, 3) / 4294967296 * 15;
            const mainSlope = Math.hypot(getHeight(centerX + 4, centerZ) - getHeight(centerX - 4, centerZ),
                getHeight(centerX, centerZ + 4) - getHeight(centerX, centerZ - 4)) / 8;
            const localSlope = Math.hypot(getHeight(centerX + 1, centerZ) - getHeight(centerX - 1, centerZ),
                getHeight(centerX, centerZ + 1) - getHeight(centerX, centerZ - 1)) / 2;
            if (mainSlope > 0.55 || localSlope > 0.8)
                continue;
            const mainType = hash(cx, cz, 10) % 2 === 0 ? 'monolith' : 'eroded';
            const mainFoundation = foundation(centerX, centerZ, mainSize, mainType, getHeight);
            if (mainFoundation.high - mainFoundation.low > mainSize * 0.45)
                continue;
            const count = 3 + hash(cx, cz, 9) % 2;
            for (let index = 0; index < count; index++) {
                const angle = hash(cx, cz, 4) / 4294967296 * Math.PI * 2 + index * 2.4;
                const distance = index === 0 ? 0 : mainSize + 6 + hash(cx, cz, 5 + index * 3) / 4294967296 * 8;
                const x = centerX + Math.cos(angle) * distance;
                const z = centerZ + Math.sin(angle) * distance;
                if (x < origin.x || x >= origin.x + size || z < origin.z || z >= origin.z + size)
                    continue;
                const slope = Math.hypot(getHeight(x + 1, z) - getHeight(x - 1, z),
                    getHeight(x, z + 1) - getHeight(x, z - 1)) / 2;
                if (slope > 0.8)
                    continue;
                const stoneSize = index === 0 ? mainSize : 2 + hash(cx, cz, 6 + index * 3) / 4294967296 * 2;
                const type = index === 0 ? mainType : 'eroded';
                const ground = index === 0 ? mainFoundation : foundation(x, z, stoneSize, type, getHeight);
                if (ground.high - ground.low > stoneSize * 0.45)
                    continue;
                stones.push({
                    seed: hash(cx, cz, 20 + index),
                    type, size: stoneSize,
                    position: [x - origin.x, ground.low - origin.y - 0.4 - stoneSize * 0.12, z - origin.z]
                });
            }
        }
    }
    return stones;
}
