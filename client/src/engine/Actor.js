class Actor {

    /** @type {string} */ #identifier;
    /** @returns {string} */ get identifier() { return this.#identifier; }

    active = true;
    #resourceID = null;
    get ResourceID() { return this.#resourceID; }
    set ResourceID(value) {
        if (value !== null && (typeof value !== 'string' || !value.trim()))
            throw new Error('Actor ResourceID must be a nonempty resource ID or null.');
        this.#resourceID = value;
    }
    objectManager = null;
    /** @type {Actor?} */ #parent;

    get parent() { return this.#parent; }
    set parent(value) {

        value ??= null;
        if (value !== null && !(value instanceof Actor))
            throw new Error('Actor parent must be an Actor or null.');
        for (let ancestor = value; ancestor; ancestor = ancestor.parent)
            if (ancestor === this)
                throw new Error('Actor parenting cannot create a cycle.');

        if (value === this.#parent)
            return;

        const previous = this.#parent;
        if (previous) {
            previous.#children.splice(previous.#children.indexOf(this), 1);
            this.EventManager.riseEvent(ActorEvents.ON_PARENT_REMOVED, previous);
        }

        this.#parent = value;
        if (value)
            value.#children.push(this);

        this.EventManager.riseEvent(ActorEvents.ON_PARENT_SET, this.parent);
        for (const root of [previous, value])
            for (let ancestor = root; ancestor; ancestor = ancestor.parent)
                ancestor.EventManager.riseEvent(ActorEvents.ON_CHILDREN_CHANGED, this);
    }

    /** @type {Actor[]} */ #children = [];
    get children() { return [...this.#children]; }

    /** @type {EventManager} */ EventManager = new EventManager();

    /** @type {Component[]} */ #components = [];
    get components() { return [...this.#components]; }

    constructor(identifier = '', components = [], resourceID = null) {

        this.#identifier = identifier;
        this.#components = components;
        this.ResourceID = resourceID;
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

        for (let i = 0; i < this.#components.length; ++i) {

            if (this.#components[i] instanceof constructor)
                return this.#components[i];
        }

        return null;
    }

    GetCompnentsByType(constructor) {

        return this.#components.filter(x => x instanceof constructor);
    }

    addComponent(component) {

        for (const component of this.#components)
            component.onInitialize(this);
        for (const component of this.#components)
            component.onPostInitialize();
    }

    onDisable() {

        for (const component of this.#components)
            component.onDisable();

    }

    onDestroy() {
        for (const component of this.#components)
            component.onDestroy();
        this.parent = null;
        for (const child of this.children)
            child.parent = null;
    }

    destroy() {

        if (this.objectManager)
            this.objectManager.remove(this);
        else
            Scene.Instance.RemoveActor(this);

    }
}