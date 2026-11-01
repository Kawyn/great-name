class Renderer extends Component {

    static REGISTER_RENDERABLE = 'REGISTER_RENDERABLE';
    static UNREGISTER_RENDERABLE = 'UNREGISTER_RENDERABLE';
    static MAX_RENDER_PIXELS = 1366 * 768;

    /** @type {Transform} */ #transform;
    get transform() { return this.#transform; }
    c_fov = 90;
    c_aspectRatio = 0;

    c_zNear = 0.01;
    c_zFar = 1000;
    shadowExtent = 140;
    shadowDepth = 1400;

    #gl;
    #aspectRatio;
    #projectionMatrix;
    get projectionMatrix() { return this.#projectionMatrix; }

    #viewMatrix;
    get viewMatrix() { return this.#viewMatrix; }

    #viewProjectionMatrix;
    get viewProjectionMatrix() { return this.#viewProjectionMatrix; }

    renderables = [];
    cacheStatic = false;
    postProcesses = null;
    #shadowState = [];
    #shadowView;
    #shadowProjection;

    isVisible(renderable, planes) {
        const bounds = renderable.mesh.bounds;
        if (!bounds)
            return true;
        const matrix = renderable.transform.sceneMatrix;
        const [x, y, z] = bounds.center;
        const center = [
            matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
            matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
            matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
        ];
        const radius = bounds.radius * Math.max(
            Math.hypot(matrix[0], matrix[1], matrix[2]),
            Math.hypot(matrix[4], matrix[5], matrix[6]),
            Math.hypot(matrix[8], matrix[9], matrix[10]));
        return planes.every(plane =>
            plane[0] * center[0] + plane[1] * center[1] + plane[2] * center[2] + plane[3] >= -radius);
    }

    frustumPlanes() {
        const matrix = this.#viewProjectionMatrix;
        if (!matrix)
            return [];
        const planes = [];
        for (let axis = 0; axis < 3; axis++) {
            for (const sign of [-1, 1]) {
                const plane = [0, 1, 2, 3].map(column =>
                    matrix[column * 4 + 3] + sign * matrix[column * 4 + axis]);
                const length = Math.hypot(plane[0], plane[1], plane[2]);
                planes.push(plane.map(value => value / length));
            }
        }
        return planes;
    }

    shadowChanged() {
        let changed = this.#shadowView !== this.#viewMatrix ||
            this.#shadowProjection !== this.#projectionMatrix ||
            this.#shadowState.length !== this.renderables.length;
        const state = this.renderables.map((renderable, index) => {
            const matrix = renderable.transform.sceneMatrix;
            const previous = this.#shadowState[index];
            if (!previous || previous.renderable !== renderable || previous.mesh !== renderable.mesh ||
                previous.material !== renderable.material ||
                previous.matrix !== matrix || previous.dirty !== renderable.material.isMeshDirty)
                changed = true;
            return { renderable, mesh: renderable.mesh, material: renderable.material,
                matrix, dirty: renderable.material.isMeshDirty };
        });
        if (changed) {
            this.#shadowView = this.#viewMatrix;
            this.#shadowProjection = this.#projectionMatrix;
            this.#shadowState = state;
        }
        return changed;
    }

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
        this.cacheStatic = other?.cacheStatic ?? false;

        this.canvas = canvas;

        this.canvas.enable(WebGLRenderingContext.DEPTH_TEST);

        this.layers = layers;
    }

    onInitialize(actor) {
        super.onInitialize(actor);

        if (this.renderTexture == null)
            this.resizeCanvas();

        this.updateProjectionMatrix();

        // TODO: set uniforms/
        // tutaj add change listener position
        Scene.Instance.EventManager.addEventListener(Renderer.REGISTER_RENDERABLE, this.registerRenderable);
        Scene.Instance.EventManager.addEventListener(Renderer.UNREGISTER_RENDERABLE, this.unregisterRenderable);
    }

    resizeCanvas() {
        const canvas = this.#gl.canvas;
        const pixelRatio = window.devicePixelRatio || 1;
        const nativeWidth = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
        const nativeHeight = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
        const scale = Math.min(1, Math.sqrt(Renderer.MAX_RENDER_PIXELS / (nativeWidth * nativeHeight)));
        const width = Math.max(1, Math.floor(nativeWidth * scale));
        const height = Math.max(1, Math.floor(nativeHeight * scale));

        if (canvas.width !== width)
            canvas.width = width;
        if (canvas.height !== height)
            canvas.height = height;
    }

    updateProjectionMatrix() {
        this.#aspectRatio = this.#gl.canvas.clientWidth / Math.max(1, this.#gl.canvas.clientHeight);
        if (this.orthographic) {
            this.#projectionMatrix = m4.orthographic(
                -this.shadowExtent, this.shadowExtent,
                -this.shadowExtent, this.shadowExtent,
                1, this.shadowDepth);
        }
        else {
            this.#projectionMatrix = m4.perspective(toRadians(this.c_fov), this.#aspectRatio, this.c_zNear, this.c_zFar);
        }
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
            if (this.cacheStatic && !this.shadowChanged())
                return;

            this.renderTexture.setAsRendererTarget(this.canvas);
            this.canvas.disable(WebGLRenderingContext.CULL_FACE);
            this.canvas.enable(this.canvas.POLYGON_OFFSET_FILL);
            this.canvas.polygonOffset(2, 2);

        }
        else {
            this.resizeCanvas();
            const aspectRatio = this.#gl.canvas.clientWidth / Math.max(1, this.#gl.canvas.clientHeight);
            if (!this.orthographic && aspectRatio !== this.#aspectRatio) {
                this.updateProjectionMatrix();
                this.recalculateViewMatrix();
            }

            this.canvas.enable(WebGLRenderingContext.CULL_FACE);

            this.#gl.bindFramebuffer(WebGL2RenderingContext.FRAMEBUFFER, null);
            this.canvas.viewport(0, 0, this.canvas.canvas.width, this.canvas.canvas.height);
            this.postProcesses?.begin(this.canvas);
        }
        this.clear();

        const planes = this.frustumPlanes();
        for (let renderable of this.renderables) {
            if (!renderable.material.transparent && this.isVisible(renderable, planes))
                renderable.render(this, this.canvas);
        }
        for (let renderable of this.renderables) {
            if (renderable.material.transparent && this.isVisible(renderable, planes))
                renderable.render(this, this.canvas);
        }

        if (this.renderTexture != null) {
            this.canvas.disable(this.canvas.POLYGON_OFFSET_FILL);
            for (const entry of this.#shadowState)
                entry.dirty = entry.renderable.material.isMeshDirty;
            this.renderTexture.clearAsRenderTarget(this.canvas);
        }
        else {
            this.postProcesses?.finish(this.canvas);
        }
    }

    clear() {

        this.canvas.clearColor(0, 0, 0, 0);
        this.canvas.clear(WebGLRenderingContext.COLOR_BUFFER_BIT | WebGLRenderingContext.DEPTH_BUFFER_BIT);
    }
}
