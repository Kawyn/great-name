import noise from './noise.js';
import { generateStones } from './stone-generator.js';

class Gaia {

    biomeSize = 500;
    biomes = [
        new Biome(16, [[1, 8],
        [3, 16],
        [6, 32],
        [12, 64],
        [24, 128],
        [48, 256]]),
        new Biome(4, [[0.5, 8],
        [1, 16],
        [0.5, 32],
        [1, 64],
        [0.5, 128],
        [1, 256]]),
        new Biome(-16, [
            [4, 64],
            [2, 256]
        ]),
        new Biome(16, [
            [1, 8],
            [3, 16],
            [6, 32],

            [this.biomeSize / 4, this.biomeSize]
        ])

    ];

    // https://thebookofshaders.com/12/
    otherGetBiome(x, z) {

        x /= this.biomeSize;
        z /= this.biomeSize;

        const xi = Math.floor(x);
        const zi = Math.floor(z);

        const xf = x - xi;
        const zf = z - zi;
        let biomeX, biomeZ;
        biomeX = x;
        biomeZ = z;
        // centerx, centerz, distance
        const closestBiomes = this.biomes.map(() => [0, 0, 1]);

        for (let yy = -1; yy <= 1; yy++) {
            for (let xx = -1; xx <= 1; xx++) {

                const nx = xi + xx;
                const nz = zi + yy;

                // do it better =)
                const px = noise.simplex2(nx, nz) / 2 + 0.5
                const pz = noise.simplex2(nz * 2, 3 + nx) / 2 + 0.5

                const a = xx + px - xf;
                const b = yy + pz - zf;

                const distance = Math.sqrt(a * a + b * b);
                const biome = Math.floor((noise.simplex2(nx + px, nz + pz) / 2 + 0.5) * this.biomes.length);

                if (distance < closestBiomes[biome][2]) {

                    closestBiomes[biome][2] = distance;
                    closestBiomes[biome][0] = nx + px;
                    closestBiomes[biome][1] = nz + pz;
                }
            }
        }
        let primaryBiome = [0, 0, 1];
        let secondaryBiome = [0, 0, 1];

        for (let biome of closestBiomes) {

            if (biome[2] < primaryBiome[2]) {
                secondaryBiome = primaryBiome;
                primaryBiome = biome;
            }
            else if (biome[2] < secondaryBiome[2]) {
                secondaryBiome = biome;
            }
        }


        let sum = closestBiomes.reduce((p, v) => 1 - v[2] + p, 0);

        return closestBiomes.map(v => (1 - v[2]) / sum);
    }

    // domain wrapping
    getHeight(x, z) {
        let height = 0;

        let inten = this.otherGetBiome(x, z);

        for (let i in inten) {

            height += this.biomes[i].getHeight(x, z) * inten[i];

        }

        return height;
    }
}

class Biome {

    getWarpedPosition(x, y) {

        //  return [x, y];


        let numWarps = 0;
        let warpSizeX = 0.1;
        let warpSizeY = 0.1;
        let falloff = 0.5; // Should be between 0 and 1
        let scale = 1;
        for (let i = 0; i < numWarps; i++) {
            // Scale from [-1, 1] to [-warpSize, warpSize]
            const dx = warpSizeX * noise.simplex2(x, y);
            const dy = warpSizeY * noise.simplex2(x, y);
            x += scale * dx;
            y += scale * dy;
            scale *= falloff;
        }

        return [x, y];
    }
    constructor(baseHeight, octaves) {

        this.baseHeight = baseHeight;
        this.octaves = octaves;
    }
    getHeight(x, z) {
        let height = this.baseHeight;


        for (let octave of this.octaves) {
            height += noise.simplex2(...this.getWarpedPosition(x, z).map(x => x / octave[1])) * octave[0];
        }
        return height;

    }

    toWorkerData
}

noise.seed(12);
const terrain = new Gaia();

export function getHeight(x, z) {
    return terrain.getHeight(x, z);
}

export function generateWorld(position, excludedChunks = []) {
    const chunkSize = 64;
    const step = 2;
    const radius = 6;
    const samples = chunkSize / step + 1;
    const chunks = [];
    const round = (value) => Math.round(value * 10000) / 10000;
    const excluded = new Set(excludedChunks.map(chunk => `${chunk.x}x${chunk.z}`));

    for (let x = -radius; x <= radius; x++) {
        for (let z = -radius; z <= radius; z++) {
            if (excluded.has(`${x}x${z}`))
                continue;
            const heightMap = [];
            const biomeWeights = [];
            for (let i = -1; i <= samples; i++) {
                const row = [];
                for (let j = -1; j <= samples; j++) {
                    row.push(round(getHeight(position.x + x * chunkSize + i * step,
                        position.z + z * chunkSize + j * step) - position.y));
                }
                heightMap.push(row);
            }
            for (let i = 0; i < samples; i++) {
                const row = [];
                for (let j = 0; j < samples; j++) {
                    row.push(terrain.otherGetBiome(position.x + x * chunkSize + i * step,
                        position.z + z * chunkSize + j * step).map(round));
                }
                biomeWeights.push(row);
            }
            const stones = generateStones({
                x: position.x + x * chunkSize, y: position.y, z: position.z + z * chunkSize
            }, getHeight, chunkSize);
            chunks.push({ x, z, heightMap, biomeWeights, stones });
        }
    }
    return { command: 'world', chunkSize, step, radius, chunks };
}