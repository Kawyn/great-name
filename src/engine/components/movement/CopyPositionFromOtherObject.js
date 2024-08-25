class CopyPositionFromOtherObject extends Component {

    targetIdentifier = 'player';

    /** @type {Transform} */ #transform;
    /** @type {Transform} */ #targetTransform;

    onTargetPositionChanged = (value) => {

        this.#transform.position.value = value.map((v, i) => v + this.offset[i]);
    };

    constructor(kit) {

        if (!kit.offset) kit.offset = [0, 0, 0];

        super(kit);

    }

    onPostInitialize() {

        this.#transform = this.actor.GetCompnentByType(Transform);

        const target = Scene.Instance.GetActorByIdentifier(this.targetIdentifier);
        this.#targetTransform = target.GetCompnentByType(Transform);
    }

    onEnable() {

        this.#targetTransform.position.addChangeListener(this.onTargetPositionChanged);
    }

    onDisable() {
        this.#targetTransform.position.removeChangeListener(this.onTargetPositionChanged);
    }
}