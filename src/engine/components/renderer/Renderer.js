class Renderer extends Component {

    static REGISTER_RENDERABLE = 'REGISTER_RENDERABLE';

    /** @type {Transform} */ #transform;

    c_fov = 110;
    c_aspectRatio = 0;

    c_zNear = 1;
    c_zFar = 2000;

    #gl;

    #projectionMatrix;
    get projectionMatrix() { return this.#projectionMatrix; }

    #viewMatrix;
    get viewMatrix() { return this.#viewMatrix; }

    #viewProjectionMatrix;
    get viewProjectionMatrix() { return this.#viewProjectionMatrix; }

    renderables = [];

    set canvas(value) {

        this.#gl = value.getContext('webgl');
    }

    get canvas() {
        return this.#gl;
    }

    constructor(canvas) {
        super();



        this.canvas = canvas;

        this.canvas.enable(WebGLRenderingContext.CULL_FACE);
        this.canvas.enable(WebGLRenderingContext.DEPTH_TEST);

        this.draw();
    }

    onInitialize(actor) {
        super.onInitialize(actor);

        // this is const, we calculate this only once 
        this.#projectionMatrix = m4.perspective(toRadians(this.c_fov), this.#gl.canvas.clientWidth / this.#gl.canvas.clientHeight, this.c_zNear, this.c_zFar);

        Scene.Instance.EventManager.addEventListener(Renderer.REGISTER_RENDERABLE, this.registerRenderable);
    }

    onPostInitialize() {

        this.#transform = this.actor.GetCompnentByType(Transform);

        this.#transform.position.addChangeListener(() => this.recalculateViewMatrix(), false);
        this.#transform.rotation.addChangeListener(() => this.recalculateViewMatrix());
    }

    registerRenderable = (eventName, data) => { this.renderables.push(data); }

    recalculateViewMatrix() {

        const position = this.#transform.scenePosition;

        const matrix = m4.lookAt(position, position.map((v, i) => v + this.#transform.front[i]), this.#transform.up);
        this.#viewMatrix = m4.inverse(matrix);

        this.#viewProjectionMatrix = m4.multiply(this.#projectionMatrix, this.#viewMatrix);
    }

    draw() {
        this.canvas.viewport(0, 0, this.canvas.canvas.width, this.canvas.canvas.height);

        this.clear();

        for (let renderable of this.renderables)
            renderable.render(this, this.canvas);
    }

    clear() {

        this.canvas.clearColor(0, 0, 0, 0);
        this.canvas.clear(WebGLRenderingContext.COLOR_BUFFER_BIT | WebGLRenderingContext.DEPTH_BUFFER_BIT);
    }
}

