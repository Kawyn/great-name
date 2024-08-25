class Gaia extends Terrain {

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
            [0, 64],
            [0, 256]
        ])

    ];

    setBiomeFuction() {

    }

    // https://thebookofshaders.com/12/
    getBiome(x, z) {

        x /= this.biomeSize;
        z /= this.biomeSize;

        const xi = Math.floor(x);
        const zi = Math.floor(z);

        const xf = x - xi;
        const zf = z - zi;
        let biomeX, biomeZ;
        biomeX = x;
        biomeZ = z;

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


        const primaryBiomeIntensity = easeOutQuint(((1 - (primaryBiome[2] / (primaryBiome[2] + secondaryBiome[2]))) * 2) - 1) / 2 + 0.5
        return [closestBiomes.indexOf(primaryBiome), closestBiomes.indexOf(secondaryBiome), primaryBiomeIntensity];
    }

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

    onInitialize() {

        noise.seed(12);
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
    xxx = 500;

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
}

class BiomeMaterial extends MaterialWithTexture {


    _compileParams(gl) {
        super._compileParams(gl);

        this.#compileBiomes(gl);
    }

    _setParmas(gl, renderer, renderable) {
        super._setParmas(gl, renderer, renderable);

        this.#setBiomes(gl, renderer, renderable);
    }

    #compileBiomes(gl) {

        this._locations['a_biome'] = gl.getAttribLocation(this._program, 'a_biome');
        this._buffers['a_biome'] = gl.createBuffer();
    }

    #setBiomes(gl, renderer, renderable) {


        gl.bindBuffer(WebGLRenderingContext.ARRAY_BUFFER, this._buffers['a_biome']);
        gl.bufferData(WebGLRenderingContext.ARRAY_BUFFER, renderable.mesh.biomes, WebGLRenderingContext.STATIC_DRAW);
        gl.enableVertexAttribArray(this._locations['a_biome']);

        gl.vertexAttribPointer(this._locations['a_biome'], 3, WebGLRenderingContext.FLOAT, false, 0, 0);
    }
}