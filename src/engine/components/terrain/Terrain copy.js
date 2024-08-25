class Terrain extends Component {

    material;

    /** @type {TerrainPart[]} */
    _chunks = {};

    constructor(material, chunkSize = 64) {
        super();

        this.material = material;
        this.chunkSize = chunkSize;
    }

    onPostInitialize() {


    }


    showChunk(x, y, quality) {

        if (!this._chunks[`${x}_${y}`])
            this.createChunk(x, y);

        this._chunks[`${x}_${y}`].show();

    }

    createChunk(x, z) {

        const heightMap = this.getHeightMap(x * this.chunkSize, z * this.chunkSize, this.chunkSize + 1, this.chunkSize + 1);
        const mesh = this.getMeshFromHeightMap(heightMap, x * this.chunkSize, z * this.chunkSize);
        var gaia = Scene.Instance.GetActorByIdentifier('terrain').GetCompnentByType(Gaia);
        const biomes = [];

        let offsetX = this.chunkSize * x;
        let offsetY = this.chunkSize * z;

        for (let xx = 0; xx < heightMap.length - 1; xx++) {

            for (let xz = 0; xz < heightMap.length - 1; xz++) {

                biomes.push(...gaia.getBiome(xx + offsetX, xz + offsetY));
                biomes.push(...gaia.getBiome(xx + offsetX, xz + offsetY));
                biomes.push(...gaia.getBiome(xx + offsetX, xz + offsetY));
                biomes.push(...gaia.getBiome(xx + offsetX + 1, xz + offsetY + 1));
                biomes.push(...gaia.getBiome(xx + offsetX + 1, xz + offsetY + 1));
                biomes.push(...gaia.getBiome(xx + offsetX + 1, xz + offsetY + 1));
            }
        }

        mesh.biomes = new Float32Array(biomes);
        const chunk = new TerrainPart();
        const obj = new Actor(`terrain__${x}_${z}`, [
            new Transform({ position: [x * this.chunkSize, 0, z * this.chunkSize], scale: [1, 1, 1] }),
            new Renderable(mesh, this.material),
            new Renderable(mesh, simpleMaterial, 'shadowcasters'),
            chunk
        ]);

        obj.parent = this.actor;

        Scene.Instance.pushActor(obj);
        this._chunks[`${x}_${z}`] = chunk;
    }

    getHeightMap(x, z, width, height) {

        const map = [];

        for (let i = 0; i < width; i++) {

            map.push([]);

            for (let j = 0; j < height; j++) {

                map[i][j] = this.getHeight(x + i, z + j);
            }
        }

        return map;
    }

    biomes = [];

    setBiomeFuction() {

    }

    getBiome() {

    }

    getHeight(x, z) {

        return Math.sin(x / 10) + Math.cos(z / 10);
    }


    hideAllChunks() {

        for (const key in this._chunks) {

            this._chunks[key].hide();
        }
    }

    hideChunk() {

        this._chunks[key].hide();
    }

    static getNormalForTriangle(p1, p2, p3) {

        const A = p2.map((v, i) => p2[i] - p1[i]);
        const B = p3.map((v, i) => p3[i] - p1[i]);

        return [
            A[1] * B[2] - A[2] * B[1],
            A[2] * B[0] - A[0] * B[2],
            A[0] * B[1] - A[1] * B[0],
        ]

    }


    // Nowa funkcja do obliczania normalnej
    calculateNormal(x, z, delta) {

        // Pomocnicza funkcja do normalizacji wektora
        function normalize(v) {
            const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
            return [v[0] / length, v[1] / length, v[2] / length];
        }

        // Pomocnicza funkcja do obliczania iloczynu wektorowego
        function cross(v1, v2) {
            return [
                v1[1] * v2[2] - v1[2] * v2[1],
                v1[2] * v2[0] - v1[0] * v2[2],
                v1[0] * v2[1] - v1[1] * v2[0]
            ];
        }
        const h = this.getHeight(x, z);
        const hX = this.getHeight(x + delta, z);
        const hZ = this.getHeight(x, z + delta);

        const tangentX = normalize([delta, hX - h, 0]);
        const tangentZ = normalize([0, hZ - h, delta]);

        return normalize(cross(tangentZ, tangentX));
    }

    getMeshFromHeightMap(heightMap, offsetX, offsetZ) {


        const delta = 0.1; // Dostosuj w razie potrzeby

        const vertices = [];
        const uv = [];
        const normals = [];

        for (let x = 0; x < heightMap.length - 1; x++) {

            for (let z = 0; z < heightMap.length - 1; z++) {
                // Wierzchołki trójkątów
                const p1 = [x + 1, heightMap[x + 1][z], z];
                const p2 = [x, heightMap[x][z], z];
                const p3 = [x, heightMap[x][z + 1], z + 1];
                const p4 = [x + 1, heightMap[x + 1][z + 1], z + 1];

                // Dodanie wierzchołków do listy
                vertices.push(...p1);
                vertices.push(...p2);
                vertices.push(...p3);

                vertices.push(...p3);
                vertices.push(...p4);
                vertices.push(...p1);

                // Współrzędne UV
                uv.push(1, 0);
                uv.push(0, 0);
                uv.push(0, 1);
                uv.push(0, 1);
                uv.push(1, 1);
                uv.push(1, 0);

                // Obliczenie normalnych dla każdego wierzchołka
                const normal1 = this.calculateNormal(offsetX + x + 1, offsetZ + z, delta);
                const normal2 = this.calculateNormal(offsetX + x, offsetZ + z, delta);
                const normal3 = this.calculateNormal(offsetX + x, offsetZ + z + 1, delta);
                const normal4 = this.calculateNormal(offsetX + x + 1, offsetZ + z + 1, delta);
                // Dodanie normalnych do listy
                normals.push(...normal1);
                normals.push(...normal2);
                normals.push(...normal3);

                normals.push(...normal3);
                normals.push(...normal4);
                normals.push(...normal1);
            }
        }

        const mesh = new Mesh(vertices, normals, uv, null);

        return mesh;
    }
}