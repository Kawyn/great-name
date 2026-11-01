class WandererMesh {
    static build() {
        const vertices = [];
        const normals = [];
        const uv = [];
        const triangle = (a, b, c, color) => {
            const u = b.map((value, i) => value - a[i]);
            const v = c.map((value, i) => value - a[i]);
            const n = [u[1] * v[2] - u[2] * v[1],
                u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            const length = Math.hypot(...n);
            for (const point of [a, b, c]) {
                vertices.push(...point);
                normals.push(...n.map(value => value / length));
                uv.push(color, point[1] / 4);
            }
        };
        const robe = (bottomY, topY, bottomRadius, topRadius, color) => {
            for (let i = 0; i < 12; i++) {
                const angle = i * Math.PI / 6;
                const next = (i + 1) * Math.PI / 6;
                const ring = (theta, radius, y) => [Math.sin(theta) * radius, y, Math.cos(theta) * radius];
                const a = ring(angle, bottomRadius, bottomY);
                const b = ring(next, bottomRadius, bottomY);
                const c = ring(angle, topRadius, topY);
                const d = ring(next, topRadius, topY);
                triangle(a, b, c, color);
                triangle(b, d, c, color);
            }
        };
        robe(0.15, 0.35, 1, 0.96, 1);
        robe(0.35, 2.7, 0.96, 0.3, 0);
        robe(2.7, 3.4, 0.46, 0.32, 0);
        for (let i = 0; i < 12; i++) {
            const a = i * Math.PI / 6;
            const b = (i + 1) * Math.PI / 6;
            triangle([Math.sin(a) * 0.32, 3.4, Math.cos(a) * 0.32],
                [Math.sin(b) * 0.32, 3.4, Math.cos(b) * 0.32], [0, 3.8, 0], 0);
        }
        const box = (position, scale, color) => {
            for (let i = 0; i < Mesh.CUBE.vertices.length; i += 3) {
                vertices.push(...[0, 1, 2].map(axis =>
                    position[axis] + (Mesh.CUBE.vertices[i + axis] + 0.5) * scale[axis]));
                normals.push(...Mesh.CUBE.normals.slice(i, i + 3));
                uv.push(color, 0.5);
            }
        };
        box([-0.18, 2.95, 0.34], [0.36, 0.34, 0.05], 0.5);
        box([-0.16, 2.55, -2.8], [0.32, 0.12, 2.6], 1);
        const mesh = new Mesh(vertices, normals, uv);
        mesh.bounds = { center: [0, 1.9, -0.9], radius: 3 };
        return mesh;
    }
}
