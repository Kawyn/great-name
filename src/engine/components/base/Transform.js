class Transform extends Component {

    /** @type {DynamicValue} */ position = new DynamicValue([0, 0, 0])
    rotation = new DynamicValue([0, 0, 0])

    scale = new DynamicValue([0, 0, 0])



    /** @type {[number, number, number]} */ #front
    get front() { return this.#front; }

    get up() { return [0, 1, 0] } // TODO

    /** @type {[number, number, number]} */ #right;
    get right() { return this.#right; }

    #matrix;

    /** @type {DynamicValue} */ scenePosition = new DynamicValue([0, 0, 0])
    /** @type {DynamicValue} */ sceneRotation = new DynamicValue([0, 0, 0])

    // optimize => calculate only on parent sceneMatixChange
    get sceneMatrix() {

        if (!this.actor.parent)
            return this.#matrix;

        /** @type {Transform} */ const parentTransform = this.actor.parent.GetCompnentByType(Transform);

        if (!parentTransform)
            return this.#matrix;

        return m4.multiply(parentTransform.sceneMatrix, this.#matrix);
    }

    /** @type {Transform} */ #parentTransform;
    onParentChanged = (eventName, data) => {

        if (this.#parentTransform) {

            this.#parentTransform.scenePosition.removeChangeListener(this.onParentScenePositionChanged);
            this.#parentTransform.sceneRotation.removeChangeListener(this.onParentSceneRotationChanged);

            this.#parentTransform = null;
        }

        if (!data) {

            this.updateScenePosition();
            return;
        }

        this.#parentTransform = data.GetCompnentByType(Transform);

        if (this.#parentTransform) {

            this.#parentTransform.scenePosition.addChangeListener(this.onParentScenePositionChanged);
            this.#parentTransform.scenePosition.addChangeListener(this.onParentSceneRotationChanged);
        }
    }

    onParentScenePositionChanged = (value) => {

        this.updateScenePosition();
    }
    onParentSceneRotationChanged = (value) => {

        if (!this.#parentTransform)
            this.sceneRotation.value = [...this.rotation.value];
        else
            this.sceneRotation.value = this.#parentTransform.sceneRotation.value.map((v, i) => v + this.rotation.value[i]);

        this.updateDirectionVectors();
    }

    constructor({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }) {
        super();

        this.position.value = position;
        this.rotation.value = rotation;

        this.scale.value = scale;

        this.rotation.addChangeListener(() => this.onParentSceneRotationChanged());
        this.rotation.addChangeListener(() => this.updateDirectionVectors());
        this.position.addChangeListener(() => this.updateScenePosition());

        this.position.addChangeListener(() => this.updateMatrix(), false);
        this.rotation.addChangeListener(() => this.updateMatrix(), false);

        this.scale.addChangeListener(() => this.updateMatrix());

    }

    onInitialize(actor) {

        super.onInitialize(actor);

        this.actor.EventManager.addEventListener(ActorEvents.ON_PARENT_SET, this.onParentChanged);
        this.onParentChanged('', this.actor.parent);
    }

    updateDirectionVectors() {

        const x = toRadians(this.sceneRotation.value[0]);
        const y = toRadians(this.sceneRotation.value[1]);
        this.#front = [
            +Math.cos(x) * Math.sin(y),
            -Math.sin(x),
            +Math.cos(x) * Math.cos(y)
        ];

        this.#right = [
            +Math.cos(y),
            0,
            -Math.sin(y)
        ]
    }

    updateMatrix() {

        this.#matrix = m4.translation(...this.position.value);

        this.#matrix = m4.xRotate(this.#matrix, toRadians(this.rotation.value[0]));
        this.#matrix = m4.yRotate(this.#matrix, toRadians(this.rotation.value[1]));
        this.#matrix = m4.zRotate(this.#matrix, toRadians(this.rotation.value[2]));

        this.#matrix = m4.scale(this.#matrix, ...this.scale.value);
    }


    updateScenePosition() {

        if (!this.#parentTransform)
            this.scenePosition.value = this.position.value;
        else
            this.scenePosition.value = this.#parentTransform.scenePosition.value.map((v, i) => v + this.position.value[i]);
    }
}