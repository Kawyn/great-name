class SpawnThingsNearTarget extends Component {

    static ON_THING_DESTROYED = 'OnSpawnThingsNearTarget_PartControllerDestroyed';
    targetIdentifier = 'player';
    creatorFunction;

    thingsToSpawn = 5;
    range = 100;
    #terrain;
    minDistance = 300;
    maxDistance = 400;
    counter = 0;
    /** @type {Transform} */ #targetTransform;
    /** @type {Transform} */ #transform;

    /** @type {ScoreState} */  #targetScore;

    constructor(kit = {}) {

        if (!kit.targetIdentifier)
            kit.targetIdentifier = 'player';

        super(kit);
    }

    onPostInitialize() {

        const target = Scene.Instance.GetActorByIdentifier(this.targetIdentifier);
        this.#targetTransform = target.GetCompnentByType(Transform);

        const terrainObject = Scene.Instance.GetActorByIdentifier('terrain');
        this.#terrain = terrainObject.GetCompnentByType(Terrain);
    }

    onEnable() {

        this.actor.EventManager.addEventListener(SpawnThingsNearTarget.ON_THING_DESTROYED, this.onEventCame);
        this.spawnMissingThings();
    }

    onEventCame = (eventName, data) => {

        this.counter--;
        this.spawnMissingThings();
    }

    spawnMissingThings() {

        while (this.counter < this.thingsToSpawn)
            this.spawnThing();

    }

    spawnThing() {

        this.counter++;

        const randomInRange = (x, y) => {

            x = x - y;
            const angle = Math.random() * 2 * Math.PI;
            const radius = Math.random() * x + (y - x);
            return [
                radius * Math.cos(angle),
                radius * Math.sin(angle)
            ];
        };
        const [offsetX, offsetY] = randomInRange(this.maxDistance, this.minDistance);

        const position = [...this.#targetTransform.position.value];
        position[0] += offsetX;
        position[2] += offsetY;
        position[1] = this.#terrain.getHeight(position[0], position[2]) + 10;

        const part = new Actor('', [
            new Transform({ position: position, rotation: [15, 45, 75], scale: [5, 5, 5] }),
            new Renderable(Mesh.CUBE, bocchiMaterial),
            new Renderable(Mesh.CUBE, simpleMaterial, 'shadowcasters'),
            new RotateOverTime([10, 10, 10]),
            new ChangeScoreOnCollect(),
            new SpawnThingsNearTarget_PartController({ ownerIdentifier: this.actor.identifier, targetIdentifier: this.targetIdentifier })
        ]);

        console.log(position);

        Scene.Instance.PushActor(part);
    }

    onDisable() {

        this.actor.EventManager.removeEventListener(SpawnThingsNearTarget.ON_THING_DESTROYED, this.onEventCame);
    }
}

class SpawnThingsNearTarget_PartController extends Component {

    /** @type {Actor} */ #owner;

    #transform;
    #targetTransform;

    constructor(kit = {}) {

        if (!kit.targetIdentifier)
            kit.targetIdentifier = 'player';

        super(kit);
    }

    onPostInitialize() {

        const target = Scene.Instance.GetActorByIdentifier(this.targetIdentifier);
        this.#targetTransform = target.GetCompnentByType(Transform);

        this.#transform = this.actor.GetCompnentByType(Transform);

        this.#owner = Scene.Instance.GetActorByIdentifier(this.ownerIdentifier);
    }

    onEnable() {

        this.#targetTransform.position.addChangeListener(this.onPositionChanged);
        this.#transform.position.addChangeListener(this.onPositionChanged);
    }

    onPositionChanged = (value) => {

        const distance = Math.pow(this.#transform.position.value[0] - this.#targetTransform.position.value[0], 2) + Math.pow(this.#transform.position.value[2] - this.#targetTransform.position.value[2], 2);
        if (distance > Math.SQRT2 * 400 * 400) // out of range{
        {
            this.actor.destroy();

        }
    }

    onDisable() {

        this.#targetTransform.position.removeChangeListener(this.onPositionChanged);
        this.#transform.position.removeChangeListener(this.onPositionChanged);
    }

    onDestroy() {

        this.#owner.EventManager.riseEvent(SpawnThingsNearTarget.ON_THING_DESTROYED, this.actor);

        super.onDestroy();
    }
}