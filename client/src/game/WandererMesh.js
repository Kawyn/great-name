class WandererMesh {
    static build() {
        const vertices = [], normals = [], uv = [], smoothing = [], sums = new Map();
        const triangle = (a, b, c, part, group, reverse = false) => {
            const u = b.map((value, i) => value - a[i]);
            const v = c.map((value, i) => value - a[i]);
            const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
                u[0] * v[1] - u[1] * v[0]];
            for (const point of [a, b, c]) {
                vertices.push(...point);
                // UV.x selects the fabric region in both render and shadow shaders.
                uv.push(part, point[1] / 4);
                const key = `${group}:${reverse}:${point.map(value => Math.round(value * 1e6) / 1e6).join(',')}`;
                const sum = sums.get(key) ?? [0, 0, 0];
                for (let axis = 0; axis < 3; axis++)
                    sum[axis] += normal[axis];
                sums.set(key, sum);
                smoothing.push(key);
            }
        };
        const quad = (a, b, c, d, part, group, doubleSided = false) => {
            triangle(a, b, c, part, group);
            triangle(b, d, c, part, group);
            if (doubleSided) {
                triangle(c, b, a, part, group, true);
                triangle(c, d, b, part, group, true);
            }
        };
        const sides = 32, rows = 12;
        const clothPoint = (row, side) => {
            const fraction = row / rows;
            const split = 0.21 * Math.pow(Math.max(0, (fraction - 0.55) / 0.45), 1.4);
            const angle = split + side / sides * (Math.PI * 2 - split * 2);
            const radius = 0.32 + Math.pow(fraction, 1.25) * 0.82;
            const hem = 0.09 + 0.22 * Math.max(0, Math.cos(angle)) + 0.025 * Math.sin(angle * 3);
            return [Math.sin(angle) * radius, 2.67 * (1 - fraction) + hem * fraction,
                Math.cos(angle) * radius];
        };
        for (let row = 0; row < rows; row++)
            for (let side = 0; side < sides; side++)
                quad(clothPoint(row + 1, side), clothPoint(row + 1, side + 1),
                    clothPoint(row, side), clothPoint(row, side + 1), row === rows - 1 ? 1 : 0, 'robe', true);

        const hoodScale = 0.9;
        const hoodVertex = (x, y, z) => [x * hoodScale, 2.8 + (y - 2.8) * hoodScale, z * hoodScale];
        const hoodRing = (side, width, height, depth, center = 3.16) => {
            const angle = side * Math.PI * 2 / sides;
            return hoodVertex(Math.sin(angle) * width * (0.82 + 0.18 * Math.cos(angle)),
                center + Math.cos(angle) * height, depth);
        };
        const hoodPoint = (row, side) => {
            const fraction = row / 7;
            const fold = Math.pow(Math.max(0, (fraction - 0.45) / 0.55), 2);
            const point = hoodRing(side, 0.46 * Math.pow(1 - fraction, 0.85),
                0.64 * Math.pow(1 - fraction, 0.8), 0.28 - 1.88 * fraction, 3.16 + 0.38 * fraction);
            point[0] += 0.12 * fold * hoodScale;
            point[1] -= 0.24 * fold * hoodScale;
            return point;
        };
        for (let side = 0; side < sides; side++) {
            const outer = index => hoodPoint(0, index);
            const brow = index => hoodRing(index, 0.39, 0.55, 0.44, 3.18);
            const rim = index => hoodRing(index, 0.345, 0.49, 0.52, 3.18);
            const opening = index => hoodRing(index, 0.315, 0.455, 0.535, 3.18);
            const lip = index => hoodRing(index, 0.298, 0.437, 0.49, 3.18);
            const inside = index => hoodRing(index, 0.265, 0.375, -0.02);
            quad(brow(side), brow(side + 1), outer(side), outer(side + 1), 4, 'hood', true);
            quad(rim(side), rim(side + 1), brow(side), brow(side + 1), 4, 'hood', true);
            quad(opening(side), opening(side + 1), rim(side), rim(side + 1), 5, 'hood', true);
            quad(lip(side), lip(side + 1), opening(side), opening(side + 1), 5, 'hood', true);
            quad(inside(side), inside(side + 1), lip(side), lip(side + 1), 0.5, 'cavity', true);
            triangle(inside(side + 1), inside(side), hoodVertex(0, 3.16, -0.15), 0.5, 'cavity');
            triangle(hoodVertex(0, 3.16, -0.15), inside(side), inside(side + 1), 0.5, 'cavity', true);
            for (let row = 0; row < 6; row++)
                quad(hoodPoint(row, side), hoodPoint(row, side + 1),
                    hoodPoint(row + 1, side), hoodPoint(row + 1, side + 1), 4, 'hood', true);
            triangle(hoodPoint(6, side), hoodPoint(6, side + 1), hoodPoint(7, side), 4, 'hood');
            triangle(hoodPoint(7, side), hoodPoint(6, side + 1), hoodPoint(6, side), 4, 'hood', true);
        }

        for (let leg = 0; leg < 2; leg++) {
            const x = leg === 0 ? -0.25 : 0.25;
            const hip = side => [x + Math.sin(side * Math.PI / 6) * 0.11, 1.65,
                Math.cos(side * Math.PI / 6) * 0.11];
            const knee = side => [x + Math.sin(side * Math.PI / 6) * 0.075, 0.83,
                0.18 + Math.cos(side * Math.PI / 6) * 0.075];
            for (let side = 0; side < 12; side++) {
                quad(knee(side), knee(side + 1), hip(side), hip(side + 1), 2 + leg, `leg${leg}`);
                triangle(knee(side + 1), knee(side), [x, 0, 0.04], 2 + leg, `leg${leg}`);
            }
        }

        const bands = [-1, -0.78, 0.78, 1], scarfRows = 32;
        const scarfCenter = 2.56, scarfHalfWidth = 0.17;
        for (let side = 0; side < sides; side++) {
            const collar = (index, y) => [Math.sin(index * Math.PI * 2 / sides) * 0.37,
                y, Math.cos(index * Math.PI * 2 / sides) * 0.37];
            const heights = bands.map(band => scarfCenter + band * scarfHalfWidth);
            for (let band = 0; band < 3; band++)
                quad(collar(side, heights[band]), collar(side + 1, heights[band]),
                    collar(side, heights[band + 1]), collar(side + 1, heights[band + 1]),
                    band === 1 ? 6 : 9, 'collar', true);
        }
        const scarfPoint = (row, edge) => {
            const fraction = row / scarfRows;
            return [0.36, scarfCenter + bands[edge] * scarfHalfWidth * (1 - fraction * 0.35),
                -0.08 - fraction * 3.5];
        };
        for (let row = 0; row < scarfRows; row++)
            for (let band = 0; band < 3; band++)
                quad(scarfPoint(row, band), scarfPoint(row + 1, band),
                    scarfPoint(row, band + 1), scarfPoint(row + 1, band + 1),
                    band === 1 ? 7 : 8, 'scarf', true);

        for (const key of smoothing) {
            const sum = sums.get(key), length = Math.hypot(...sum);
            normals.push(...sum.map(value => value / length));
        }
        const mesh = new Mesh(vertices, normals, uv);
        mesh.bounds = { center: [0, 2, -0.7], radius: 5.5 };
        return mesh;
    }
}
