class ItemPickerWindow extends MenuDialogWindow {
    titleId = 'craft.choose';
    #inventory = null;
    #tooltips = [];

    _bodyTemplate() {
        return '<div class="item-picker-grid"></div>';
    }

    show(context) {
        if (!context || typeof context.select !== 'function' || !Array.isArray(context.excluded) ||
            (context.filter !== undefined && typeof context.filter !== 'function') ||
            (context.closeOnSelect !== undefined && typeof context.closeOnSelect !== 'boolean'))
            throw new Error('Item picker requires exclusions and a selection action.');
        this.#unsubscribe();
        this.#inventory = Scene.Instance.GetActorByIdentifier('player')?.GetCompnentByType(Inventory);
        if (!this.#inventory)
            throw new Error('Item picker requires the player inventory.');
        this.#inventory.EventManager.addEventListener(Inventory.CHANGED, this.#render);
        super.show(context);
        GameInterface.localize(this._window.querySelector(`#${this.id}-title`), context.titleId ?? this.titleId);
        this.#render();
    }

    #render = () => {
        this.#clearTooltips();
        const list = this._window.querySelector('.item-picker-grid');
        list.textContent = '';
        const items = this.#inventory.orderedItems.filter(item =>
            item.serverId && !this._context.excluded.includes(item.serverId) &&
            (!this._context.filter || this._context.filter(item)));
        for (const item of items) {
            const button = document.createElement('button');
            button.setAttribute('type', 'button');
            button.classList.add('picker-item');
            ItemIcon.draw(button, item);
            this.#tooltips.push(ItemIcon.tooltip(button, item));
            button.onclick = () => {
                if (!this.#inventory.items.includes(item))
                    throw new Error('The selected item is no longer held.');
                const select = this._context.select;
                const close = this._context.closeOnSelect !== false;
                select(item.serverId);
                if (close)
                    this.hide();
            };
            list.appendChild(button);
        }
        if (!items.length) {
            const empty = document.createElement('p');
            GameInterface.localize(empty, 'inventory.empty');
            list.appendChild(empty);
        }
    };

    #clearTooltips() {
        for (const dispose of this.#tooltips)
            dispose();
        this.#tooltips = [];
    }

    #unsubscribe() {
        this.#clearTooltips();
        this.#inventory?.EventManager.removeEventListener(Inventory.CHANGED, this.#render);
        this.#inventory = null;
    }

    hide() {
        this.#unsubscribe();
        super.hide();
    }

    clear() {
        this.#unsubscribe();
        super.clear();
    }
}
