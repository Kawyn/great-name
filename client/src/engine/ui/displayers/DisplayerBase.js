class DisplayerBase {

    static IS_VISIBLE_ATTRIBUTE_NAME = 'is-visible';
    static CLASS_NAME = 'displayer';


    /** @type {boolean} */ #visible = false;
    get visible() { return this.#visible; }

    /** @type {string} */ #name;
    get name() { return this.#name; }

    /** @type {string} */ #id;
    get id() { return this.#id; }

    /** @type {DisplayerManager?} */ manager = null;

    /** @type {HTMLElement} */ _displayer;


    /**
     * @param {string} name 
     * @param {string} id id of the created HTML element
     * @param {boolean} visible 
     */
    constructor(name, id, visible = true) {

        this.#name = name;
        this.#id = id;

        this.#visible = visible;
    }

    get element() { return this._displayer; }

    initialize() {

        if (!this._displayer) {

            this._displayer = MyInterfaceFunctions.create(this._template());
            this._displayer.id = this.#id;
            this._displayer.classList.add(DisplayerBase.CLASS_NAME);

            MyInterfaceFunctions.attach(this._displayer);
            if (Game.Instance.LocalizationManager.language.value !== null)
                Game.Instance.LocalizationManager.refresh(this._displayer);
        }

        if (this.visible)
            this.show();
        else
            this.hide();
    }

    /**
     * Root element markup of the displayer.
     * @returns {string}
     */
    _template() {

        return '<div></div>';
    }

    show() {

        this.#visible = true;
        this._displayer.setAttribute(DisplayerBase.IS_VISIBLE_ATTRIBUTE_NAME, 'true');
    }

    hide() {

        this.#visible = false;
        this._displayer.setAttribute(DisplayerBase.IS_VISIBLE_ATTRIBUTE_NAME, 'false');
    }

    /** Subscribes to observed state; mirrors Component.onEnable. */
    enable() { }

    /** Unsubscribes from observed state; mirrors Component.onDisable. */
    disable() { }

    clear() {

        MyInterfaceFunctions.detach(this._displayer);
        this._displayer = null;
    }
}