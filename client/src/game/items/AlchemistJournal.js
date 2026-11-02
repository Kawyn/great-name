class AlchemistJournal extends InventoryItemWithUse {
    #ownerId;
    #entries = [];
    get ownerId() { return this.#ownerId; }
    get entries() { return structuredClone(this.#entries); }
    get writable() { return this.#ownerId === window.GameConnection?.playerId; }
    get descriptionId() { return this.writable ? this.resource.ownDescriptionId : super.descriptionId; }

    constructor(ownerId, author = 'Alchemik') {
        super('item.journal', { author });
        if (typeof ownerId !== 'string' || !ownerId)
            throw new Error('Journal requires an alchemist owner ID.');
        this.#ownerId = ownerId;
    }

    applyEntries(entries) {
        ServerInventory.validateEntries(entries);
        this.#entries = structuredClone(entries);
    }

    append(text) {
        this.#assertWritable();
        return window.GameConnection.request('journalAppend', { itemId: this.serverId, text });
    }

    strike(entryIndex, start, end) {
        this.#assertWritable();
        return window.GameConnection.request('journalStrike', { itemId: this.serverId, entryIndex, start, end });
    }

    #assertWritable() {
        if (!this.writable || !this.serverId)
            throw new Error('Only the connected journal owner may write in a server-held journal.');
    }

    onUse({ windows }) {
        const menu = windows?.windowByType(MainMenuWindow);
        if (!menu)
            throw new Error('Journal requires the game window manager.');
        menu.openInventoryPage(this.writable ? JournalWindow : ItemTextWindow, { journal: this });
    }
}
