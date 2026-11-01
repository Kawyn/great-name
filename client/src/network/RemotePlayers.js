class RemotePlayers extends Component {
    #players = new Map();
    #anchorPositions = new Map();
    #revision;

    constructor(material, mesh = Mesh.CUBE, shadowMaterial = null) {
        super();
        this.material = material;
        this.mesh = mesh;
        this.shadowMaterial = shadowMaterial;
    }

    onEnable() {
        Scene.Instance.TimeManager.addObjectToRefresh(this, 175);
        window.addEventListener('networkstate', this.onState);
        window.addEventListener('worldcleared', this.clear);
        if (window.GameConnection?.state)
            this.onState({ detail: window.GameConnection.state });
    }

    onState = (event) => {
        if (this.#revision !== event.detail.revision) {
            this.#anchorPositions.clear();
            this.#revision = event.detail.revision;
        }
        const visible = new Set();
        for (const other of event.detail.players) {
            visible.add(other.id);
            let actor = this.#players.get(other.id);
            if (!actor) {
                const material = this.material.clone();
                material.postprocess = () => material.isMeshDirty = false;
                const components = [
                    new Transform({ position: other.position, scale: this.mesh === Mesh.CUBE ? [2, 4, 2] : [1, 1, 1] }),
                    new Renderable(this.mesh, material)
                ];
                if (this.shadowMaterial) {
                    const shadow = this.shadowMaterial.clone();
                    shadow.postprocess = () => shadow.isMeshDirty = false;
                    components.push(new Renderable(this.mesh, shadow, 'shadowcasters'));
                }
                actor = new Actor(`player_${other.id}`, components);
                Scene.Instance.PushActor(actor);
                this.#players.set(other.id, actor);
            }
            const transform = actor.GetCompnentByType(Transform);
            const anchored = other.position.map((value, index) => value - event.detail.terrainOffset[index]);
            const terrain = Scene.Instance.GetActorByIdentifier('terrain')?.GetCompnentByType(Transform);
            const position = terrain && this.#revision === window.GameConnection?.world?.revision ?
                anchored.map((value, index) => value + terrain.position.value[index]) : [...other.position];
            if (position.some((value, index) => value !== transform.position.value[index]))
                transform.position.value = position;
            const previous = this.#anchorPositions.get(other.id);
            if (previous) {
                const dx = anchored[0] - previous[0];
                const dz = anchored[2] - previous[2];
                if (Math.hypot(dx, dz) > 0.001)
                    transform.rotation.value = [0, Math.atan2(dx, dz) * 180 / Math.PI, 0];
            }
            this.#anchorPositions.set(other.id, anchored);
        }
        for (const [id, actor] of this.#players) {
            if (!visible.has(id)) {
                this.clearMaterials(actor);
                actor.destroy();
                this.#players.delete(id);
                this.#anchorPositions.delete(id);
            }
        }
    };

    onRefresh() {
        const terrain = Scene.Instance.GetActorByIdentifier('terrain')?.GetCompnentByType(Transform);
        if (!terrain || this.#revision !== window.GameConnection?.world?.revision)
            return;
        for (const [id, actor] of this.#players) {
            const anchored = this.#anchorPositions.get(id);
            const transform = actor.GetCompnentByType(Transform);
            const position = anchored.map((value, index) => value + terrain.position.value[index]);
            if (position.some((value, index) => value !== transform.position.value[index]))
                transform.position.value = position;
        }
    }

    clear = () => {
        for (const actor of this.#players.values()) {
            this.clearMaterials(actor);
            actor.destroy();
        }
        this.#players.clear();
        this.#anchorPositions.clear();
    };

    clearMaterials(actor) {
        for (const renderable of actor.GetCompnentsByType(Renderable))
            renderable.material.clear();
    }

    onDisable() {
        Scene.Instance.TimeManager.removeObjectToRefresh(this);
        window.removeEventListener('networkstate', this.onState);
        window.removeEventListener('worldcleared', this.clear);
        this.clear();
    }
}
