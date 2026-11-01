class Terrain extends Component {
    #parts = new Map();
    #pendingChunks = [];
    #chunkSize;
    #step;
    #revision;
    #transform;
    #targetOffset;
    #chunkOrigin = [0, 0];

    onPostInitialize() {
        this.#transform = this.actor.GetCompnentByType(Transform);
        if (!this.#transform)
            throw new Error('Server terrain requires a Transform for relative movement.');
    }

    constructor(kit = {}) {
        if (!kit.material)
            throw new Error('Terrain requires a material.');
        super(kit);
    }

    onEnable() {
        Scene.Instance.TimeManager.addObjectToRefresh(this, 200);
        window.addEventListener('worldreceived', this.onWorldReceived);
        window.addEventListener('worldcleared', this.clear);
        window.addEventListener('networkstate', this.onState);
        if (window.GameConnection?.world)
            this.setWorld(window.GameConnection.world);
    }

    onWorldReceived = (event) => {
        this.setWorld(event.detail);
    };

    setWorld(world) {
        HeightMapMesh.validateWorld(world);
        const incremental = world.baseRevision === this.#revision && Array.isArray(world.chunkShift);
        if (incremental) {
            const [dx, dz] = world.chunkShift;
            this.#chunkOrigin = [this.#chunkOrigin[0] + dx, this.#chunkOrigin[1] + dz];
            const retained = new Map();
            for (const [key, part] of this.#parts) {
                const [x, z] = key.split('x').map(Number);
                const nx = x - dx;
                const nz = z - dz;
                if (Math.abs(nx) > world.radius || Math.abs(nz) > world.radius) {
                    part.destroy();
                }
                else {
                    const transform = part.GetCompnentByType(Transform);
                    transform.position.value = [nx * world.chunkSize, 0, nz * world.chunkSize];
                    retained.set(`${nx}x${nz}`, part);
                }
            }
            this.#parts = retained;
            // Rebase retained geometry and its eased offset by opposite amounts.
            this.#transform.position.value = this.#transform.position.value.map((value, index) =>
                value + (index === 0 ? dx : index === 2 ? dz : 0) * world.chunkSize);
        }
        else {
            this.clear();
            this.#chunkOrigin = [0, 0];
            this.#transform.position.value = [...(world.terrainOffset ?? [0, 0, 0])];
        }
        this.#chunkSize = world.chunkSize;
        this.#step = world.step;
        this.#revision = world.revision;
        this.#targetOffset = [...(world.terrainOffset ?? [0, 0, 0])];
        this.#pendingChunks = world.chunks.filter(chunk => !this.#parts.has(`${chunk.x}x${chunk.z}`)).sort((a, b) =>
            a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z);
    }

    onState = (event) => {
        if (event.detail.revision === this.#revision &&
            event.detail.terrainOffset.some((value, index) => value !== this.#transform.position.value[index])) {
            this.#targetOffset = [...event.detail.terrainOffset];
        }
    };

    onRefresh(deltaTime = 0) {
        if (this.#targetOffset) {
            const blend = 1 - Math.exp(-12 * Math.max(0, deltaTime));
            const position = this.#transform.position.value.map((value, index) => {
                const target = this.#targetOffset[index];
                return Math.abs(target - value) < 0.0001 ? target : value + (target - value) * blend;
            });
            if (position.some((value, index) => value !== this.#transform.position.value[index]))
                this.#transform.position.value = position;
        }
        // Build nearby chunks first, without constructing the entire scene in one frame.
        for (let i = 0; i < 2 && this.#pendingChunks.length; i++) {
            const chunk = this.#pendingChunks.shift();
            const mesh = HeightMapMesh.build(chunk, this.#chunkSize, this.#step);
            mesh.surfaceOrigin = [
                (chunk.x + this.#chunkOrigin[0]) * this.#chunkSize, 0,
                (chunk.z + this.#chunkOrigin[1]) * this.#chunkSize
            ];
            const material = this.material.clone();
            material.isMeshDirty = true;
            const shadowMaterial = simpleMaterial.clone();
            shadowMaterial.postprocess = () => shadowMaterial.isMeshDirty = false;
            const part = new Actor(`terrain_${chunk.x + this.#chunkOrigin[0]}x${chunk.z + this.#chunkOrigin[1]}`, [
                new Transform({ position: [chunk.x * this.#chunkSize, 0, chunk.z * this.#chunkSize] }),
                new TerrainPart({ meshes: [mesh] }),
                new Renderable(mesh, material),
                new Renderable(mesh, shadowMaterial, 'shadowcasters'),
                ...(chunk.stones?.length ? [new Stone({
                    stones: chunk.stones, material: this.stoneMaterial, shadowMaterial: simpleMaterial
                })] : [])
            ]);
            part.parent = this.actor;
            Scene.Instance.PushActor(part);
            this.#parts.set(`${chunk.x}x${chunk.z}`, part);
            if (this.#pendingChunks.length === 0) {
                const status = document.getElementById('world-status');
                if (status && status.getAttribute('data-scene-error') !== 'true')
                    status.hidden = true;
            }
        }
    }

    clear = () => {
        this.#pendingChunks = [];
        this.#targetOffset = null;
        for (const part of this.#parts.values())
            part.destroy();
        this.#parts.clear();
    };

    onDisable() {
        Scene.Instance.TimeManager.removeObjectToRefresh(this);
        window.removeEventListener('worldreceived', this.onWorldReceived);
        window.removeEventListener('worldcleared', this.clear);
        window.removeEventListener('networkstate', this.onState);
        this.clear();
    }
}
