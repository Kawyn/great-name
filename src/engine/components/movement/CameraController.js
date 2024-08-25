class CameraController extends Component {

    cameraIdentifier = 'camera';

    pitchMinValue = -89;
    pitchMaxValue = 89;

    /** @type {Transform} */ #transform;
    /** @type {Transform} */ #cameraTransform;

    constructor(cameraIdentifier = 'main') {
        super();
        this.cameraIdentifier = cameraIdentifier;
    }
    onPostInitialize() {

        this.horizontal = Scene.Instance.InputManager.GetAxis('mouse_x');
        this.vertical = Scene.Instance.InputManager.GetAxis('mouse_y');

        this.#transform = this.actor.GetCompnentByType(Transform);

        const cameraObject = Scene.Instance.GetActorByIdentifier(this.cameraIdentifier);
        this.#cameraTransform = cameraObject.GetCompnentByType(Transform);

    }

    onEnable() {

        Scene.Instance.TimeManager.addObjectToRefresh(this);
    }

    onRefresh(deltaTime) {

        const deltaX = - this.vertical.value * deltaTime * 10;
        const deltaY = - this.horizontal.value * deltaTime * 10;

        if (deltaY != 0) {

            let newX = this.#cameraTransform.rotation.value[0] + deltaX;
            if (newX < this.pitchMinValue)
                newX = this.pitchMinValue;
            else if (newX > this.pitchMaxValue)
                newX = this.pitchMaxValue;

            if (this.#cameraTransform.rotation.value[0] !== newX) {

                this.#cameraTransform.rotation.value[0] = newX;
                this.#cameraTransform.rotation.callChangedNow();
            }
        }
        if (deltaX != 0) {

            this.#transform.rotation.value[1] += deltaY;
            this.#transform.rotation.callChangedNow();


        }

    }

    onDisable() {

        Scene.Instance.TimeManager.removeObjectToRefresh(this);
    }
}