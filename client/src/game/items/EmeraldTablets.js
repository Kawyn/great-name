class EmeraldTablets extends InventoryItemWithUse {
    #entries = null;
    get entries() { return structuredClone(this.#entries); }

    constructor(inscription = null, prepared = false) {
        super(prepared ? 'item.prepared-tablet' : 'item.emerald-tablets', {
            author: inscription ? inscription.author : ''
        });
        this.prepared = prepared;
        if (inscription)
            this.applyInscription(inscription);
    }

    applyInscription(inscription) {
        ServerInventory.validateEntries(inscription.entries);
        this.#entries = structuredClone(inscription.entries);
    }

    onUse({ windows }) {
        const menu = windows?.windowByType(MainMenuWindow);
        if (!menu)
            throw new Error('Emerald Tablets require the game window manager.');
        menu.openInventoryPage(ItemTextWindow, {
            titleId: this.nameId,
            textId: 'item.emeraldTablets.text',
            tablet: this.#entries === null ? null : this,
            theme: 'emerald'
        });
    }
}
