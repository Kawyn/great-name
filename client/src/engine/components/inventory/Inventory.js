class Inventory extends Component {
    static CHANGED = 'inventoryChanged';
    static ADDED = 'inventoryAdded';
    #known = new Set();
    EventManager = new EventManager();

    get items() {
        if (!this.actor)
            throw new Error('Inventory must be initialized before reading its items.');
        const items = [];
        const collect = actor => {
            for (const child of actor.children) {
                items.push(...child.GetCompnentsByType(InventoryItem));
                collect(child);
            }
        };
        collect(this.actor);
        return items;
    }

    get orderedItems() {
        const rank = item => item.ownerId ? (item.ownerId === window.GameConnection?.playerId ? 0 : 1) :
            (item.category === 'notes' ? 2 : 3);
        return this.items.sort((a, b) => rank(a) - rank(b));
    }

    use(item, context = {}) {
        if (!(item instanceof InventoryItemWithUse) || !this.items.includes(item))
            throw new Error('Inventory can only use its own usable items.');
        return item.use({ ...context, inventory: this });
    }

    onEnable() {
        this.actor.EventManager.addEventListener(ActorEvents.ON_CHILDREN_CHANGED, this.#onChanged);
        this.#onChanged();
    }

    onDisable() {
        this.actor.EventManager.removeEventListener(ActorEvents.ON_CHILDREN_CHANGED, this.#onChanged);
    }

    #onChanged = () => {
        const items = this.items;
        const added = items.filter(item => !this.#known.has(item));
        this.#known = new Set(items);
        this.EventManager.riseEvent(Inventory.CHANGED, items);
        for (const item of added)
            this.EventManager.riseEvent(Inventory.ADDED, item);
    };

    refresh() {
        this.#onChanged();
    }
}
