class DisplayerManager {

    /** @type {DisplayerBase[]} */ #displayers = [];
    get displayers() { return [...this.#displayers]; }

    /** @type {UserInterface?} */ #owner = null;
    get owner() { return this.#owner; }

    #initialized = false;
    #enabled = false;

    /**
     * @param {UserInterface} owner 
     */
    initialize(owner) {

        this.#owner = owner;

        for (const displayer of this.#displayers)
            displayer.initialize();

        this.#initialized = true;
    }

    /**
     * @param {DisplayerBase} displayer 
     */
    push(displayer) {

        displayer.manager = this;
        this.#displayers.push(displayer);

        if (this.#initialized)
            displayer.initialize();

        if (this.#enabled)
            displayer.enable();
    }

    /**
     * @param {Function} type 
     * @returns {DisplayerBase?}
     */
    displayerByType(type) {

        return this.#displayers.find(displayer => displayer instanceof type) ?? null;
    }

    enable() {

        if (this.#enabled)
            return;

        this.#enabled = true;

        for (const displayer of this.#displayers)
            displayer.enable();
    }

    disable() {

        if (!this.#enabled)
            return;

        this.#enabled = false;

        for (const displayer of this.#displayers)
            displayer.disable();
    }

    clear() {

        this.disable();

        for (const displayer of this.#displayers)
            displayer.clear();

        this.#initialized = false;
    }
}