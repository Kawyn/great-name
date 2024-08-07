class Component {

    /** @type {Actor} */ #actor;
    get actor() { return this.#actor }

    constructor(data) {

        if (!data)
            return;

        for (const key of data)
            this.key = data[key];
    }

    /**
     * @param {Actor} actor 
     */
    onInitialize(actor) {

        this.#actor = actor;
    }

    onPostInitialize() { }

    onEnable() { }
    onDisable() { }

    onDestroy() { }
}