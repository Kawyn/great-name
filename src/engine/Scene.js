class Scene {

    EventManager = new EventManager();
    TimeManager = new TimeManager();
    InputManager = new InputManager(this.TimeManager);

    /** @type {Actor[]} */
    actors = [];

    currentSceneState;
    Start() {

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
    PushActor(actor) {

        this.actors.push(actor);

        if (this.currentSceneState == 0)
            return;

        actor.onInitialize();

        if (this.currentSceneState == 1)
            return;

        actor.onPostInitialize();

        if (this.currentSceneState == 2)
            return;

        if (actor.active)
            actor.onEnable();
    }

    /**
     * @param {Actor} actor 
     */
    RemoveActor(actor) {

        if (actor.active)
            actor.onDisable();

        actor.onDestroy();

        Scene.Instance.actors.splice(Scene.Instance.actors.indexOf(this), 1); // move to scene
    }

    GetActorByIdentifier(identifier) {

        return this.actors.find(x => x.identifier === identifier);
    }


    static Instance = new Scene();
}