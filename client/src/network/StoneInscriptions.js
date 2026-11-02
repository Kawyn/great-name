class StoneInscriptions extends Component {
    #actors = new Map();
    #scarves = new Map();
    #state = null;
    hiddenScarf = null;

    constructor(material, scarfMaterial = material) {
        super();
        this.material = material;
        this.scarfMaterial = scarfMaterial;
    }

    static validate(sites) {
        const ids = new Set();
        return Array.isArray(sites) && sites.length <= 25 && sites.every(site => {
            if (!site || typeof site.stoneId !== 'string' || !/^stone-[a-f0-9]{32}$/.test(site.stoneId) ||
                ids.has(site.stoneId) || typeof site.occupied !== 'boolean' ||
                ![site.position, site.normal].every(vector => Array.isArray(vector) &&
                    vector.length === 3 && vector.every(Number.isFinite)) ||
                Math.abs(Math.hypot(...site.normal) - 1) > 0.001)
                return false;
            if (site.scarf !== undefined && (!site.occupied || !Array.isArray(site.scarf) ||
                site.scarf.length !== 3 || !site.scarf.every(Number.isFinite)))
                return false;
            ids.add(site.stoneId);
            return true;
        });
    }

    get preparedTablet() {
        return this.actor.GetCompnentByType(Inventory)?.orderedItems.find(item =>
            item instanceof EmeraldTablets && item.prepared && item.serverId) ?? null;
    }

    get nearest() {
        const prepared = this.preparedTablet;
        return (window.GameConnection?.state?.stoneSites ?? [])
            .filter(site => (site.occupied || prepared) && Math.hypot(...site.position) <= 6)
            .sort((a, b) => Math.hypot(...a.position) - Math.hypot(...b.position))[0] ?? null;
    }

    onEnable() {
        window.addEventListener('networkstate', this.#receive);
        window.addEventListener('worldcleared', this.clear);
        Scene.Instance.TimeManager.addObjectToRefresh(this, 176);
        if (window.GameConnection?.state)
            this.#receive({ detail: window.GameConnection.state });
    }

    static mesh(normal) {
        const length = Math.hypot(normal[0], normal[2]);
        const right = length > 1e-8 ? [normal[2] / length, 0, -normal[0] / length] : [1, 0, 0];
        const up = [normal[1] * right[2], normal[2] * right[0] - normal[0] * right[2],
            -normal[1] * right[0]];
        const vertices = [];
        const normals = [];
        for (let index = 0; index < Mesh.CUBE.vertices.length; index += 3) {
            const point = [Mesh.CUBE.vertices[index] - 0.5, Mesh.CUBE.vertices[index + 1] - 0.5,
                Mesh.CUBE.vertices[index + 2] - 0.5];
            const n = Mesh.CUBE.normals.slice(index, index + 3);
            for (let axis = 0; axis < 3; axis++) {
                vertices.push(right[axis] * point[0] * 1.15 + up[axis] * point[1] * 1.5 +
                    normal[axis] * point[2] * 0.14);
                normals.push(right[axis] * n[0] + up[axis] * n[1] + normal[axis] * n[2]);
            }
        }
        return new Mesh(vertices, normals, Mesh.CUBE.uv);
    }

    #receive = ({ detail }) => {
        this.#state = detail;
        const sites = detail.stoneSites ?? [];
        const visible = new Set(sites.filter(site => site.occupied).map(site => site.stoneId));
        for (const [id, actor] of this.#actors)
            if (!visible.has(id)) {
                this.#destroy(actor);
                this.#actors.delete(id);
            }
        for (const site of sites) {
            if (!site.occupied || this.#actors.has(site.stoneId))
                continue;
            const material = this.material.clone();
            material.postprocess = () => material.isMeshDirty = false;
            const actor = new Actor(`inscription_${site.stoneId}`, [
                new Transform(), new Renderable(StoneInscriptions.mesh(site.normal), material)
            ]);
            Scene.Instance.PushActor(actor);
            this.#actors.set(site.stoneId, actor);
        }
        this.onRefresh();
    };

    onRefresh() {
        if (!this.#state)
            return;
        const terrain = Scene.Instance.GetActorByIdentifier('terrain')?.GetCompnentByType(Transform);
        const visibleScarves = new Set((this.#state.stoneSites ?? [])
            .filter(site => site.scarf && site.stoneId !== this.hiddenScarf).map(site => site.stoneId));
        for (const [id, scarf] of this.#scarves)
            if (!visibleScarves.has(id)) {
                this.#destroy(scarf);
                this.#scarves.delete(id);
            }
        for (const site of this.#state.stoneSites ?? []) {
            const actor = this.#actors.get(site.stoneId);
            if (!actor)
                continue;
            actor.GetCompnentByType(Transform).position.value =
                terrain && this.#state.revision === window.GameConnection?.world?.revision
                    ? site.position.map((value, axis) => value - this.#state.terrainOffset[axis] + terrain.position.value[axis])
                    : [...site.position];
            if (visibleScarves.has(site.stoneId)) {
                let scarf = this.#scarves.get(site.stoneId);
                if (!scarf) {
                    const material = this.scarfMaterial.clone();
                    material.postprocess = () => material.isMeshDirty = false;
                    scarf = new Actor(`scarf_${site.stoneId}`, [new Transform(),
                        new Renderable(Scarf.build(), material)]);
                    Scene.Instance.PushActor(scarf);
                    this.#scarves.set(site.stoneId, scarf);
                }
                scarf.GetCompnentByType(Transform).position.value = site.scarf.map((value, axis) =>
                    value - site.position[axis] + actor.GetCompnentByType(Transform).position.value[axis]);
            }
        }
    }

    #destroy(actor) {
        actor.GetCompnentByType(Renderable).material.clear();
        actor.destroy();
    }

    clear = () => {
        for (const actor of this.#actors.values())
            this.#destroy(actor);
        this.#actors.clear();
        for (const scarf of this.#scarves.values())
            this.#destroy(scarf);
        this.#scarves.clear();
        this.hiddenScarf = null;
        this.#state = null;
    };

    onDisable() {
        window.removeEventListener('networkstate', this.#receive);
        window.removeEventListener('worldcleared', this.clear);
        Scene.Instance.TimeManager.removeObjectToRefresh(this);
        this.clear();
    }
}
