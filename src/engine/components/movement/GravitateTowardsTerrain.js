class GravitateTowardsTerrain extends Component {

    #terrain;

    #objectWithVelocity;
    #transform;

    /**
     * @param {string} terrainIdentifier 
     * @param {number} gravity 
     */
    constructor(terrainIdentifier, gravity) {
        super();

        this.terrainIdentifier = terrainIdentifier;
        this.gravity = gravity;
    }

    onPostInitialize() {

        this.#transform = this.actor.GetCompnentByType(Transform);
        this.#objectWithVelocity = this.actor.GetCompnentByType(ObjectWithVelocity);

        const terrainObject = Scene.Instance.GetActorByIdentifier(this.terrainIdentifier);
        this.#terrain = terrainObject.GetCompnentByType(Terrain);
    }

    onEnable() {

        Scene.Instance.TimeManager.addObjectToRefresh(this);
    }

    onRefresh(deltaTime) {

        const height = this.#terrain.getHeight(this.#transform.position.value[0], this.#transform.position.value[2]);
        const previousVelocity = this.#objectWithVelocity.velocity.value[1];
        //    console.log('biome', this.#terrain.getBiome(Math.round(this.#transform.position.value[0]), Math.round(this.#transform.position.value[2])));
        //   console.log('other', this.#terrain.otherGetBiome(Math.round(this.#transform.position.value[0]), Math.round(this.#transform.position.value[2])));
        this.#objectWithVelocity.velocity.value[1] -= 9.81 * deltaTime;

        if (this.#objectWithVelocity.velocity.value[1] < 0)
            this.#objectWithVelocity.velocity.value[1] -= 9.81 * deltaTime;

        if (this.#transform.position.value[1] + this.#objectWithVelocity.velocity.value[1] * deltaTime <= height) {

            this.#objectWithVelocity.velocity.value[1] = 0;

            if (previousVelocity != 0) {
                this.#objectWithVelocity.velocity.value[1] = 0;
                this.#objectWithVelocity.velocity.callChangedNow();
            }
            if (this.#transform.position.value[1] != height) {
                this.#transform.position.value[1] = height;
                this.#transform.position.callChangedNow();
            }
        }
        else {

            this.#objectWithVelocity.velocity.callChangedNow();
        }
    }

    onDisable() {
        Scene.Instance.TimeManager.addObjectToRefresh(this);
    }
}