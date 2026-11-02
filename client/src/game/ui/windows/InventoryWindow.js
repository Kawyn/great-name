class InventoryWindow extends MenuDialogWindow {
    titleId = 'menu.inventory';
    #inventory = null;
    #tooltips = [];
    #renderedItems = [];

    _bodyTemplate() {
        return `
            <div class="inventory-items"></div>
            <p class="inventory-error" role="alert" hidden></p>`;
    }

    _footerTemplate() {
        return `<footer class="dialog-footer">
            <button type="button" class="brass-button inventory-craft" data-localization-id="craft.title"></button>
            <button type="button" class="brass-button dialog-close" data-localization-id="ui.close"></button>
        </footer>`;
    }

    initialize() {
        if (this._window)
            return;
        super.initialize();
        this._window.querySelector('.inventory-craft').onclick = () =>
            this.manager.windowByType(MainMenuWindow).openInventoryPage(CraftingWindow);
    }

    show(context) {
        const inventory = Scene.Instance.GetActorByIdentifier('player')?.GetCompnentByType(Inventory);
        if (!inventory)
            throw new Error('Player requires an Inventory component.');
        this.#unsubscribe();
        this.#inventory = inventory;
        this.#inventory.EventManager.addEventListener(Inventory.CHANGED, this.#refresh);
        super.show(context);
        this.#refresh();
    }

    hide() {
        this.#unsubscribe();
        super.hide();
    }

    clear() {
        this.#unsubscribe();
        super.clear();
    }

    #unsubscribe() {
        this.#clearTooltips();
        this.#inventory?.EventManager.removeEventListener(Inventory.CHANGED, this.#refresh);
        this.#inventory = null;
        this.#renderedItems = [];
    }

    #refresh = () => {
        const items = this.#inventory.orderedItems;
        const list = this._window.querySelector('.inventory-items');
        if (items.length && items.length === this.#renderedItems.length &&
            items.every((item, index) => item === this.#renderedItems[index])) {
            const icons = list.querySelectorAll('.inventory-item');
            items.forEach((item, index) => {
                if (!item.isNew) {
                    icons[index].classList.remove('inventory-item-new');
                    const badge = icons[index].querySelector('.inventory-new-badge');
                    if (badge)
                        badge.hidden = true;
                }
            });
            return;
        }
        this.#clearTooltips();
        this.#renderedItems = items;
        list.textContent = '';
        for (const item of items)
            list.appendChild(this.#createEntry(item));
        for (let index = items.length; index < 32; index++) {
            const slot = document.createElement('div');
            slot.classList.add('inventory-empty-slot');
            slot.setAttribute('aria-hidden', 'true');
            list.appendChild(slot);
        }
    };

    #createEntry(item) {
        const entry = document.createElement('div');
        entry.classList.add('inventory-entry');
        entry.appendChild(this.#createItem(item));
        return entry;
    }

    #actions(item) {
        const inventory = this.#inventory;
        this.manager.windowByType(MainMenuWindow).openInventoryPage(TextDialogWindow, {
            titleId: 'menu.inventory', text: ItemIcon.author(item) ? '' : ItemIcon.name(item),
            subject: ItemIcon.author(item) ? { name: ItemIcon.name(item), author: ItemIcon.author(item) } : undefined,
            buttons: [
                { labelId: 'ui.cancel' },
                { labelId: 'inventory.drop', action: async () => {
                    if (!inventory.items.includes(item))
                        throw new Error(Game.Instance.LocalizationManager.get('inventory.itemUnavailable'));
                    await window.GameConnection.request('inventoryDrop', { itemId: item.serverId });
                } }
            ]
        });
    }

    #createItem(item) {
        const usable = item instanceof InventoryItemWithUse;
        const button = document.createElement(usable ? 'button' : 'div');
        if (usable)
            button.setAttribute('type', 'button');
        else {
            button.setAttribute('tabindex', '0');
            button.setAttribute('role', 'img');
        }
        ItemIcon.draw(button, item);
        this.#tooltips.push(ItemIcon.tooltip(button, item));
        this.#decorateNew(button, item);
        if (item.serverId) {
            button.addEventListener('contextmenu', event => {
                event.preventDefault();
                this.#actions(item);
            });
            button.addEventListener('keydown', event => {
                if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.#actions(item);
                }
            });
        }
        if (!usable)
            return button;
        button.onclick = async () => {
            try {
                await this.#inventory.use(item, { windows: this.manager });
            }
            catch (error) {
                console.error('Inventory item use failed:', error);
                if (!this.visible)
                    this.show();
                const status = this._window.querySelector('.inventory-error');
                GameInterface.localize(status, 'inventory.error', { message: error.message });
                status.hidden = false;
            }
        };
        return button;
    }

    #clearTooltips() {
        for (const dispose of this.#tooltips)
            dispose();
        this.#tooltips = [];
    }

    #decorateNew(element, item) {
        if (!item.isNew)
            return;
        element.classList.add('inventory-item-new');
        const badge = document.createElement('span');
        badge.classList.add('inventory-new-badge');
        GameInterface.localize(badge, 'inventory.new');
        element.appendChild(badge);
        const mark = () => {
            try {
                item.markSeen();
                if (!item.serverId) {
                    element.classList.remove('inventory-item-new');
                    badge.hidden = true;
                }
            }
            catch (error) {
                console.error('Could not mark inventory item as seen:', error);
                const status = this._window.querySelector('.inventory-error');
                GameInterface.localize(status, 'inventory.error', { message: error.message });
                status.hidden = false;
            }
        };
        element.addEventListener('mouseenter', mark);
        element.addEventListener('focus', mark);
        element.addEventListener('click', mark);
    }
}
