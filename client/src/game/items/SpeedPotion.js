class SpeedPotion extends InventoryItemWithUse {
    #drinking = false;

    constructor(type) {
        super(ServerInventory.resourceID(type));
    }

    async onUse() {
        if (this.#drinking)
            return;
        this.#drinking = true;
        try {
            await window.GameConnection.request('drink', { itemId: this.serverId });
        }
        finally {
            this.#drinking = false;
        }
    }
}
