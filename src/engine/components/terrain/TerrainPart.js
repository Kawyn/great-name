class TerrainPart extends Component {

    /** @type {Renderable[]} */ #renderers;

    #visible;
    get visible() { return this.#visible };

    #quality = NaN;

    constructor(kit = {}) {

        if (!kit.meshes) throw 'TerrainPart requires `meshes` value to be present in kit (typeof Mesh[])';

        super(kit);
    }

    onPostInitialize() {

        this.#renderers = this.actor.GetCompnentsByType(Renderable);
        console.log(this.actor.identifier);
    }

    show(quality) {
        this.#visible = true;
        this.changeQuality(quality);

        for (const renderer of this.#renderers) {
            renderer.active = true;
        }


    }

    hide() {
        this.#visible = false;

        for (const renderer of this.#renderers)
            renderer.active = false;
    }

    changeQuality(quality) {

        if (quality == this.#quality)
            return;
        console.error('cgabge qyakuty, quality', quality, this.#quality);
        this.quality = quality;
        for (const renderer of this.#renderers) {
            renderer.mesh = this.meshes[quality];
            renderer.material.isMeshDirty = true;
        }
    }

    onDestroy() {

        for (const renderer of this.#renderers) {

            if (renderer.material.local)
                renderer.material.clear();
        }
    }
}