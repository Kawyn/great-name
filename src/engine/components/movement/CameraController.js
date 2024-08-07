class CameraController extends Component {

    speed = 0.1;

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

        const horizontal = Scene.Instance.InputManager.GetAxis('mouse_x');
        const vertical = Scene.Instance.InputManager.GetAxis('mouse_y');

        const deltaX = -vertical.value * deltaTime * this.speed;
        const deltaY = -horizontal.value * deltaTime * this.speed;

        const rotation = [...this.#transform.rotation.value];
        rotation[0] += deltaX;
        rotation[1] += deltaY;

        this.#transform.rotation.value = rotation;
    }

    onDisable() {

        Scene.Instance.TimeManager.removeObjectToRefresh(this);
    }
}