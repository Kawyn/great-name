self.onmessage = async function (event) {
    const { x, z, partSize, heightMap, } = event.data;
    const steps = [1, 2, 4, 16];
    const meshes = [];

    for (const step of steps) {
        const vertices = [];
        const normals = [];
        const uv = [];

        for (let xx = 0; xx < heightMap.length - 1; xx += step) {
            for (let zz = 0; zz < heightMap.length - 1; zz += step) {
                const P1 = [xx + step, heightMap[xx + step][zz], zz];
                const P2 = [xx, heightMap[xx][zz], zz];
                const P3 = [xx, heightMap[xx][zz + step], zz + step];
                const P4 = [xx + step, heightMap[xx + step][zz + step], zz + step];

                vertices.push(...P1, ...P2, ...P3, ...P3, ...P4, ...P1);

                uv.push(1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0);

                let normal = getNormalForTriangle(P1, P2, P3);
                normals.push(...normal);
                normals.push(...normal);
                normals.push(...normal);

                normal = getNormalForTriangle(P3, P4, P1);
                normals.push(...normal);
                normals.push(...normal);
                normals.push(...normal);
            }
        }

        meshes.push({ vertices, normals, uv, step });
    }
    self.postMessage({ meshes });
};

function getNormalForTriangle(p1, p2, p3) {
    const A = p2.map((v, i) => p2[i] - p1[i]);
    const B = p3.map((v, i) => p3[i] - p1[i]);

    return [
        A[1] * B[2] - A[2] * B[1],
        A[2] * B[0] - A[0] * B[2],
        A[0] * B[1] - A[1] * B[0],
    ];
}