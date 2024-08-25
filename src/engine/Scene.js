class Scene {

    EventManager = new EventManager();
    TimeManager = new TimeManager();
    InputManager = new InputManager();
    /** @type {Actor[]} */
    actors = [];

    currentSceneState;
    start() {

        this.currentSceneState = 0;
        for (const actor of this.actors)
            actor.onInitialize();
        this.currentSceneState = 1;

        for (const actor of this.actors)
            actor.onPostInitialize();
        this.currentSceneState = 2;

        for (const actor of this.actors)
            actor.onEnable();
        this.currentSceneState = 3;

        this.TimeManager.start();
    }

    /**
     * @param {Actor} actor 
     */
    pushActor(actor) {

        this.actors.push(actor);

        if (this.currentSceneState == 0) return;
        actor.onInitialize();
        if (this.currentSceneState == 1) return;
        actor.onPostInitialize();
        if (this.currentSceneState == 2) return;

        if (actor.active)
            actor.onEnable();
    }

    GetActorByIdentifier(identifier) {

        return this.actors.find(x => x.identifier === identifier);
    }


    static Instance = new Scene();
}