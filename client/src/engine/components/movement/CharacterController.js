class CharacterController extends Component {

    speed = 30;
    #objectWithVelocity;

    /** @type {Transform} */ #transform;

    constructor(velocity) {
        super();

    }

    onPostInitialize() {

        this.#transform = this.actor.GetCompnentByType(Transform);
        this.#objectWithVelocity = this.actor.GetCompnentByType(ObjectWithVelocity);
    }

    onEnable() {
        document.addEventListener('keydown', data => {

            if (data.key !== ' ')
                return;

            // if (
            //   this.#objectWithVelocity.velocity.value[1] > 0.5
            //
            //    ) return;
            this.#objectWithVelocity.velocity.value[1] = 25;
            this.#objectWithVelocity.velocity.callChangedNow();


        });
        Scene.Instance.TimeManager.addObjectToRefresh(this);
    }

    onRefresh(deltaTime) {

        const horizontal = Scene.Instance.InputManager.GetAxis('horizontal');
        const vertical = Scene.Instance.InputManager.GetAxis('vertical');

        const position = [...this.#transform.position.value];

        const deltaFront = this.#transform.front.map(v => v * deltaTime * this.speed * vertical.value);
        const deltaRight = this.#transform.right.map(v => v * deltaTime * this.speed * -horizontal.value);
        if (deltaFront.some(x => x != 0) || deltaRight.some(x => x != 0))
            this.#transform.position.value = position.map((v, i) => v + deltaFront[i] + deltaRight[i]);
    }

    onDisable() {

        Scene.Instance.TimeManager.removeObjectToRefresh(this);
    }
}