class Renderable extends Component {

	layer = 'main';
	/** @type {Transform} */ #transform;
	get transform() { return this.#transform; }

    /** @type {Mesh} */ mesh;
	/** @type {Material} */ material;

	constructor(mesh, material, layer = 'main') {
		super();

		this.mesh = mesh;
		this.material = material;
		this.layer = layer;
	}

	onPostInitialize() {

		this.#transform = this.actor.GetCompnentByType(Transform);
	}

	onEnable() {

		Scene.Instance.EventManager.riseEvent(Renderer.REGISTER_RENDERABLE, this);

	}

	/**
	 * @param {Renderer} renderer 
	 * @param {WebGLRenderingContext} gl 
	 */
	render(renderer, gl) {

		this.material.preprocess(gl, renderer, this);
		this.material.render(gl, renderer, this);
		this.material.postprocess(gl, renderer, this);
	}

	onDisable() {

		Scene.Instance.EventManager.riseEvent(Renderer.UNREGISTER_RENDERABLE, this);
	}
}