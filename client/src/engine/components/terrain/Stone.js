class Stone extends Component {
    static kind = 'eroded';
    static batchName = 'stones';
    #renderActor;
    #materials = [];
    #marked = new Set();

    constructor({ seed, type, size, stones, material, shadowMaterial }) {
        super();
        if (!material || !shadowMaterial)
            throw new Error('Stone requires color and shadow materials.');
        this.stones = stones ?? [{ seed, type: type ?? this.constructor.kind, size, position: [0, 0, 0] }];
        for (const stone of this.stones)
            Stone.validate(stone);
        this.material = material;
        this.shadowMaterial = shadowMaterial;
    }

    static validate(stone) {
        if (!stone || !Number.isInteger(stone.seed) || stone.seed < 0 || stone.seed > 4294967295 ||
            !Array.isArray(stone.position) || stone.position.length !== 3 || !stone.position.every(Number.isFinite))
            throw new Error('Invalid stone seed or position.');
        if (stone.type !== undefined && !['eroded', 'monolith'].includes(stone.type) ||
            stone.size !== undefined && (!Number.isFinite(stone.size) || stone.size < 1 || stone.size > 40))
            throw new Error('Invalid stone type or size.');
    }

    static build(seed, size = 10, type = this.kind) {
        Stone.validate({ seed, size, type, position: [0, 0, 0] });
        const Kind = this !== Stone && type === this.kind ? this :
            type === 'monolith' ? MonolithStone : ErodedStone;
        return Kind.buildGeometry(seed, size);
    }

    static buildGeometry(seed, size) {
        const { vertices, normals, uv } = StoneGeometry.build(seed, size, this.kind);
        const mesh = new Mesh(vertices, normals, uv);
        Stone.setBounds(mesh);
        return mesh;
    }

    static setBounds(mesh) {
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (let index = 0; index < mesh.vertices.length; index++) {
            const axis = index % 3;
            min[axis] = Math.min(min[axis], mesh.vertices[index]);
            max[axis] = Math.max(max[axis], mesh.vertices[index]);
        }
        const center = min.map((value, axis) => (value + max[axis]) / 2);
        mesh.bounds = { center, radius: Math.hypot(...max.map((value, axis) => value - center[axis])) };
    }

    static buildBatch(stones) {
        const vertices = [];
        const normals = [];
        const uv = [];
        const ranges = [];
        for (const stone of stones) {
            Stone.validate(stone);
            const mesh = this.build(stone.seed, stone.size ?? 10, stone.type ?? this.kind);
            for (let index = 0; index < mesh.vertices.length; index++)
                vertices.push(mesh.vertices[index] + stone.position[index % 3]);
            normals.push(...mesh.normals);
            const start = uv.length;
            uv.push(...mesh.uv);
            if (stone.id)
                ranges.push({ id: stone.id, start, end: uv.length });
        }

        const mesh = new Mesh(vertices, normals, uv);
        mesh.stoneRanges = ranges;
        if (stones.length)
            Stone.setBounds(mesh);
        return mesh;
    }

    onEnable() {
        if (!this.stones.length)
            return;
        const mesh = this.constructor.buildBatch(this.stones);
        this.#materials = [this.material.clone(), this.shadowMaterial.clone()];
        for (const material of this.#materials)
            material.postprocess = () => material.isMeshDirty = false;
        this.#renderActor = new Actor(`${this.actor.identifier}_${this.constructor.batchName}`, [
            new Transform(),
            new Renderable(mesh, this.#materials[0]),
            new Renderable(mesh, this.#materials[1], 'shadowcasters')
        ]);
        this.#renderActor.parent = this.actor;
        Scene.Instance.PushActor(this.#renderActor);
        if (typeof window !== 'undefined') {
            window.addEventListener('networkstate', this.#updateMarkings);
            window.addEventListener('worldcleared', this.#clearMarkings);
            this.#updateMarkings({ detail: window.GameConnection?.state });
        }
    }

    #updateMarkings = ({ detail }) => {
        const occupied = new Set((detail?.stoneSites ?? []).filter(site => site.occupied).map(site => site.stoneId));
        const mesh = this.#renderActor?.GetCompnentByType(Renderable).mesh;
        if (!mesh)
            return;
        for (const range of mesh.stoneRanges) {
            const marked = occupied.has(range.id);
            if (marked === this.#marked.has(range.id))
                continue;
            for (let index = range.start + 1; index < range.end; index += 2)
                mesh.uv[index] += marked ? 2 : -2;
            if (marked)
                this.#marked.add(range.id);
            else
                this.#marked.delete(range.id);
            for (const material of this.#materials)
                material.isMeshDirty = true;
        }
    };

    #clearMarkings = () => this.#updateMarkings({ detail: null });

    onDisable() {
        if (typeof window !== 'undefined') {
            window.removeEventListener('networkstate', this.#updateMarkings);
            window.removeEventListener('worldcleared', this.#clearMarkings);
        }
        if (this.#renderActor)
            this.#renderActor.destroy();
        for (const material of this.#materials)
            material.clear();
        this.#materials = [];
        this.#renderActor = null;
        this.#marked.clear();
    }
}

class ErodedStone extends Stone {
    static kind = 'eroded';
}

class MonolithStone extends Stone {
    static kind = 'monolith';
}
