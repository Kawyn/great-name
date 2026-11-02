class DeadTree extends Stone {
    static batchName = 'trees';
    constructor({ trees, material, shadowMaterial }) {
        super({ stones: trees, material, shadowMaterial });
    }

    static build(seed, size = 6) {
        Stone.validate({ seed, size, position: [0, 0, 0] });
        let state = seed || 0x9e3779b9;
        const random = () => {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            return (state >>> 0) / 4294967296;
        };
        const vertices = [];
        const normals = [];
        const uv = [];
        const shade = random();
        const segment = (a, b, bottomRadius, topRadius) => {
            const direction = b.map((value, axis) => value - a[axis]);
            const length = Math.hypot(...direction);
            const forward = direction.map(value => value / length);
            const horizontal = Math.hypot(forward[0], forward[2]);
            const right = horizontal > 1e-6 ? [forward[2] / horizontal, 0, -forward[0] / horizontal] : [1, 0, 0];
            const up = [forward[1] * right[2], forward[2] * right[0] - forward[0] * right[2],
                -forward[1] * right[0]];
            const ring = (center, radius, index) => {
                const angle = index * Math.PI / 3;
                return center.map((value, axis) =>
                    value + (right[axis] * Math.cos(angle) + up[axis] * Math.sin(angle)) * radius);
            };
            const sideNormal = index => {
                const angle = index * Math.PI / 3;
                const normal = right.map((value, axis) => value * Math.cos(angle) +
                    up[axis] * Math.sin(angle) + forward[axis] * (bottomRadius - topRadius) / length);
                const magnitude = Math.hypot(...normal);
                return normal.map(value => value / magnitude);
            };
            const triangle = (a, b, c, smoothNormals = null) => {
                const ab = b.map((value, axis) => value - a[axis]);
                const ac = c.map((value, axis) => value - a[axis]);
                const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2],
                    ab[0] * ac[1] - ab[1] * ac[0]];
                const length = Math.hypot(...n);
                for (const [index, point] of [a, b, c].entries()) {
                    vertices.push(...point);
                    normals.push(...(smoothNormals?.[index] ?? n.map(value => value / length)));
                    uv.push(shade, point[1] / size);
                }
            };
            for (let side = 0; side < 6; side++) {
                const p = ring(a, bottomRadius, side), q = ring(a, bottomRadius, side + 1);
                const r = ring(b, topRadius, side), s = ring(b, topRadius, side + 1);
                const normal = sideNormal(side), nextNormal = sideNormal((side + 1) % 6);
                triangle(p, q, r, [normal, nextNormal, normal]);
                triangle(q, s, r, [nextNormal, nextNormal, normal]);
                triangle(b, r, s);
            }
        };
        const yaw = random() * Math.PI * 2;
        const lean = [Math.cos(yaw) * size * 0.14, 0, Math.sin(yaw) * size * 0.14];
        const trunk = [
            [0, 0, 0],
            [lean[0] * 0.3, size * 0.42, lean[2] * 0.3],
            [lean[0] * 0.65, size * 0.73, lean[2] * 0.65],
            [lean[0] + size * (random() - 0.5) * 0.12, size, lean[2]]
        ];
        for (let index = 0; index < 3; index++)
            segment(trunk[index], trunk[index + 1], size * (0.055 - index * 0.015),
                size * (0.04 - index * 0.017));
        const branches = 5 + Math.floor(random() * 4);
        for (let index = 0; index < branches; index++) {
            const height = 0.34 + random() * 0.5;
            const start = [lean[0] * height, size * height, lean[2] * height];
            const angle = yaw + index * 2.4 + random() * 0.7;
            const reach = size * (0.18 + random() * 0.22) * (1.25 - height);
            const elbow = [start[0] + Math.cos(angle) * reach, start[1] + size * (0.05 + random() * 0.13),
                start[2] + Math.sin(angle) * reach];
            const tip = [elbow[0] + Math.cos(angle + 0.3) * reach * 0.4,
                elbow[1] + size * (0.1 + random() * 0.16), elbow[2] + Math.sin(angle + 0.3) * reach * 0.4];
            segment(start, elbow, size * 0.025, size * 0.014);
            segment(elbow, tip, size * 0.014, size * 0.003);
            if (index % 2 === 0) {
                const fork = [elbow[0] + Math.cos(angle + 1.1) * reach * 0.55,
                    elbow[1] + size * 0.1, elbow[2] + Math.sin(angle + 1.1) * reach * 0.55];
                segment(elbow, fork, size * 0.011, size * 0.002);
            }
        }
        for (let index = 0; index < 4; index++) {
            const angle = yaw + index * Math.PI / 2;
            segment([Math.cos(angle) * size * 0.13, 0.03, Math.sin(angle) * size * 0.13],
                trunk[1].map(value => value * 0.23), size * 0.012, size * 0.038);
        }
        const mesh = new Mesh(vertices, normals, uv);
        Stone.setBounds(mesh);
        return mesh;
    }
}
