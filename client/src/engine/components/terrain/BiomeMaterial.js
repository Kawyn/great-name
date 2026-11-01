class BiomeMaterial extends MaterialWithShadow {
    _compileParams(gl) {
        super._compileParams(gl);
        this._locations['a_biome'] = gl.getAttribLocation(this._program, 'a_biome');
        this._buffers['a_biome'] = gl.createBuffer();
        this._locations.u_surfaceOrigin = gl.getUniformLocation(this._program, 'u_surfaceOrigin');
    }

    _setParmas(gl, renderer, renderable) {
        super._setParmas(gl, renderer, renderable);
        gl.uniform3fv(this._locations.u_surfaceOrigin, renderable.mesh.surfaceOrigin ?? [0, 0, 0]);
        if (this._locations.a_biome < 0)
            return;
        gl.bindBuffer(WebGLRenderingContext.ARRAY_BUFFER, this._buffers['a_biome']);
        if (this.isMeshDirty)
            gl.bufferData(WebGLRenderingContext.ARRAY_BUFFER, renderable.mesh.biomes, WebGLRenderingContext.STATIC_DRAW);
        gl.enableVertexAttribArray(this._locations['a_biome']);
        gl.vertexAttribPointer(this._locations['a_biome'], 4, WebGLRenderingContext.FLOAT, false, 0, 0);
    }

    clone() {
        const material = new BiomeMaterial(this.vertexShaderCode, this.fragmentShaderCode, this.textures);
        material.local = true;
        return material;
    }
}
