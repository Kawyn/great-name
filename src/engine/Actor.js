class Actor {

    /** @type {string} */ #identifier;
    /** @returns {string} */ get identifier() { return this.#identifier; }

    /** @type {Actor?} */ parent;
    /** @type {Actor[]} */ children;

    /** @type {EventManager} */ EventManager = new EventManager();

    /** @type {Component[]} */ #components = [];

    constructor(identifier = '', components = []) {

        this.#identifier = identifier;
        this.#components = components;
    }

    onInitialize() {

        for (const component of this.#components)
            component.onInitialize(this);
    }

    onPostInitialize() {

        for (const component of this.#components)
            component.onPostInitialize();
    }

    onEnable() {
        for (const component of this.#components)
            component.onEnable();
    }

    GetCompnentByType(constructor) {

        return this.#components.find(x => x instanceof constructor);
    }

    addComponent(component) {

        for (const component of this.#components)
            component.onInitialize(this);
        for (const component of this.#components)
            component.onPostInitialize();
    }

    onDisable() { }

    onDestroy() { }
}