class WindowManager {

    /** @type {UserInterface?} */ #owner = null;
    get owner() { return this.#owner; }

    #initialized = false;

    /** @type {WindowBase[]} */ windows = [];

    /**
     * Builds every window. Safe to call again; already built windows are kept.
     * @param {UserInterface} owner 
     */
    initialize(owner) {

        this.#owner = owner;

        for (const window of this.windows)
            window.initialize();

        this.#initialized = true;
    }

    /**
     * @param {WindowBase} window 
     */
    push(window) {

        window.manager = this;
        this.windows.push(window);

        if (this.#initialized)
            window.initialize();
    }

    /**
     * @param {string} name 
     * @returns {WindowBase?}
     */
    windowByName(name) {

        return this.windows.find(window => window.name === name) ?? null;
    }

    /**
     * @param {Function} type 
     * @returns {WindowBase?}
     */
    windowByType(type) {

        return this.windows.find(window => window instanceof type) ?? null;
    }

    clear() {

        for (const window of this.windows)
            window.clear();

        this.#initialized = false;
    }
}