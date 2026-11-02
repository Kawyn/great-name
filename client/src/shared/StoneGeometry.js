class StoneGeometry {
    static build(seed, size, type) {
        let state = seed || 0x9e3779b9;
        const random = () => {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            return (state >>> 0) / 4294967296;
        };
        const profile = type === 'monolith'
            ? { width: 0.32 + random() * 0.12, depth: 0.25 + random() * 0.12,
                lean: 0.12 + random() * 0.16, frequency: 1.8, carving: 0.22 }
            : { width: size >= 25 ? 0.58 + random() * 0.12 : 1.2 + random() * 0.35,
                depth: size >= 25 ? 0.4 + random() * 0.12 : 0.9 + random() * 0.35,
                lean: 0.12, frequency: 1.4, carving: 0.28 };
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
        return { vertices, normals, uv };
    }

    static mountingPoint(stone, heightAt) {
        const mesh = this.build(stone.seed, stone.size, stone.type);
        const [x, base, z] = stone.position;
        let hit = null;
        let score = Infinity;
        for (let index = 0; index < mesh.vertices.length; index += 9) {
            const [a, b, c] = [0, 3, 6].map(offset => mesh.vertices.slice(index + offset, index + offset + 3));
            const center = a.map((value, axis) => (value + b[axis] + c[axis]) / 3);
            const ab = b.map((value, axis) => value - a[axis]);
            const ac = c.map((value, axis) => value - a[axis]);
            const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2],
                ab[0] * ac[1] - ab[1] * ac[0]];
            const length = Math.hypot(...normal);
            if (length < 1e-8)
                continue;
            for (let axis = 0; axis < 3; axis++)
                normal[axis] /= length;
            const position = [x + center[0], base + center[1], z + center[2]];
            const clearance = position[1] - heightAt(position[0] + normal[0] * 0.6,
                position[2] + normal[2] * 0.6);
            if (Math.abs(normal[1]) > 0.4 || clearance < 2 || clearance > 3.4)
                continue;
            const candidateScore = Math.abs(clearance - 2.6) + Math.abs(normal[1]) * 2 +
                (1 - normal[2]) * 0.15;
            if (candidateScore < score) {
                score = candidateScore;
                hit = { position: position.map((value, axis) => value + normal[axis] * 0.26), normal };
            }
        }
        return hit;
    }
}

if (typeof module !== 'undefined')
    module.exports = StoneGeometry;
