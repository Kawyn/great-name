class ServerInventory extends Component {
    #items = new Map();

    static resourceID(type) {
        const resource = Game.Instance.ResourceManager.getAllByType('inventoryItem')
            .find(resource => resource.serverType === type);
        if (!resource)
            throw new Error(`Unknown inventory resource type '${type}'.`);
        return resource.id;
    }

    static validateEntries(entries) {
        if (!Array.isArray(entries) || entries.length > 200 || !entries.every(entry =>
            entry && typeof entry.text === 'string' && entry.text.trim() && entry.text.length <= 4000 &&
            !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(entry.text) &&
            Array.isArray(entry.strikes) && entry.strikes.length <= 4000 &&
            entry.strikes.every((range, index) => Array.isArray(range) && range.length === 2 &&
                range.every(Number.isInteger) && range[0] >= 0 && range[0] < range[1] &&
                range[1] <= entry.text.length && (index === 0 || entry.strikes[index - 1][1] < range[0]))))
            throw new Error('Invalid server journal entries.');
    }

    static validate(items) {
        const ids = new Set();
        if (!Array.isArray(items) || items.length > 32)
            throw new Error('Invalid inventory item list.');
        for (const item of items) {
            if (!item || typeof item.id !== 'string' || item.id.length > 100 || !item.id ||
                ids.has(item.id) || typeof item.isNew !== 'boolean' ||
                (item.burnable !== undefined && typeof item.burnable !== 'boolean') ||
                !['journal', 'emeraldTablets', 'preparedTablet', 'bitumen', 'salSmaragdinum', 'citrineArsenicum', 'argentumVivum', 'ash', 'water', 'lye', 'resin', 'hardenedResin', 'speedPotion', 'speedEssence'].includes(item.type))
                throw new Error('Invalid or duplicate inventory item.');
            ids.add(item.id);
            if (item.type === 'journal' || (['emeraldTablets', 'preparedTablet'].includes(item.type) &&
                ['ownerId', 'author', 'entries'].some(key => item[key] !== undefined))) {
                if (typeof item.ownerId !== 'string' || !item.ownerId || typeof item.author !== 'string' ||
                    !item.author || item.author.length > 120)
                    throw new Error('Invalid journal owner.');
                this.validateEntries(item.entries);
            }
        }
    }

    onEnable() {
        window.addEventListener('inventoryreceived', this.#receive);
        window.addEventListener('worldcleared', this.clear);
        if (window.GameConnection?.inventory)
            this.#receive({ detail: window.GameConnection.inventory });
    }

    #receive = ({ detail }) => {
        ServerInventory.validate(detail);
        for (const data of detail)
            ServerInventory.resourceID(data.type);
        const visible = new Set(detail.map(item => item.id));
        for (const [id, actor] of this.#items)
            if (!visible.has(id)) {
                actor.destroy();
                this.#items.delete(id);
            }
        for (const data of detail) {
            let actor = this.#items.get(data.id);
            if (!actor) {
                const item = ServerInventory.createItem(data);
                item.serverId = data.id;
                item.burnable = data.burnable === true;
                item.applyNew(data.isNew);
                actor = new Actor(`inventory_${data.id}`, [item], ServerInventory.resourceID(data.type));
                Scene.Instance.PushActor(actor);
                this.#items.set(data.id, actor);
                actor.parent = this.actor;
            }
            else {
                const item = actor.GetCompnentByType(InventoryItem);
                item.burnable = data.burnable === true;
                item.applyNew(data.isNew);
                if (item instanceof AlchemistJournal)
                    item.applyEntries(data.entries);
                if (item instanceof EmeraldTablets && data.entries !== undefined)
                    item.applyInscription(data);
            }
        }
        this.actor.GetCompnentByType(Inventory).refresh();
    };

    static createItem(data) {
        if (data.type === 'speedPotion' || data.type === 'speedEssence')
            return new SpeedPotion(data.type);
        if (data.type === 'journal') {
            const item = new AlchemistJournal(data.ownerId, data.author);
            item.applyEntries(data.entries);
            return item;
        }
        if (data.type === 'emeraldTablets' || data.type === 'preparedTablet')
            return new EmeraldTablets(data.entries === undefined ? null : data, data.type === 'preparedTablet');
        return new InventoryItem(ServerInventory.resourceID(data.type));
    }

    clear = () => {
        for (const actor of this.#items.values())
            actor.destroy();
        this.#items.clear();
    };

    onDisable() {
        window.removeEventListener('inventoryreceived', this.#receive);
        window.removeEventListener('worldcleared', this.clear);
        this.clear();
    }
}
