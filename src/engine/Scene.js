class Scene {

    EventManager = new EventManager();
    TimeManager = new TimeManager();
    InputManager = new InputManager();
    /** @type {Actor[]} */
    actors = [];

    start() {

        for (const actor of this.actors)
            actor.onInitialize();

        for (const actor of this.actors)
            actor.onPostInitialize();

        for (const actor of this.actors)
            actor.onEnable();

        this.TimeManager.start();
    }


    GetActorByIdentifier(identifier) {

        return this.actors.find(x => x.identifier === identifier);
    }

    static Instance = new Scene();
}