class Game {
    ObjectManager = new ObjectManager();
    LocalizationManager = new LocalizationManager();
    ResourceManager = new ResourceManager();
    SaveManager = new SaveManager();
    #initialized = false;
    #initialization = null;
    get initialized() { return this.#initialized; }

    initialize() {
        this.#initialization ??= this.#initialize();
        return this.#initialization;
    }

    async #initialize() {
        await Promise.all([this.LocalizationManager.load(), this.ResourceManager.load()]);
        this.ObjectManager.initialize();
        this.SaveManager.LocalObjects.initialize();
        this.#initialized = true;
    }

    static Instance = new Game();
}
