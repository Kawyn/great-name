class InventoryDisplayer extends DisplayerBase {
    static ACTION = 'inventory';
    static KEY_CODE = 'KeyI';
    static KEY_LABEL = 'I';

    _template() {
        return `
            <button type="button" class="brass-button inventory-shortcut">
                <svg class="inventory-bag-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
                    <path d="M10 7V4h12v3M8 10h16l4 18H4zM10 10l2-3h8l2 3M12 18h8"/>
                </svg>
                <span data-localization-id="menu.inventory">Ekwipunek</span>
                <kbd class="input-icon"></kbd>
            </button>`;
    }

    enable() {
        const input = Scene.Instance.InputManager;
        const binding = this.constructor;
        input.bindAction(binding.ACTION, binding.KEY_CODE,
            binding.KEY_LABEL, this.#open, true);
        this._displayer.querySelector('.input-icon').textContent = input.getActionLabel(binding.ACTION);
        this._displayer.onclick = () => input.triggerAction(binding.ACTION);
    }

    disable() {
        Scene.Instance.InputManager.unbindAction(this.constructor.ACTION);
        this._displayer.onclick = null;
    }

    #open = () => {
        const menu = this.manager.owner.WindowManager.windowByType(MainMenuWindow);
        if (!menu)
            throw new Error('Inventory shortcut requires the main menu window.');
        this.open(menu);
    };

    open(menu) {
        menu.toggleGameInventory();
    }
}
