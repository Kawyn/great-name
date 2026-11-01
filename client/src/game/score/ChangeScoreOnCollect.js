class ChangeScoreOnCollect extends Component {

    targetIdentifier = 'player';
    changeScoreBy = 1;

    /** @type {Transform} */ #targetTransform;
    /** @type {Transform} */ #transform;

    /** @type {ScoreState} */  #targetScore;

    constructor(kit = {}) {

        if (!kit.targetIdentifier)
            kit.targetIdentifier = 'player';

        if (!kit.changeScoreBy)
            kit.changeScoreBy = 1;

        super(kit);
    }

    onPostInitialize() {

        const target = Scene.Instance.GetActorByIdentifier(this.targetIdentifier);
        this.#targetScore = target.GetCompnentByType(ScoreState);

        this.#targetTransform = target.GetCompnentByType(Transform);
        this.#transform = this.actor.GetCompnentByType(Transform);
    }

    onEnable() {

        this.#targetTransform.position.addChangeListener(this.onPositionChanged);
        this.#transform.position.addChangeListener(this.onPositionChanged);
    }

    onPositionChanged = (value) => {

        const distance = Math.pow(this.#transform.position.value[0] - this.#targetTransform.position.value[0], 2) + Math.pow(this.#transform.position.value[2] - this.#targetTransform.position.value[2], 2);

        if (distance < 25) // 5 * 5 - jestem zbyt leniwy by to parametryzować
        {
            this.#targetScore.score.value += this.changeScoreBy;
            this.actor.destroy();
        }
    }

    onDisable() {

        this.#targetTransform.position.removeChangeListener(this.onPositionChanged);
        this.#transform.position.removeChangeListener(this.onPositionChanged);
    }
}