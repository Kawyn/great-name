class RenderTexture {

    /** @type {Image} */ #sprite;

    get sprite() { return this.#sprite }

    _framebuffer;

    setAsRendererTarget(gl) {

        if (this._framebuffer == null)
            this.compile(gl);
        gl.bindFramebuffer(WebGL2RenderingContext.FRAMEBUFFER, this._framebuffer);
        gl.viewport(0, 0, this.width, this.height);
    }

    clearAsRenderTarget(gl) {

    }

    constructor(width, height) {

        this.width = width;
        this.height = height;
    }
    /** @param {WebGL2RenderingContext} gl  */
    compile(gl) {

        const texture = gl.createTexture();
        this.texture = texture;

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            WebGL2RenderingContext.TEXTURE_2D,
            0,
            WebGL2RenderingContext.RGBA,
            this.width,
            this.height,
            0,
            WebGL2RenderingContext.RGBA,
            WebGL2RenderingContext.UNSIGNED_BYTE,
            null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this._framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._framebuffer);

        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    }
}