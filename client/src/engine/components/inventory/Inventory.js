class Inventory extends Component {
    static CHANGED = 'inventoryChanged';
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

    use(item, context = {}) {
        if (!(item instanceof InventoryItemWithUse) || !this.items.includes(item))
            throw new Error('Inventory can only use its own usable items.');
        return item.use({ ...context, inventory: this });
    }

    onEnable() {
        this.actor.EventManager.addEventListener(ActorEvents.ON_CHILDREN_CHANGED, this.#onChanged);
    }

    onDisable() {
        this.actor.EventManager.removeEventListener(ActorEvents.ON_CHILDREN_CHANGED, this.#onChanged);
    }

    #onChanged = () => {
        this.EventManager.riseEvent(Inventory.CHANGED, this.items);
    };
}
