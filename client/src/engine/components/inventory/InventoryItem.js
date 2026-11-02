class InventoryItem extends Component {
    serverId = null;
    isNew = true;
    burnable = false;
    #resourceID;
    #author;

    get resource() {
        const id = this.actor?.ResourceID ?? this.#resourceID;
        const resource = Game.Instance.ResourceManager.get(id);
        if (!resource || resource.type !== 'inventoryItem')
            throw new Error(`Unknown inventory resource '${id}'.`);
        return resource;
    }

    get name() { return Game.Instance.LocalizationManager.get(this.nameId); }
    get nameId() { return this.resource.nameId; }
    get category() { return this.resource.category; }
    get author() { return this.#author; }
    get authorId() { return this.#author ? '' : this.resource.authorId ?? ''; }
    get description() { return Game.Instance.LocalizationManager.get(this.descriptionId); }
    get descriptionId() { return this.resource.descriptionId; }
    get icon() { return this.resource.icon; }

    constructor(resourceID, { author = '' } = {}) {
        super();
        if (typeof resourceID !== 'string' || !resourceID.trim() || typeof author !== 'string')
            throw new Error('InventoryItem requires a resource ID and a valid author.');
        this.#resourceID = resourceID;
        this.#author = author;
        const resource = this.resource;
        if (resource.category === 'notes' && !author.trim() && !resource.authorId)
            throw new Error('Notes require an author.');
    }

    onInitialize(actor) {
        if (actor.ResourceID !== null && actor.ResourceID !== this.#resourceID)
            throw new Error('Inventory item and Actor ResourceID must match.');
        actor.ResourceID = this.#resourceID;
        super.onInitialize(actor);
    }

    markSeen() {
        if (!this.isNew)
            return;
        if (this.serverId)
            window.GameConnection.sendCommand({ command: 'inventorySeen', itemId: this.serverId });
        else
            this.isNew = false;
    }

    applyNew(value) {
        this.isNew = value;
    }
}
