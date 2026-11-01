/**
 * Shows ScoreState.score. The score has no gameplay rules yet, so it is labelled neutrally as samples.
 */
class ScoreStateDisplayer extends DisplayerBase {

    static VALUE_SELECTOR = '.score-value';
    static LABEL = 'Próbki';

    /** @type {string} */ #targetIdentifier;

    /** @type {ScoreState?} */ #scoreState = null;

    /** @type {HTMLElement} */ #value;

    /**
     * @param {string} name 
     * @param {string} id 
     * @param {boolean} visible 
     * @param {string} targetIdentifier actor owning the ScoreState
     */
    constructor(name, id, visible = true, targetIdentifier = 'player') {

        super(name, id, visible);

        this.#targetIdentifier = targetIdentifier;
    }

    _template() {

        return `
            <div class="hud-plaque" role="status" aria-live="polite">
                <span class="sigil" aria-hidden="true">&#9670;</span>
                <span class="score-label" data-localization-id="hud.samples">${ScoreStateDisplayer.LABEL}</span>
                <span class="score-value">0</span>
            </div>`;
    }

    initialize() {

        super.initialize();

        this.#value = this._displayer.querySelector(ScoreStateDisplayer.VALUE_SELECTOR);
    }

    enable() {

        const target = Scene.Instance.GetActorByIdentifier(this.#targetIdentifier);
        this.#scoreState = target?.GetCompnentByType(ScoreState) ?? null;

        if (!this.#scoreState)
            throw new Error(`ScoreStateDisplayer: actor '${this.#targetIdentifier}' has no ScoreState.`);

        this.#scoreState.score.addChangeListener(this.onScoreChanged);
    }

    disable() {

        this.#scoreState?.score.removeChangeListener(this.onScoreChanged);
        this.#scoreState = null;
    }

    onScoreChanged = (value) => {

        this.#value.textContent = String(value);
    };
}