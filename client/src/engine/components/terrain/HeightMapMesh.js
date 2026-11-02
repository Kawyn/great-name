class HeightMapMesh {
    static validateWorld(world) {
        if (world.chunkSize !== 64 || world.step !== 2 || world.radius !== 6 ||
            !Array.isArray(world.chunks) || world.chunks.length !== 169) {
            throw new Error('Invalid terrain snapshot dimensions.');
        }
        const samples = world.chunkSize / world.step + 1;
        const keys = new Set();
        for (const chunk of world.chunks) {
            if (!chunk || !Number.isInteger(chunk.x) || !Number.isInteger(chunk.z) ||
                Math.abs(chunk.x) > world.radius || Math.abs(chunk.z) > world.radius) {
                throw new Error('Invalid relative terrain chunk coordinates.');
            }
            const key = `${chunk.x}x${chunk.z}`;
            if (keys.has(key))
                throw new Error('Duplicate terrain chunk.');
            keys.add(key);
            if (chunk.stones !== undefined && (!Array.isArray(chunk.stones) || chunk.stones.length > 32 ||
                !chunk.stones.every(stone => stone && Number.isInteger(stone.seed) &&
                    stone.seed >= 0 && stone.seed <= 4294967295 &&
                    (stone.type === undefined || ['eroded', 'monolith'].includes(stone.type)) &&
                    (stone.size === undefined || Number.isFinite(stone.size) && stone.size >= 1 && stone.size <= 40) &&
                    Array.isArray(stone.position) && stone.position.length === 3 &&
                    stone.position.every(Number.isFinite) &&
                    stone.position[0] >= 0 && stone.position[0] < world.chunkSize &&
                    stone.position[2] >= 0 && stone.position[2] < world.chunkSize))) {
                throw new Error('Invalid terrain stones.');
            }
            if (chunk.trees !== undefined && (!Array.isArray(chunk.trees) || chunk.trees.length > 64 ||
                !chunk.trees.every(tree => tree && Number.isInteger(tree.seed) &&
                    tree.seed >= 0 && tree.seed <= 4294967295 && Number.isFinite(tree.size) &&
                    tree.size >= 4 && tree.size <= 9 && Array.isArray(tree.position) &&
                    tree.position.length === 3 && tree.position.every(Number.isFinite) &&
                    tree.position[0] >= 0 && tree.position[0] < world.chunkSize &&
                    tree.position[2] >= 0 && tree.position[2] < world.chunkSize)))
                throw new Error('Invalid terrain trees.');
            if (!Array.isArray(chunk.heightMap) || chunk.heightMap.length !== samples + 2 ||
                !chunk.heightMap.every(row => Array.isArray(row) && row.length === samples + 2 &&
                    row.every(Number.isFinite))) {
                throw new Error('Invalid terrain height map.');
            }
            if (!Array.isArray(chunk.biomeWeights) || chunk.biomeWeights.length !== samples ||
                !chunk.biomeWeights.every(row => Array.isArray(row) && row.length === samples &&
                    row.every(weights => Array.isArray(weights) && weights.length === 4 &&
                        weights.every(value => Number.isFinite(value) && value >= 0 && value <= 1) &&
                        Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 0.001))) {
                throw new Error('Invalid terrain biome weights.');
            }
        }
    }

    static build(chunk, size, step) {
        const cells = size / step;
        const samples = cells + 1;
        const count = samples * samples;
        const vertices = new Float32Array(count * 3);
        const normals = new Float32Array(count * 3);
        const uv = new Float32Array(count * 2);
        const biomes = new Float32Array(count * 4);
        const indices = new Uint16Array(cells * cells * 6);
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        const height = (x, z) => chunk.heightMap[x + 1][z + 1];
        for (let x = 0; x < samples; x++) {
            for (let z = 0; z < samples; z++) {
                const index = x * samples + z;
                const y = height(x, z);
                vertices.set([x * step, y, z * step], index * 3);
                minHeight = Math.min(minHeight, y);
                maxHeight = Math.max(maxHeight, y);
                const nx = height(x - 1, z) - height(x + 1, z);
                const nz = height(x, z - 1) - height(x, z + 1);
                const ny = 2 * step;
                const length = Math.hypot(nx, ny, nz);
                normals.set([nx / length, ny / length, nz / length], index * 3);
                uv.set([x * step / size * 8, z * step / size * 8], index * 2);
                biomes.set(chunk.biomeWeights[x][z], index * 4);
            }
        }
        for (let x = 0; x < cells; x++) {
            for (let z = 0; z < cells; z++) {
                const a = x * samples + z;
                const b = a + samples;
                indices.set([b, a, a + 1, a + 1, b + 1, b], (x * cells + z) * 6);
            }
        }
        const mesh = new Mesh(vertices, normals, uv, null);
        mesh.biomes = biomes;
        mesh.indices = indices;
        mesh.bounds = {
            center: [size / 2, (minHeight + maxHeight) / 2, size / 2],
            radius: Math.hypot(size / 2, (maxHeight - minHeight) / 2, size / 2)
        };
        return mesh;
    }
}
