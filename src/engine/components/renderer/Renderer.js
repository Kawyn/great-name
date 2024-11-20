class Renderer extends Component {

    static REGISTER_RENDERABLE = 'REGISTER_RENDERABLE';
    static REGISTER_RENDERABLE = 'UNREGISTER_RENDERABLE';

    /** @type {Transform} */ #transform;
    get transform() { return this.#transform; }
    c_fov = 90;
    c_aspectRatio = 0;

    c_zNear = 0.01;
    c_zFar = 1000;

    #gl;
    #projectionMatrix;
    get projectionMatrix() { return this.#projectionMatrix; }

    #viewMatrix;
    get viewMatrix() { return this.#viewMatrix; }

    #viewProjectionMatrix;
    get viewProjectionMatrix() { return this.#viewProjectionMatrix; }

    renderables = [];

    set canvas(value) {

        this.#gl = value.getContext('webgl2');
    }

    renderTextrue = null;
    get canvas() {
        return this.#gl;
    }

    depthTexture;

    constructor(canvas, layers = ['main'], other) {
        super(other);

        this.canvas = canvas;

        this.canvas.enable(WebGLRenderingContext.DEPTH_TEST);

        this.layers = layers;
    }

    onInitialize(actor) {
        super.onInitialize(actor);

        // this is const, we calculate this only once 
        this.#projectionMatrix = m4.perspective(toRadians(this.c_fov), this.#gl.canvas.clientWidth / this.#gl.canvas.clientHeight, this.c_zNear, this.c_zFar);
        if (this.orthographic) {
            this.#projectionMatrix = m4.orthographic(
                - 400,  // left
                400,   // right
                - 400,  // bottom
                400,  // top
                1,                      // near
                5000);                      // far
        }

        // TODO: set uniforms/
        // tutaj add change listener position
        Scene.Instance.EventManager.addEventListener(Renderer.REGISTER_RENDERABLE, this.registerRenderable);
        Scene.Instance.EventManager.addEventListener(Renderer.UNREGISTER_RENDERABLE, this.unregisterRenderable);
    }

    onPostInitialize() {

        this.#transform = this.actor.GetCompnentByType(Transform);

        this.#transform.scenePosition.addChangeListener(() => this.recalculateViewMatrix(), false);
        this.#transform.sceneRotation.addChangeListener(() => this.recalculateViewMatrix());
    }

    onEnable() {

        Scene.Instance.TimeManager.addObjectToRefresh(this, 150);
    }

    registerRenderable = (eventName, data) => {
        if (this.layers.indexOf(data.layer) !== -1) this.renderables.push(data);
    }
    unregisterRenderable = (eventName, data) => {
        if (this.layers.indexOf(data.layer) !== -1) {

            const idx = this.renderables.indexOf(data);
            if (idx == -1)
                return;
            this.renderables.splice(idx, 1);
        }
    }

    recalculateViewMatrix() {

        const position = this.#transform.scenePosition.value;

        let matrix;

        if (!this.target) matrix = m4.lookAt(position, position.map((v, i) => v + this.#transform.front[i]), this.#transform.up);
        else {
            matrix = m4.lookAt(position, this.target.position.value, this.#transform.up)
        }

        this.#viewMatrix = m4.inverse(matrix);

        this.#viewProjectionMatrix = m4.multiply(this.#projectionMatrix, this.#viewMatrix);
    }

    onRefresh() {
        this.draw();
    }
    draw() {
        if (this.renderTexture != null) {

            this.renderTexture.setAsRendererTarget(this.canvas);
            this.canvas.disable(WebGLRenderingContext.CULL_FACE);

        }
        else {
            this.canvas.enable(WebGLRenderingContext.CULL_FACE);

            this.#gl.bindFramebuffer(WebGL2RenderingContext.FRAMEBUFFER, null);
            this.canvas.viewport(0, 0, this.canvas.canvas.width, this.canvas.canvas.height);
        }
        this.clear();

        for (let renderable of this.renderables)
            renderable.render(this, this.canvas);

        if (this.renderTexture != null)
            this.renderTexture.clearAsRenderTarget(this.canvas);
    }

    clear() {

        this.canvas.clearColor(0, 0, 0, 0);
        this.canvas.clear(WebGLRenderingContext.COLOR_BUFFER_BIT | WebGLRenderingContext.DEPTH_BUFFER_BIT);
    }
}

