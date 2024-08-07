class Renderable extends Component {

    /** @type {Mesh} */ mesh;
	/** @type {Material} */ material;

    /** @type {Transform} */ #transform;
	get transform() { return this.#transform; }

	constructor(mesh, material) {
		super();

		this.mesh = mesh;
		this.material = material;
	}

	onPostInitialize() {

		this.#transform = this.actor.GetCompnentByType(Transform);

		Scene.Instance.EventManager.riseEvent(Renderer.REGISTER_RENDERABLE, this);
	}

	/**
	 * @param {Renderer} renderer 
	 * @param {WebGLRenderingContext} gl 
	 */
	render(renderer, gl) {

		this.material.preprocess(gl, renderer, this)

		gl.drawArrays(WebGLRenderingContext.TRIANGLES, 0, this.mesh.vertices.length / 3);
	}
}