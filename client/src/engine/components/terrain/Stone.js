class Stone extends Component {
    static kind = 'eroded';
    #renderActor;
    #materials = [];

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

    static profile() {
        throw new Error('Stone subclasses must define a shape profile.');
    }

    static buildGeometry(seed, size) {
        let state = seed || 0x9e3779b9;
        const random = () => {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            return (state >>> 0) / 4294967296;
        };
        const profile = this.profile(random, size);
        const yaw = random() * Math.PI * 2;
        const tilt = size >= 25 ? (12 + random() * 13) * Math.PI / 180 : 0;
        const shade = random();
        const sites = Array.from({ length: 24 }, () => [random() * 4 - 2, random() * 4 - 2, random() * 4 - 2]);
        const voronoi = point => {
            let first = Infinity;
            let second = Infinity;
            for (const site of sites) {
                const distance = Math.hypot(point[0] - site[0], point[1] - site[1], point[2] - site[2]);
                if (distance < first) {
                    second = first;
                    first = distance;
                }
                else if (distance < second)
                    second = distance;
            }
            // F2-F1 is continuous across cell boundaries and carves broad cellular grooves.
            const edge = Math.min(1, (second - first) * 2);
            return edge * edge * (3 - 2 * edge);
        };
        const sectors = size >= 25 ? 48 : 24;
        const levels = size >= 25 ? 32 : 16;
        const points = [];
        const point = (latitude, longitude) => {
            const direction = [Math.sin(latitude) * Math.cos(longitude), Math.cos(latitude),
                Math.sin(latitude) * Math.sin(longitude)];
            const ridge = voronoi(direction.map(value => value * profile.frequency));
            const detail = size >= 25 ? voronoi(direction.map(value => value * 4.8)) - 0.5 : 0;
            const radius = 1 - profile.carving + profile.carving * ridge + detail * 0.075;
            const y = direction[1] * radius;
            const x = direction[0] * radius * profile.width + profile.lean * y * y;
            const z = direction[2] * radius * profile.depth;
            const tiltedX = x * Math.cos(tilt) + (y + 1) * Math.sin(tilt);
            const tiltedY = (y + 1) * Math.cos(tilt) - x * Math.sin(tilt);
            return [Math.cos(yaw) * tiltedX - Math.sin(yaw) * z, tiltedY,
                Math.sin(yaw) * tiltedX + Math.cos(yaw) * z];
        };
        points.push(point(0, 0));
        for (let level = 1; level < levels; level++)
            for (let sector = 0; sector < sectors; sector++)
                points.push(point(level * Math.PI / levels, sector * Math.PI * 2 / sectors));
        points.push(point(Math.PI, 0));
        const bottom = points.length - 1;
        const minY = Math.min(...points.map(p => p[1]));
        const maxY = Math.max(...points.map(p => p[1]));
        const scale = size / (maxY - minY);
        for (const p of points) {
            p[0] *= scale;
            p[1] = (p[1] - minY) * scale;
            p[2] *= scale;
        }
        const triangles = [];
        const ring = (level, sector) => 1 + (level - 1) * sectors + sector % sectors;
        for (let sector = 0; sector < sectors; sector++) {
            triangles.push([0, ring(1, sector + 1), ring(1, sector)]);
            for (let level = 1; level < levels - 1; level++) {
                const a = ring(level, sector), b = ring(level, sector + 1);
                const c = ring(level + 1, sector), d = ring(level + 1, sector + 1);
                triangles.push([a, b, c], [b, d, c]);
            }
            triangles.push([ring(levels - 1, sector), ring(levels - 1, sector + 1), bottom]);
        }
        const smoothNormals = points.map(() => [0, 0, 0]);
        for (const indices of triangles) {
            const [a, b, c] = indices.map(index => points[index]);
            const u = b.map((v, axis) => v - a[axis]);
            const v = c.map((value, axis) => value - a[axis]);
            const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
                u[0] * v[1] - u[1] * v[0]];
            for (const index of indices)
                for (let axis = 0; axis < 3; axis++)
                    smoothNormals[index][axis] += normal[axis];
        }
        for (const normal of smoothNormals) {
            const length = Math.hypot(...normal);
            for (let axis = 0; axis < 3; axis++)
                normal[axis] /= length;
        }
        const vertices = [];
        const normals = [];
        const uv = [];
        for (const triangle of triangles) {
            for (const index of triangle) {
                vertices.push(...points[index]);
                normals.push(...smoothNormals[index]);
                uv.push(shade, points[index][1] / size);
            }
        }
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
        for (const stone of stones) {
            Stone.validate(stone);
            const mesh = this.build(stone.seed, stone.size ?? 10, stone.type ?? this.kind);
            for (let index = 0; index < mesh.vertices.length; index++)
                vertices.push(mesh.vertices[index] + stone.position[index % 3]);
            normals.push(...mesh.normals);
            uv.push(...mesh.uv);
        }

        const mesh = new Mesh(vertices, normals, uv);
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
        this.#renderActor = new Actor(`${this.actor.identifier}_stones`, [
            new Transform(),
            new Renderable(mesh, this.#materials[0]),
            new Renderable(mesh, this.#materials[1], 'shadowcasters')
        ]);
        this.#renderActor.parent = this.actor;
        Scene.Instance.PushActor(this.#renderActor);
    }

    onDisable() {
        if (this.#renderActor)
            this.#renderActor.destroy();
        for (const material of this.#materials)
            material.clear();
        this.#materials = [];
        this.#renderActor = null;
    }
}

class ErodedStone extends Stone {
    static kind = 'eroded';

    static profile(random, size) {
        return { width: size >= 25 ? 0.58 + random() * 0.12 : 1.2 + random() * 0.35,
            depth: size >= 25 ? 0.4 + random() * 0.12 : 0.9 + random() * 0.35,
            lean: 0.12, frequency: 1.4, carving: 0.28 };
    }
}

class MonolithStone extends Stone {
    static kind = 'monolith';

    static profile(random) {
        return { width: 0.32 + random() * 0.12, depth: 0.25 + random() * 0.12,
            lean: 0.12 + random() * 0.16, frequency: 1.8, carving: 0.22 };
    }
}
