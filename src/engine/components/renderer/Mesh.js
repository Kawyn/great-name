class Mesh {

    #vertices;
    #normals;
    #uv;

    get vertices() { return this.#vertices; }
    get normals() { return this.#normals; }
    get uv() { return this.#uv; }

    /**
     * @param {number[]} mesh 
     * @param {[number, number, number]} pivot 
     */
    constructor(mesh, normals, uv, pivot) {

        if (pivot != null) {
            const x = mesh.filter((v, i) => i % 3 === 0);
            const y = mesh.filter((v, i) => i % 3 === 1);
            const z = mesh.filter((v, i) => i % 3 === 2);

            const rangeX = [Math.min(...x), Math.max(...x)];
            const centerX = (rangeX[1] - rangeX[0]) * pivot[0];

            const rangeY = [Math.min(...y), Math.max(...y)];
            const centerY = (rangeY[1] - rangeY[0]) * pivot[1];

            const rangeZ = [Math.min(...z), Math.max(...z)];
            const centerZ = (rangeZ[1] - rangeZ[0]) * pivot[2];

            const vertices = [];

            for (let i in x)
                vertices.push(x[i] - centerX, y[i] - centerY, z[i] - centerZ);

            if (vertices instanceof Float32Array)
                this.#vertices = vertices;
            else
                this.#vertices = new Float32Array(vertices);
        }
        else {
            if (mesh instanceof Float32Array)
                this.#vertices = mesh;
            else
                this.#vertices = new Float32Array(mesh);
        }
        if (normals instanceof Float32Array)
            this.#normals = normals;
        else
            this.#normals = new Float32Array(normals);

        if (uv instanceof Float32Array)
            this.#uv = uv;
        else
            this.#uv = new Float32Array(uv);
    }

    static CUBE = new Mesh([
        0, 0, 0,
        0, 1, 0,
        1, 0, 0,
        1, 1, 0,
        1, 0, 0,
        0, 1, 0,

        0, 0, 1,
        1, 0, 1,
        0, 1, 1,
        1, 1, 1,
        0, 1, 1,
        1, 0, 1,

        1, 0, 0,
        0, 0, 1,
        0, 0, 0,
        0, 0, 1,
        1, 0, 0,
        1, 0, 1,

        1, 1, 0,
        0, 1, 0,
        0, 1, 1,
        0, 1, 1,
        1, 1, 1,
        1, 1, 0,

        0, 0, 0,
        0, 0, 1,
        0, 1, 0,
        0, 1, 1,
        0, 1, 0,
        0, 0, 1,

        1, 0, 0,
        1, 1, 0,
        1, 0, 1,
        1, 1, 1,
        1, 0, 1,
        1, 1, 0
    ], [
        0, 0, -1,
        0, 0, -1,
        0, 0, -1,
        0, 0, -1,
        0, 0, -1,
        0, 0, -1,

        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,



        0, -1, 0,
        0, -1, 0,
        0, -1, 0,
        0, -1, 0,
        0, -1, 0,
        0, -1, 0,

        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,

        -1, 0, 0,
        -1, 0, 0,
        -1, 0, 0,
        -1, 0, 0,
        -1, 0, 0,
        -1, 0, 0,

        1, 0, 0,
        1, 0, 0,
        1, 0, 0,
        1, 0, 0,
        1, 0, 0,
        1, 0, 0,

    ], [
        1, 1,
        1, 0,
        0, 1,
        0, 0,
        0, 1,
        1, 0,

        0, 1,
        1, 1,
        0, 0,
        1, 0,
        0, 0,
        1, 1,

        0, 0,
        1, 1,
        1, 0,
        1, 1,
        0, 0,
        0, 1,

        0, 1,
        1, 1,
        1, 0,
        1, 0,
        0, 0,
        0, 1,

        0, 1,
        1, 1,
        0, 0,
        1, 0,
        0, 0,
        1, 1,

        1, 1,
        1, 0,
        0, 1,
        0, 0,
        0, 1,
        1, 0,
    ], [0.5, 0.5, 0.5])

    static QUAD = new Mesh([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1,

    ],
        [

        ], [], null);
}