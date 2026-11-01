
class MaterialBase {

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

    render(gl, renderer, renderable) {

        gl.drawArrays(WebGLRenderingContext.TRIANGLES, 0, renderable.mesh.vertices.length / 3);
    }

    postprocess(gl, renderer, renderable) { }


    _compileParams(gl) { }
    _setParmas(gl, renderer, renderable) { }


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
}