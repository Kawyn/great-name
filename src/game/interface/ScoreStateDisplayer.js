class ScoreStateDisplayer extends Component {

    targetIdentifier = 'player';
    interfaceIdentifier = '#score';

    /** @type {ScoreState} */  #scoreState;
    #scoreInterface;


    constructor(kit) {

        if (!kit.targetIdentifier)
            kit.targetIdentifier = 'player';

        if (!kit.interfaceIdentifier)
            kit.interfaceIdentifier = '#score';

        super(kit);
    }

    onPostInitialize() {

        const target = Scene.Instance.GetActorByIdentifier(this.targetIdentifier);
        this.#scoreState = target.GetCompnentByType(ScoreState);

        this.#scoreInterface = document.querySelector(this.interfaceIdentifier);
    }

    onEnable() {

        this.#scoreState.score.addChangeListener(this.onScoreChanged);
    }

    onScoreChanged = (value) => {

        console.log(this)
        this.#scoreInterface.innerText = 'Zdobyte punkty: ' + this.#scoreState.score.value;
    }

    onDisable() {

        this.#scoreState.score.removeChangeListener(this.onScoreChanged);
    }
}