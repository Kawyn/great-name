class PostProcessMaterial extends Material {
    _compileParams(gl) {
        this._locations.a_position = gl.getAttribLocation(this._program, 'a_position');
        this._locations.u_scene = gl.getUniformLocation(this._program, 'u_scene');
        this._locations.u_resolution = gl.getUniformLocation(this._program, 'u_resolution');
        this._buffers.a_position = gl.createBuffer();
    }

    _setParmas(gl, renderer, renderable) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.a_position);
        if (this.isMeshDirty)
            gl.bufferData(gl.ARRAY_BUFFER, renderable.mesh.vertices, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this._locations.a_position);
        gl.vertexAttribPointer(this._locations.a_position, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.input.texture);
        gl.uniform1i(this._locations.u_scene, 0);
        gl.uniform2f(this._locations.u_resolution, this.input.width, this.input.height);
    }

    postprocess() { this.isMeshDirty = false; }

    render(gl) { gl.drawArrays(gl.TRIANGLES, 0, 6); }
}

class CameraPostProcesses extends Component {
    #renderer;
    #targets = [];

    constructor({ effects, maxPixels = 640 * 360 }) {
        super();
        if (!Array.isArray(effects) || effects.length === 0 ||
            !effects.every(effect => effect instanceof PostProcessMaterial) ||
            !Number.isInteger(maxPixels) || maxPixels < 1)
            throw new Error('Camera postprocessing requires effects and a positive pixel budget.');
        this.effects = effects;
        this.maxPixels = maxPixels;
    }

    static dimensions(width, height, maxPixels) {
        const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
        return [Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale))];
    }

    onPostInitialize() {
        this.#renderer = this.actor.GetCompnentByType(Renderer);
        if (!this.#renderer || this.#renderer.renderTexture)
            throw new Error('Camera postprocessing requires an onscreen Renderer.');
    }

    onEnable() { this.#renderer.postProcesses = this; }

    #releaseTargets(gl) {
        for (const target of this.#targets) {
            gl.deleteTexture(target.texture);
            gl.deleteRenderbuffer(target.depth);
            gl.deleteFramebuffer(target.framebuffer);
        }
        this.#targets = [];
    }

    #createTarget(gl, width, height) {
        const target = { width, height, texture: gl.createTexture(),
            depth: gl.createRenderbuffer(), framebuffer: gl.createFramebuffer() };
        this.#targets.push(target);
        gl.bindTexture(gl.TEXTURE_2D, target.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
        gl.bindRenderbuffer(gl.RENDERBUFFER, target.depth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, target.depth);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            this.#releaseTargets(gl);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            throw new Error('Camera postprocess framebuffer is incomplete.');
        }
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    begin(gl) {
        const [width, height] = CameraPostProcesses.dimensions(gl.canvas.width, gl.canvas.height, this.maxPixels);
        const targetCount = this.effects.length > 1 ? 2 : 1;
        if (this.#targets.length !== targetCount ||
            this.#targets[0]?.width !== width || this.#targets[0]?.height !== height) {
            this.#releaseTargets(gl);
            this.#createTarget(gl, width, height);
            if (this.effects.length > 1)
                this.#createTarget(gl, width, height);
        }
        // Detach the previous frame's source before binding it as a render target.
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.#targets[0].framebuffer);
        gl.viewport(0, 0, width, height);
    }

    finish(gl) {
        const depth = gl.isEnabled(gl.DEPTH_TEST);
        const cull = gl.isEnabled(gl.CULL_FACE);
        const blend = gl.isEnabled(gl.BLEND);
        const depthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        gl.depthMask(false);
        try {
            for (let i = 0; i < this.effects.length; i++) {
                const input = this.#targets[i % 2];
                const output = i === this.effects.length - 1 ? null : this.#targets[(i + 1) % 2];
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, null);
                gl.bindFramebuffer(gl.FRAMEBUFFER, output?.framebuffer ?? null);
                gl.viewport(0, 0, output?.width ?? gl.canvas.width, output?.height ?? gl.canvas.height);
                const effect = this.effects[i];
                effect.input = input;
                const quad = { mesh: Mesh.QUAD };
                effect.preprocess(gl, this.#renderer, quad);
                effect.render(gl, this.#renderer, quad);
                effect.postprocess(gl, this.#renderer, quad);
            }
        }
        finally {
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
            gl.depthMask(depthMask);
            for (const [cap, enabled] of [[gl.DEPTH_TEST, depth], [gl.CULL_FACE, cull], [gl.BLEND, blend]])
                enabled ? gl.enable(cap) : gl.disable(cap);
        }
    }

    onDisable() {
        this.#renderer.postProcesses = null;
        this.#releaseTargets(this.#renderer.canvas);
        for (const effect of this.effects) {
            effect.clear();
            effect.input = null;
            effect.isMeshDirty = true;
        }
    }
}
