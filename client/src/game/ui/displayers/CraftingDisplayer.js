class CraftingDisplayer extends InventoryDisplayer {
    static ACTION = 'crafting';
    static KEY_CODE = 'KeyC';
    static KEY_LABEL = 'C';

    _template() {
        return `<button type="button" class="brass-button inventory-shortcut crafting-shortcut">
            <svg class="inventory-bag-icon" viewBox="0 0 32 32" aria-hidden="true">
                <circle cx="16" cy="16" r="13"/><path d="M16 5L5 24h22zM5 11h22M16 5v22"/>
            </svg>
            <span data-localization-id="craft.title"></span><kbd class="input-icon"></kbd>
        </button>`;
    }

    open(menu) {
        menu.toggleGameCrafting();
    }
}
