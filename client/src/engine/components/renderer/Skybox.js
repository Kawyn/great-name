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
        this._locations['u_sunPosition'] = gl.getUniformLocation(this._program, 'u_sunPosition');
        this._locations.u_daylight = gl.getUniformLocation(this._program, 'u_daylight');
        this._locations.u_starPixelSize = gl.getUniformLocation(this._program, 'u_starPixelSize');
        this._locations.u_skyTime = gl.getUniformLocation(this._program, 'u_skyTime');
        this._locations.u_originStar = gl.getUniformLocation(this._program, 'u_originStar');

    }

    #setTime(gl, renderer, renderable) {


        if (!this.#sunTransform) {

            var x = Scene.Instance.GetActorByIdentifier('sun');
            this.#sunTransform = x.GetCompnentByType(Transform);

        }

        gl.uniform3fv(
            this._locations['u_sunPosition'],
            new Float32Array(this.#sunTransform.sunDirection ?? this.#sunTransform.position.value));
        gl.uniform1f(this._locations.u_daylight, this.#sunTransform.daylight ?? 1);
        gl.uniform1f(this._locations.u_starPixelSize,
            2 / (Math.max(1, gl.canvas.height) * renderer.projectionMatrix[5]));
        gl.uniform1f(this._locations.u_skyTime, (performance.now() / 1000) % 86400);
        gl.uniform3fv(this._locations.u_originStar, window.GameConnection?.state?.originStar ?? [0, 0, 0]);


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