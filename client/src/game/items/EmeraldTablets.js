class EmeraldTablets extends InventoryItemWithUse {
    constructor() {
        super('Szmaragdowe Tablice', 'item.emeraldTablets.name', {
            category: 'notes', author: 'Anonimowy alchemik', authorId: 'item.emeraldTablets.author'
        });
    }

    onUse({ windows }) {
        const menu = windows?.windowByType(MainMenuWindow);
        if (!menu)
            throw new Error('Emerald Tablets require the game window manager.');
        menu.openInventoryPage(ItemTextWindow, {
            titleId: this.nameId,
            textId: 'item.emeraldTablets.text',
            theme: 'emerald'
        });
    }
}
