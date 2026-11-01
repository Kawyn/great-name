class ObjectManager {
    #actors = [];
    #state = 0;
    get actors() { return [...this.#actors]; }
    get initialized() { return this.#state === 3; }

    initialize() {
        if (this.initialized)
            return;
        for (const actor of this.#actors)
            actor.onInitialize();
        this.#state = 1;
        for (const actor of this.#actors)
            actor.onPostInitialize();
        this.#state = 2;
        for (const actor of this.#actors)
            if (actor.active)
                actor.onEnable();
        this.#state = 3;
    }

    push(actor) {
        if (!actor || typeof actor.identifier !== 'string' ||
            this.getByIdentifier(actor.identifier) || actor.objectManager)
            throw new Error('ObjectManager requires an actor with a unique identifier.');
        actor.objectManager = this;
        this.#actors.push(actor);
        if (this.#state === 0)
            return;
        actor.onInitialize();
        if (this.#state === 1)
            return;
        actor.onPostInitialize();
        if (this.#state === 2)
            return;
        if (actor.active)
            actor.onEnable();
    }

    remove(actor) {
        const index = this.#actors.indexOf(actor);
        if (index === -1)
            throw new Error('Cannot remove an actor not owned by this ObjectManager.');
        if (actor.active)
            actor.onDisable();
        this.#actors.splice(index, 1);
        actor.objectManager = null;
        actor.onDestroy();
    }

    getByIdentifier(identifier) {
        return this.#actors.find(actor => actor.identifier === identifier);
    }
}
