class Scarf {
    static build() {
        const vertices = [], normals = [], uv = [];
        const bands = [-1, -0.78, 0.78, 1];
        const point = (row, edge) => {
            const t = row / 24;
            return [t * 3.2, Math.sin(t * Math.PI * 3) * 0.07, edge * 0.22];
        };
        for (let row = 0; row < 24; row++)
            for (let band = 0; band < 3; band++)
                for (const points of [
                    [point(row, bands[band]), point(row, bands[band + 1]), point(row + 1, bands[band])],
                    [point(row, bands[band + 1]), point(row + 1, bands[band + 1]), point(row + 1, bands[band])]
                ]) {
                for (const order of [points, [...points].reverse()])
                    for (const p of order) {
                        vertices.push(...p);
                        normals.push(0, order === points ? 1 : -1, 0);
                        uv.push(band === 1 ? 2 : 1, p[0] / 3.2);
                    }
            }
        const mesh = new Mesh(vertices, normals, uv);
        mesh.bounds = { center: [1.6, 0, 0], radius: 2 };
        return mesh;
    }
}

class FlyingScarf extends Component {
    constructor(context, duration = 5.4) {
        super();
        this.context = context;
        this.duration = duration;
        this.elapsed = 0;
    }
    onPostInitialize() {
        this.renderables = this.actor.GetCompnentsByType(Renderable);
        this.mesh = this.renderables[0].mesh;
        this.rest = new Float32Array(this.mesh.vertices);
    }
    onEnable() { Scene.Instance.TimeManager.addObjectToRefresh(this, 164); }
    onRefresh(deltaTime) {
        this.elapsed = Math.min(this.duration, this.elapsed + deltaTime);
        const progress = this.elapsed / this.duration;
        const t = Math.min(1, progress / 0.74), ease = 1 - (1 - t) ** 3;
        const settling = Math.max(0, (progress - 0.74) / 0.26);
        const context = this.context;
        const end = context.scarfPosition();
        const start = context.reference().map((value, axis) => value +
            (axis === 1 ? 4 : context.direction[axis] * 26));
        const transform = this.actor.GetCompnentByType(Transform);
        transform.position.value = start.map((value, axis) => value + (end[axis] - value) * ease +
            (axis === 1 ? Math.sin(t * Math.PI) * 4 : 0));
        const envelope = (1 - settling) ** 2;
        transform.rotation.value = [
            Math.sin(this.elapsed * 5) * 14 * (1 - t) +
                Math.sin(settling * Math.PI * 4) * 5 * envelope,
            360 * ease,
            Math.sin(this.elapsed * 4) * 18 * (1 - t)
        ];
        for (let index = 0; index < this.rest.length; index += 3) {
            const along = this.rest[index] / 3.2;
            const wave = this.elapsed * 9 - along * 7;
            const amplitude = ((1 - t) * 0.32 + t * 0.16) * envelope * (0.25 + along * 0.75);
            this.mesh.vertices[index] = this.rest[index];
            this.mesh.vertices[index + 1] = this.rest[index + 1] +
                (Math.sin(wave) + 1) * amplitude;
            this.mesh.vertices[index + 2] = this.rest[index + 2] +
                Math.sin(wave * 0.7) * amplitude * 0.5;
        }
        for (let index = 0; index < this.mesh.vertices.length; index += 9) {
            const v = this.mesh.vertices;
            const ux = v[index + 3] - v[index], uy = v[index + 4] - v[index + 1], uz = v[index + 5] - v[index + 2];
            const vx = v[index + 6] - v[index], vy = v[index + 7] - v[index + 1], vz = v[index + 8] - v[index + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const length = Math.hypot(nx, ny, nz);
            for (let corner = 0; corner < 9; corner += 3) {
                this.mesh.normals[index + corner] = nx / length;
                this.mesh.normals[index + corner + 1] = ny / length;
                this.mesh.normals[index + corner + 2] = nz / length;
            }
        }
        for (const renderable of this.renderables)
            renderable.material.isMeshDirty = true;
        if (progress >= 1) {
            context.flightFinished = true;
            this.onDisable();
        }
    }
    onDisable() { Scene.Instance.TimeManager.removeObjectToRefresh(this); }
}
