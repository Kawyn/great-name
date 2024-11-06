class Terrain extends Component {

    /** @type {ShowTerrainNearbyController} */
    controller;
    /** @type {TerrainPart[]} */ _terrainParts = {};

    constructor(kit = {}) {
        kit.partSize = kit.partSize ?? 64;
        if (!kit.material) throw 'e';
        super(kit);
    }


    partIdentifierFromCoords(x, z) {
        return `${x}x${z}`;
    }

    showPart(x, z, quality) {
        const partKey = this.partIdentifierFromCoords(x, z);

        if (this._terrainParts[partKey] === undefined) {
            this.createPart(x, z);
            this._terrainParts[partKey] = null;
        } else if (this._terrainParts[partKey]) {
            this._terrainParts[partKey].show(quality);
        }
        if (Object.keys(this._terrainParts).length > 2000) {

            for (let key of Object.keys(this._terrainParts)) {

                if (this._terrainParts[key].visible == false) {
                    this._terrainParts[key].actor.destroy();
                    delete this._terrainParts[key];

                }
            }
        }
    }

    createPart(x, z) {
        const worker = new Worker('./src/engine/components/terrain/gaia/GaiaWorker.js');

        worker.postMessage({
            x,
            z,
            size: this.partSize,
            biomes: this.biomes
        });

        worker.onmessage = (event) => {
            let { meshes } = event.data;
            meshes = meshes.map(mesh => {
                const m = new Mesh(mesh.vertices, mesh.normals, mesh.uv, null)

                m.biomes = mesh.biomes;
                return m;
            });

            const material = this.material.clone();
            material.isMeshDirty = true;
            var tempMat = simpleMaterial.clone();
            tempMat.postprocess = () => tempMat.isMeshDirty = false;
            const terrainPart = new Actor(`terrain_${x}x${z}`, [
                new Transform({ position: [x * this.partSize, 0, z * this.partSize] }),

                new TerrainPart({
                    meshes: meshes, // Tutaj dodaj odpowiednie meshe
                }),

                new Renderable(meshes[0], material),
                new Renderable(meshes[0], tempMat, 'shadowcasters'),
            ]);
            terrainPart.parent = this.actor;
            // this._createPartInternal(terrainPart, heightMap);
            Scene.Instance.PushActor(terrainPart);
            this._terrainParts[this.partIdentifierFromCoords(x, z)] = terrainPart.GetCompnentByType(TerrainPart);

            if (this.controller.isPartVisible(x, z))
                this._terrainParts[this.partIdentifierFromCoords(x, z)].show(this.controller.qualityForPart(x, z));
            else {
                this._terrainParts[this.partIdentifierFromCoords(x, z)].hide();
            }
            worker.terminate();
        };

        worker.onerror = (error) => {
            console.error('Worker error:', error);
            worker.terminate();

        };
    }

    _createPartInternal(terrainPart) {

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

    getHeight(x, z) {
        return Math.sin(x / 10) + Math.cos(z / 10);
    }

    hideAllChunks() {
        for (const key in this._terrainParts) {
            this._terrainParts[key].hide();
        }
    }

    changeQuality(x, z, quality) {
        if (this._terrainParts[this.partIdentifierFromCoords(x, z)])
            this._terrainParts[this.partIdentifierFromCoords(x, z)].changeQuality(quality);
    }

    hideChunk(x, z) {
        if (this._terrainParts[this.partIdentifierFromCoords(x, z)])
            this._terrainParts[this.partIdentifierFromCoords(x, z)].hide();
    }
}