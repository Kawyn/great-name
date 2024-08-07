class CharacterController extends Component {

    speed = 150;

    /** @type {Transform} */ #transform;

    constructor(velocity) {
        super();

    }

    onPostInitialize() {

        this.#transform = this.actor.GetCompnentByType(Transform);
    }

    onEnable() {

        Scene.Instance.TimeManager.addObjectToRefresh(this);
    }

    onRefresh(deltaTime) {

        const horizontal = Scene.Instance.InputManager.GetAxis('horizontal');
        const vertical = Scene.Instance.InputManager.GetAxis('vertical');

        const position = [...this.#transform.position.value];

        const deltaFront = this.#transform.front.map(v => v * deltaTime * this.speed * vertical.value);
        const deltaRight = this.#transform.right.map(v => v * deltaTime * this.speed * horizontal.value);

        this.#transform.position.value = position.map((v, i) => v + deltaFront[i] + deltaRight[i]);
    }

    onDisable() {

        Scene.Instance.TimeManager.removeObjectToRefresh(this);
    }
}