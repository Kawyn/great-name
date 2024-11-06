class Texture {

    /** @type {Image} */ #sprite;

    get sprite() { return this.#sprite }
    #src;

    ready = false;

    constructor(src) {

        this.#src = src;
    }

    /** @param {WebGL2RenderingContext} canvas  */
    compile(canvas) {

        if (this.ready)
            return;

        this.ready = true;

        const texture = canvas.createTexture();
        this.texture = texture;

        canvas.bindTexture(canvas.TEXTURE_2D, texture);
        canvas.texImage2D(canvas.TEXTURE_2D, 0, canvas.RGBA, 1, 1, 0, WebGL2RenderingContext.RGBA, WebGL2RenderingContext.UNSIGNED_BYTE, new Uint8Array([255, 0, 255, 255]));

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