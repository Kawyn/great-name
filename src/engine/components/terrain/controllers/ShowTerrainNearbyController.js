class ShowTerrainNearbyController extends Component {

    /** @type {Transform} */ #transform;
    /** @type {Terrain} */ #terrain;

    /** @type {string[]} */#visibleParts = [];

    #previousPartX = NaN;
    #previousPartZ = NaN;

    onPositionChanged = (value) => {

        const currentPartX = Math.floor(value[0] / this.#terrain.partSize);
        const currentPartZ = Math.floor(value[2] / this.#terrain.partSize);

        if (this.#previousPartX === currentPartX && this.#previousPartZ === currentPartZ)
            return;

        this.#previousPartX = currentPartX;
        this.#previousPartZ = currentPartZ;

        const partsToShow = [];

        for (let x = currentPartX - this.terrainRadiusToShow; x <= currentPartX + this.terrainRadiusToShow; x++) {

            for (let z = currentPartZ - this.terrainRadiusToShow; z <= currentPartZ + this.terrainRadiusToShow; z++) {

                /*
                const directionX = x - currentPartX;
                const directionZ = z - currentPartZ;

                const dotProduct = (directionX * this.#transform.front[0] + directionZ * this.#transform.front[2]) /
                    (
                        Math.sqrt(Math.pow(directionX, 2) + Math.pow(directionZ, 2)) *
                        Math.sqrt(Math.pow(this.#transform.front[0], 2) + Math.pow(this.#transform.front[2], 2))
                    );

                if (dotProduct >= 0)
                */

                partsToShow.push([x, z]);
            }
        }

        // partsToShow.push([currentPartX, currentPartZ]);

        for (const part of this.#visibleParts) {

            if (partsToShow.some((v) => v[0] === part[0] && v[1] === part[1]))
                continue;

            this.#terrain.hideChunk(part[0], part[1]);
        }

        for (const part of partsToShow) {

            if (this.#visibleParts.some((v) => v[0] === part[0] && v[1] === part[1]))
                this.#terrain.changeQuality(part[0], part[1], this.qualityForPart(part[0], part[1]));
            else
                this.#terrain.showPart(part[0], part[1], this.qualityForPart(part[0], part[1]));
        }

        this.#visibleParts = partsToShow;

    }

    constructor(kit = {}) {

        if (!kit.terrainIdentifier) throw 'TerrainPart requires `terrainIdentifier` value to be present in kit (typeof string)';
        if (!kit.terrainRadiusToShow) throw 'TerrainPart requires `terrainRadiusToShow` value to be present in kit (typeof number)';

        super(kit);
    }

    onPostInitialize() {

        this.#transform = this.actor.GetCompnentByType(Transform);

        const terrain = Scene.Instance.GetActorByIdentifier(this.terrainIdentifier)
        this.#terrain = terrain.GetCompnentByType(Terrain)

        this.#terrain.controller = this;
    }

    onEnable() {

        this.#transform.position.addChangeListener(this.onPositionChanged);
    }

    isPartVisible(x, z) { return this.#visibleParts.some((v) => v[0] === x && v[1] === z); }

    qualityForPart(x, z) {

        const discance = Math.max(Math.abs(x - this.#previousPartX), Math.abs(z - this.#previousPartZ));

        if (discance <= 1)
            return 0;

        if (discance <= 3)
            return 1;

        if (discance <= 4)
            return 2;

        return 3;
    }

    onDisable() {

        this.#transform.position.removeChangeListener(this.onPositionChanged);
    }
}