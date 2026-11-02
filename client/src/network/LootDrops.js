class LootDrops extends Component {
    static #pagesMesh = null;
    static #resinMesh = null;
    #drops = new Map();
    #state = null;
    get nearest() {
        return (window.GameConnection?.state?.drops ?? []).filter(drop => Math.hypot(...drop.position) <= 6)
            .sort((a, b) => Math.hypot(...a.position) - Math.hypot(...b.position))[0] ?? null;
    }

    constructor(bookMaterial) {
        super();
        this.bookMaterial = bookMaterial;
    }

    static resinMesh() {
        if (this.#resinMesh)
            return this.#resinMesh;
        const ring = [[1, 0.4, 0.5], [0.5, 0.4, 1], [0, 0.4, 0.5], [0.5, 0.4, 0]];
        const vertices = [], normals = [];
        for (let index = 0; index < 4; index++)
            for (const [a, b, c] of [
                [[0.45, 1, 0.48], ring[(index + 1) % 4], ring[index]],
                [[0.5, 0, 0.5], ring[index], ring[(index + 1) % 4]]
            ]) {
                const u = b.map((value, axis) => value - a[axis]);
                const v = c.map((value, axis) => value - a[axis]);
                const normal = [u[1] * v[2] - u[2] * v[1],
                    u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
                const length = Math.hypot(...normal);
                vertices.push(...a, ...b, ...c);
                for (let corner = 0; corner < 3; corner++)
                    normals.push(...normal.map(value => value / length));
            }
        this.#resinMesh = new Mesh(vertices, normals, new Float32Array(vertices.length / 3 * 2).fill(0.8));
        return this.#resinMesh;
    }

    static validate(drops) {
        const ids = new Set();
        return Array.isArray(drops) && drops.length <= 1000 && drops.every(drop => {
            if (!drop || typeof drop.id !== 'string' || !drop.id || drop.id.length > 100 ||
                ids.has(drop.id) || !Array.isArray(drop.position) || drop.position.length !== 3 ||
                !drop.position.every(Number.isFinite) || !Number.isSafeInteger(drop.count) || drop.count < 1 ||
                (drop.kind !== undefined && drop.kind !== 'resin'))
                return false;
            ids.add(drop.id);
            return true;
        });
    }

    onEnable() {
        window.addEventListener('networkstate', this.#receive);
        window.addEventListener('worldcleared', this.clear);
        Scene.Instance.TimeManager.addObjectToRefresh(this, 175);
        if (window.GameConnection?.state)
            this.#receive({ detail: window.GameConnection.state });
    }

    #receive = ({ detail }) => {
        this.#state = detail;
        const visible = new Set((detail.drops ?? []).map(drop => drop.id));
        for (const [id, actor] of this.#drops)
            if (!visible.has(id)) {
                this.#destroy(actor);
                this.#drops.delete(id);
            }
        for (const drop of detail.drops ?? []) {
            if (this.#drops.has(drop.id))
                continue;
            const root = new Actor(`loot_${drop.id}`, [new Transform()]);
            Scene.Instance.PushActor(root);
            LootDrops.#pagesMesh ??= new Mesh(Mesh.CUBE.vertices, Mesh.CUBE.normals,
                new Float32Array(Mesh.CUBE.uv.length).fill(0.8));
            if (drop.kind === 'resin') {
                for (const [index, position, scale] of [
                    [0, [-0.35, 0.02, -0.22], [0.48, 0.32, 0.42]],
                    [1, [0.02, 0.02, -0.08], [0.30, 0.22, 0.34]],
                    [2, [-0.13, 0.25, -0.13], [0.24, 0.20, 0.22]]
                ]) {
                    const material = this.bookMaterial.clone();
                    material.postprocess = () => material.isMeshDirty = false;
                    const lump = new Actor(`resin_${index}_${drop.id}`, [
                        new Transform({ position, scale, rotation: [0, index * 37, 0] }),
                        new Renderable(LootDrops.resinMesh(), material)
                    ]);
                    lump.parent = root;
                    Scene.Instance.PushActor(lump);
                }
                this.#drops.set(drop.id, root);
                continue;
            }
            for (const [part, y, height, mesh, width, depth] of [
                ['bottom', 0.12, 0.045, Mesh.CUBE, 1.1, 0.8],
                ['pages', 0.165, 0.2, LootDrops.#pagesMesh, 1, 0.72],
                ['top', 0.365, 0.045, Mesh.CUBE, 1.1, 0.8]
            ]) {
                const material = this.bookMaterial.clone();
                material.postprocess = () => material.isMeshDirty = false;
                const book = new Actor(`loot_book_${part}_${drop.id}`, [
                    new Transform({ position: [-width / 2, y, -depth / 2], scale: [width, height, depth] }),
                    new Renderable(mesh, material)
                ]);
                book.parent = root;
                Scene.Instance.PushActor(book);
            }
            const lightMesh = new Mesh([], [], []);
            lightMesh.particleData = new Float32Array([0, 1.6, 0, 2.7, 0.7, 0, 1.6, 0, 0.65, 1]);
            const light = new Actor(`loot_light_${drop.id}`, [
                new Transform(), new Renderable(lightMesh, new ParticleMaterial([1, 0.9, 0.65, 0.9]))
            ]);
            light.parent = root;
            Scene.Instance.PushActor(light);
            this.#drops.set(drop.id, root);
        }
        this.onRefresh();
    };

    onRefresh() {
        if (!this.#state)
            return;
        const terrain = Scene.Instance.GetActorByIdentifier('terrain')?.GetCompnentByType(Transform);
        for (const drop of this.#state.drops ?? []) {
            const transform = this.#drops.get(drop.id).GetCompnentByType(Transform);
            transform.position.value = terrain && this.#state.revision === window.GameConnection?.world?.revision ?
                drop.position.map((value, index) => value - this.#state.terrainOffset[index] + terrain.position.value[index]) :
                [...drop.position];
        }
    }

    #destroy(actor) {
        for (const child of actor.children) {
            for (const renderable of child.GetCompnentsByType(Renderable))
                renderable.material.clear();
            child.destroy();
        }
        actor.destroy();
    }

    clear = () => {
        for (const actor of this.#drops.values())
            this.#destroy(actor);
        this.#drops.clear();
        this.#state = null;
    };

    onDisable() {
        window.removeEventListener('networkstate', this.#receive);
        window.removeEventListener('worldcleared', this.clear);
        Scene.Instance.TimeManager.removeObjectToRefresh(this);
        this.clear();
    }
}
