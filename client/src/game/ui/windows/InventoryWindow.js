class InventoryWindow extends MenuDialogWindow {
    titleId = 'menu.inventory';
    #inventory = null;
    #tooltips = [];

    _bodyTemplate() {
        return `
            <p class="inventory-note" data-localization-id="inventory.hint"></p>
            <div class="inventory-items">
                <section class="inventory-section">
                    <h2 data-localization-id="inventory.notes"></h2>
                    <div class="inventory-notes"></div>
                </section>
                <section class="inventory-section">
                    <h2 data-localization-id="inventory.objects"></h2>
                    <div class="inventory-objects"></div>
                </section>
            </div>
            <p class="inventory-error" role="alert" hidden></p>`;
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
    }

    #refresh = () => {
        this.#clearTooltips();
        this._window.querySelector('.inventory-error').hidden = true;
        const items = this.#inventory.items;
        for (const [category, selector] of [['notes', '.inventory-notes'], ['items', '.inventory-objects']]) {
            const list = this._window.querySelector(selector);
            list.textContent = '';
            const sectionItems = items.filter(item => item.category === category);
            if (!sectionItems.length) {
                const empty = document.createElement('p');
                GameInterface.localize(empty, 'inventory.empty');
                list.appendChild(empty);
            }
            for (const item of sectionItems)
                list.appendChild(this.#createItem(item));
        }
    };

    #createItem(item) {
        if (!(item instanceof InventoryItemWithUse))
            return this.#createIcon(item);
        const button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.classList.add('brass-button', 'inventory-item');
        const name = document.createElement('span');
        name.classList.add('inventory-item-name');
        if (item.nameId)
            GameInterface.localize(name, item.nameId, {}, item.name);
        else
            name.textContent = item.name;
        button.appendChild(name);
        if (item.category === 'notes') {
            const author = document.createElement('span');
            author.classList.add('inventory-item-author');
            if (item.authorId)
                GameInterface.localize(author, item.authorId, {}, item.author);
            else
                author.textContent = item.author;
            button.appendChild(author);
        }
        button.disabled = !(item instanceof InventoryItemWithUse);
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

    #createIcon(item) {
        const element = document.createElement('div');
        element.classList.add('inventory-item', 'inventory-item-icon');
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'img');
        element.setAttribute('aria-label', item.name);
        element.innerHTML = item.icon === 'vial'
            ? '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M18 5h12v6h-2v10l9 17v5H11v-5l9-17V11h-2zM14 34h20"/></svg>'
            : '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4L8 16v19l16 9 16-9V16zM24 4v40M8 16l16 8 16-8M8 35l16-11 16 11"/></svg>';
        this.#tooltips.push(Tooltip.attach(element, () => {
            const localization = Game.Instance.LocalizationManager;
            return [
                { heading: true, text: item.nameId ? localization.get(item.nameId) : item.name },
                { text: item.descriptionId ? localization.get(item.descriptionId) : item.description }
            ];
        }));
        return element;
    }
}
