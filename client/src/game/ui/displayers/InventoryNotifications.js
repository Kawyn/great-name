class InventoryNotifications extends DisplayerBase {
    #inventory = null;
    #timers = new Set();
    #pending = [];
    #arrivalTimer = null;

    _template() {
        return '<div class="inventory-notifications" role="status" aria-live="polite"></div>';
    }

    enable() {
        this.#inventory = Scene.Instance.GetActorByIdentifier('player')?.GetCompnentByType(Inventory);
        if (!this.#inventory)
            throw new Error('Inventory notifications require the player inventory.');
        this.#inventory.EventManager.addEventListener(Inventory.ADDED, this.#added);
    }

    #added = (name, item) => {
        if (!item.isNew)
            return;
        this.#pending.push(item);
        this.#drain();
    };

    #drain() {
        if (this.#arrivalTimer !== null || !this.#pending.length || this._displayer.children.length >= 5)
            return;
        this.#showItem(this.#pending.shift());
        this.#arrivalTimer = window.setTimeout(() => {
            this.#arrivalTimer = null;
            this.#drain();
        }, 350);
    }

    #showItem(item) {
        const popup = document.createElement('div');
        popup.classList.add('parchment', 'inventory-popup');
        const label = document.createElement('span');
        GameInterface.localize(label, 'inventory.acquired');
        const title = document.createElement('strong');
        if (item.nameId)
            GameInterface.localize(title, item.nameId, {}, item.name);
        else
            title.textContent = item.name;
        popup.appendChild(label);
        popup.appendChild(title);
        this._displayer.appendChild(popup);
        const timer = window.setTimeout(() => {
            popup.remove();
            this.#timers.delete(timer);
            this.#drain();
        }, 5000);
        this.#timers.add(timer);
    }

    disable() {
        this.#inventory?.EventManager.removeEventListener(Inventory.ADDED, this.#added);
        this.#inventory = null;
        window.clearTimeout(this.#arrivalTimer);
        this.#arrivalTimer = null;
        for (const timer of this.#timers)
            window.clearTimeout(timer);
        this.#timers.clear();
        this.#pending = [];
        this._displayer.textContent = '';
    }
}
