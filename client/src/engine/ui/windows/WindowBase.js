class WindowContextBase { }

class WindowBase {

    static IS_VISIBLE_ATTRIBUTE_NAME = 'is-visible';
    static CLASS_NAME = 'window';


    /** @type {boolean} */ #visible = false;
    get visible() { return this.#visible; }

    /** @type {string} */ #name;
    get name() { return this.#name; }

    /** @type {string} */ #id;
    get id() { return this.#id; }

    /** @type {WindowManager?} */ manager = null;

    /** @type {HTMLElement} */ _window;

    /** @type {WindowContextBase} */ _context;


    /**
     * @param {string} name 
     * @param {string} id id of the created HTML element
     * @param {boolean} visible 
     */
    constructor(name, id, visible = false) {

        this.#name = name;
        this.#id = id;

        this.#visible = visible;
    }

    get element() { return this._window; }

    initialize() {

        if (this._window)
            return;

        this._window = MyInterfaceFunctions.create(this._template());
        this._window.id = this.#id;
        this._window.classList.add(WindowBase.CLASS_NAME);
        this._window.setAttribute(WindowBase.IS_VISIBLE_ATTRIBUTE_NAME, String(this.#visible));

        MyInterfaceFunctions.attach(this._window);
        if (Game.Instance.LocalizationManager.language.value !== null)
            Game.Instance.LocalizationManager.refresh(this._window);
    }

    /**
     * Root element markup of the window.
     * @returns {string}
     */
    _template() {

        return '<div></div>';
    }

    /**
     * @param {WindowContextBase} context 
     */
    show(context = new WindowContextBase()) {

        this._context = context;

        this.#visible = true;
        this._window.setAttribute(WindowBase.IS_VISIBLE_ATTRIBUTE_NAME, 'true');
    }

    hide() {

        this._context = null;

        this.#visible = false;
        this._window.setAttribute(WindowBase.IS_VISIBLE_ATTRIBUTE_NAME, 'false');
    }

    clear() {

        MyInterfaceFunctions.detach(this._window);
        this._window = null;
        this._context = null;
    }
}