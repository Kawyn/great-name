class Transform extends Component {

    position = new DynamicValue([0, 0, 0])
    rotation = new DynamicValue([0, 0, 0])

    scale = new DynamicValue([0, 0, 0])



    /** @type {[number, number, number]} */ #front
    get front() { return this.#front; }

    get up() { return [0, 1, 0] } // TODO

    /** @type {[number, number, number]} */ #right;
    get right() { return this.#right; }

    #matrix;

    /** @return {[number, number, number]} */
    get scenePosition() {

        if (!this.actor.parent)
            return this.position.value;

        /** @type {Transform} */ const parentTransform = this.actor.parent.GetCompnentByType(Transform);

        if (!parentTransform)
            return this.position.value;

        return parentTransform.scenePosition().map((v, i) => v + this.position.value[i]);
    }

    // optimize => calculate only on parent sceneMatixChange
    get sceneMatrix() {

        if (!this.actor.parent)
            return this.#matrix;

        /** @type {Transform} */ const parentTransform = this.actor.parent.GetCompnentByType(Transform);

        if (!parentTransform)
            return this.#matrix;

        console.log("?")
        return m4.multiply(parentTransform.sceneMatrix, this.#matrix);
    }

    constructor({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }) {
        super();

        this.position.value = position;
        this.rotation.value = rotation;

        this.scale.value = scale;

        this.rotation.addChangeListener(() => this.updateDirectionVectors());

        this.position.addChangeListener(() => this.updateMatrix(), false);
        this.rotation.addChangeListener(() => this.updateMatrix(), false);

        this.scale.addChangeListener(() => this.updateMatrix());

    }

    updateDirectionVectors() {

        this.#front = [
            +Math.cos(this.rotation.value[0]) * Math.sin(this.rotation.value[1]),
            -Math.sin(this.rotation.value[0]),
            +Math.cos(this.rotation.value[0]) * Math.cos(this.rotation.value[1])
        ];

        this.#right = [
            +Math.cos(this.rotation.value[1]),
            0,
            -Math.sin(this.rotation.value[1])
        ]
    }

    updateMatrix() {

        this.#matrix = m4.translation(...this.position.value);

        this.#matrix = m4.xRotate(this.#matrix, toRadians(this.rotation.value[0]));
        this.#matrix = m4.yRotate(this.#matrix, toRadians(this.rotation.value[1]));
        this.#matrix = m4.zRotate(this.#matrix, toRadians(this.rotation.value[2]));

        this.#matrix = m4.scale(this.#matrix, ...this.scale.value);
    }
}