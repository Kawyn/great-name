


class Material {

    vertexShaderCode;
    fragmentShaderCode;

    vertexShader;
    fragmentShader;

    _locations = {};
    _buffers = {}

    /** @type {WebGLProgram} */ _program;

    constructor(vertexShader, fragmentShader) {

        this.vertexShaderCode = vertexShader;
        this.fragmentShaderCode = fragmentShader;
    }

    preprocess(gl, renderer, renderable) {

        if (!this._program) {

            this.#compileShaders(gl);
            this._compileParams(gl);
        }

        gl.useProgram(this._program);
        this._setParmas(gl, renderer, renderable);
    }

    _compileParams(gl) {

        this.#compileProjection(gl);

        this.#compilePosition(gl);

        this.#compileNormals(gl);
        this.#compileUVs(gl);
    }

    _setParmas(gl, renderer, renderable) {

        this.#setProjection(gl, renderer, renderable);

        this.#setPosition(gl, renderer, renderable);

        this.#setNormals(gl, renderer, renderable);
        this.#setUVs(gl, renderer, renderable);
    }


    /**
     * @param {WebGLRenderingContext} gl 
     */
    #compileShaders(gl) {

        this._program = gl.createProgram();

        this.vertexShader = this.#createShader(gl, WebGLRenderingContext.VERTEX_SHADER, this.vertexShaderCode);
        this.fragmentShader = this.#createShader(gl, WebGLRenderingContext.FRAGMENT_SHADER, this.fragmentShaderCode);

        gl.attachShader(this._program, this.vertexShader);
        gl.attachShader(this._program, this.fragmentShader);

        gl.linkProgram(this._program);

        if (!gl.getProgramParameter(this._program, WebGLRenderingContext.LINK_STATUS))
            throw gl.getProgramInfoLog(this._program);
    }

    /**
     * @param {WebGLRenderingContext} gl 
     * @param {WebGLRenderingContext.VERTEX_SHADER|WebGLRenderingContext.FRAGMENT_SHADER} type 
     * @param {string} code 
     */
    #createShader(gl, type, code) {

        const shader = gl.createShader(type);

        gl.shaderSource(shader, code);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, WebGLRenderingContext.COMPILE_STATUS))
            throw gl.getShaderInfoLog(shader);

        return shader;
    }

    #compileProjection(gl) {

        this._locations['u_worldViewProjection'] = gl.getUniformLocation(this._program, 'u_worldViewProjection');
        this._locations['u_worldInverseTranspose'] = gl.getUniformLocation(this._program, 'u_worldInverseTranspose');
    }

    #setProjection(gl, renderer, renderable) {

        const viewProjectionMatrix = renderer.viewProjectionMatrix;
        const sceneMatrix = renderable.transform.sceneMatrix;

        const objectViewProjectionMatrix = m4.multiply(viewProjectionMatrix, sceneMatrix);

        gl.uniformMatrix4fv(
            this._locations['u_worldViewProjection'], false,
            objectViewProjectionMatrix);

        const worldInverseMatrix = m4.inverse(sceneMatrix);
        const worldInverseTransposeMatrix = m4.transpose(worldInverseMatrix);

        gl.uniformMatrix4fv(this._locations['u_worldInverseTranspose'], false, worldInverseTransposeMatrix);
    }

    #compilePosition(gl) {

        this._locations['a_position'] = gl.getAttribLocation(this._program, 'a_position');
        this._buffers['a_position'] = gl.createBuffer();
    }

    #setPosition(gl, renderer, renderable) {

        gl.bindBuffer(WebGLRenderingContext.ARRAY_BUFFER, this._buffers['a_position']);
        gl.bufferData(WebGLRenderingContext.ARRAY_BUFFER, renderable.mesh.vertices, WebGLRenderingContext.STATIC_DRAW);

        gl.enableVertexAttribArray(this._locations['a_position']);

        gl.vertexAttribPointer(this._locations['a_position'], 3, WebGLRenderingContext.FLOAT, false, 0, 0);
    }

    #compileNormals(gl) {

        this._locations['a_normal'] = gl.getAttribLocation(this._program, 'a_normal');
        this._buffers['a_normal'] = gl.createBuffer();
    }

    #setNormals(gl, renderer, renderable) {

        gl.bindBuffer(WebGLRenderingContext.ARRAY_BUFFER, this._buffers['a_normal']);
        gl.bufferData(WebGLRenderingContext.ARRAY_BUFFER, renderable.mesh.normals, WebGLRenderingContext.STATIC_DRAW);

        gl.enableVertexAttribArray(this._locations['a_normal']);

        gl.vertexAttribPointer(this._locations['a_normal'], 3, WebGLRenderingContext.FLOAT, false, 0, 0);
    }

    #compileUVs(gl) {

        this._locations['a_texcoord'] = gl.getAttribLocation(this._program, 'a_texcoord');
        this._buffers['a_texcoord'] = gl.createBuffer();
    }

    #setUVs(gl, renderer, renderable) {

        gl.bindBuffer(WebGLRenderingContext.ARRAY_BUFFER, this._buffers['a_texcoord']);
        gl.bufferData(WebGLRenderingContext.ARRAY_BUFFER, renderable.mesh.uv, WebGLRenderingContext.STATIC_DRAW);

        gl.enableVertexAttribArray(this._locations['a_texcoord']);

        gl.vertexAttribPointer(this._locations['a_texcoord'], 2, WebGLRenderingContext.FLOAT, false, 0, 0);
    }
}

class MaterialWithTexture extends Material {

    texture;

    constructor(vertexShader, fragmentShader) {
        super(vertexShader, fragmentShader);

        this.texture = new Texture('./textures/bocchi.png')
    }

    _compileParams(gl) {
        super._compileParams(gl);

        this.#compileTexture(gl);
    }

    _setParmas(gl, renderer, renderable) {
        super._setParmas(gl, renderer, renderable);

        this.#setTexture(gl, renderer, renderable);
    }

    #compileTexture(gl, renderer, renderable) {

        this._locations['u_texture'] = gl.getUniformLocation(this._program, 'u_texture');
        this.texture.compile(gl);
    }

    #setTexture(gl, renderer, renderable) {

        gl.uniform1i(this._locations['u_texture'], 0);
    }
}