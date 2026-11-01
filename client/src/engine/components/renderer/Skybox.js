class Skybox extends Material {

    postprocess() { this.isMeshDirty = false }

    _compileParams(gl) {
        this.#compilePosition(gl)
        this.#compileProjection(gl);
        this.#compileTime(gl);
    }

    _setParmas(gl, renderer, renderable) {
        this.#setProjection(gl, renderer, renderable);
        this.#setTime(gl, renderer, renderable);
        this.#setPosition(gl, renderer, renderable);
    }

    render(gl, renderer, renderable) {
        gl.depthFunc(gl.LEQUAL);
        gl.drawArrays(WebGLRenderingContext.TRIANGLES, 0, renderable.mesh.vertices.length / 2);
        gl.depthFunc(gl.LESS);
    }

    #compileProjection(gl) {

        this._locations['u_viewDirectionProjectionInverse'] = gl.getUniformLocation(this._program, 'u_viewDirectionProjectionInverse');
        this._locations['u_viewProjectionMatrix'] = gl.getUniformLocation(this._program, 'u_viewProjectionMatrix');
    }

    #sunTransform;
    #playerTransform;

    #compileTime(gl) {

        var x = Scene.Instance.GetActorByIdentifier('sun');
        this.#sunTransform = x.GetCompnentByType(Transform);
        this.startTime = new Date().getTime();

        this._locations['u_time'] = gl.getUniformLocation(this._program, 'u_time');
        this._locations['u_sunPosition'] = gl.getUniformLocation(this._program, 'u_sunPosition');

    }

    #setTime(gl, renderer, renderable) {


        if (!this.#sunTransform) {

            var x = Scene.Instance.GetActorByIdentifier('sun');
            this.#sunTransform = x.GetCompnentByType(Transform);

        }

        gl.uniform1f(this._locations['u_time'], (this.startTime - new Date().getTime()) / 1000);


        gl.uniform3fv(
            this._locations['u_sunPosition'],
            new Float32Array(this.#sunTransform.position.value));


    }

    #setProjection(gl, renderer, renderable) {

        const projectionMatrix = renderer.projectionMatrix;
        const viewMatrix = [...renderer.viewMatrix];

        viewMatrix[12] = 0;
        viewMatrix[13] = 0;
        viewMatrix[14] = 0;

        var viewDirectionProjectionMatrix =
            m4.multiply(projectionMatrix, viewMatrix);
        var viewDirectionProjectionInverseMatrix =
            m4.inverse(viewDirectionProjectionMatrix);


        gl.uniformMatrix4fv(
            this._locations['u_viewDirectionProjectionInverse'], false, viewDirectionProjectionInverseMatrix);


        gl.uniformMatrix4fv(
            this._locations['u_viewProjectionMatrix'], false,
            renderer.viewProjectionMatrix);

    }
    #compilePosition(gl) {

        this._locations['a_position'] = gl.getAttribLocation(this._program, 'a_position');
        this._buffers['a_position'] = gl.createBuffer();
    }

    #setPosition(gl, renderer, renderable) {

        gl.bindBuffer(WebGLRenderingContext.ARRAY_BUFFER, this._buffers['a_position']);
        if (this.isMeshDirty)
            gl.bufferData(WebGLRenderingContext.ARRAY_BUFFER, renderable.mesh.vertices, WebGLRenderingContext.STATIC_DRAW);

        gl.enableVertexAttribArray(this._locations['a_position']);

        gl.vertexAttribPointer(this._locations['a_position'], 2, WebGLRenderingContext.FLOAT, false, 0, 0);
    }
}