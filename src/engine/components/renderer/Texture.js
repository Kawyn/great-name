class Texture {

    /** @type {Image} */ #sprite;
    initialized = false;
    #src;
    constructor(src) {
        this.#src = src;

    }
    xxx = false;
    /** @param {WebGL2RenderingContext} canvas  */
    compile(canvas) {

        var texture = canvas.createTexture();

        canvas.bindTexture(canvas.TEXTURE_2D, texture);
        canvas.texImage2D(canvas.TEXTURE_2D, 0, canvas.RGBA, 1, 1, 0, WebGL2RenderingContext.RGBA, WebGL2RenderingContext.UNSIGNED_BYTE,
            new Uint8Array([255, 0, 255, 255]));

        this.#sprite = new Image();
        this.#sprite.crossOrigin = "anonymous";
        this.#sprite.src = this.#src;

        this.#sprite.addEventListener('load', () => {
            canvas.bindTexture(canvas.TEXTURE_2D, texture);
            canvas.texImage2D(canvas.TEXTURE_2D, 0, canvas.RGBA, canvas.RGBA, canvas.UNSIGNED_BYTE, this.#sprite);
            canvas.generateMipmap(canvas.TEXTURE_2D);
        });
    }
}