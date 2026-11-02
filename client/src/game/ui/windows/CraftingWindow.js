class CraftingWindow extends MenuDialogWindow {
    titleId = 'craft.title';
    #inventory = null;
    #selected = [];
    #element = null;
    #result = null;
    #busy = false;
    #playerId = null;
    #tooltips = [];
    #resultTimer = null;
    #choosing = false;
    #revision = 0;

    static #symbol(element) {
        const paths = {
            fire: 'M24 7L5 40h38z',
            air: 'M24 7L5 40h38zM12 28h24',
            earth: 'M24 41L5 8h38zM12 20h24',
            water: 'M24 41L5 8h38z'
        };
        return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="${paths[element]}"/></svg>`;
    }

    _bodyTemplate() {
        return `<div class="craft-sanctum"><div class="craft-elements">
                <svg class="craft-ornaments" viewBox="0 0 100 100" aria-hidden="true">
                    <path d="M3 19V9h10M87 9h10v10M3 81v10h10M87 91h10V81M7 25l2 2-2 2-2-2zM93 25l2 2-2 2-2-2zM7 71l2 2-2 2-2-2zM93 71l2 2-2 2-2-2zM33 3h7M60 3h7M33 97h7M60 97h7"/>
                </svg>
                <span class="craft-axis craft-hot" data-localization-id="craft.hot"></span>
                <span class="craft-axis craft-cold" data-localization-id="craft.cold"></span>
                <span class="craft-axis craft-dry" data-localization-id="craft.dry"></span>
                <span class="craft-axis craft-wet" data-localization-id="craft.wet"></span>
                <button type="button" class="craft-element craft-fire">${CraftingWindow.#symbol('fire')}<span data-localization-id="craft.fire"></span></button>
                <button type="button" class="craft-element craft-air">${CraftingWindow.#symbol('air')}<span data-localization-id="craft.air"></span></button>
                <button type="button" class="craft-element craft-earth">${CraftingWindow.#symbol('earth')}<span data-localization-id="craft.earth"></span></button>
                <button type="button" class="craft-element craft-water">${CraftingWindow.#symbol('water')}<span data-localization-id="craft.water"></span></button>
                <div class="craft-core">
                    <button type="button" class="craft-slot craft-slot-first"></button>
                    <span class="craft-conduit" aria-hidden="true"></span>
                    <button type="button" class="craft-slot craft-slot-second"></button>
                </div>
                <p class="craft-result" role="status" hidden><button type="button" class="craft-result-dismiss"></button></p>
            </div></div>
            <svg class="craft-frame-ornament craft-frame-left" viewBox="0 0 16 200" aria-hidden="true"><path d="M8 0v55m0 90v55M8 62l5 8-5 8-5-8zM8 122l5 8-5 8-5-8zM8 83v34M2 96l6-6 6 6-6 14z"/></svg>
            <svg class="craft-frame-ornament craft-frame-right" viewBox="0 0 16 200" aria-hidden="true"><path d="M8 0v55m0 90v55M8 62l5 8-5 8-5-8zM8 122l5 8-5 8-5-8zM8 83v34M2 96l6-6 6 6-6 14z"/></svg>
            <p class="craft-error" role="alert" hidden></p>`;
    }

    _footerTemplate() {
        return `<footer class="dialog-footer">
            <button type="button" class="brass-button craft-combine" data-localization-id="craft.combine"></button>
            <button type="button" class="brass-button dialog-close" data-localization-id="ui.close"></button>
        </footer>`;
    }

    initialize() {
        if (this._window)
            return;
        super.initialize();
        for (const element of ['fire', 'air', 'earth', 'water'])
            this._window.querySelector(`.craft-${element}`).onclick = () => {
                if (this.#busy)
                    return;
                this.#element = this.#element === element ? null : element;
                if (this.#element)
                    this.#selected = this.#selected.slice(0, 1);
                this.#result = null;
                this.#render();
            };
        this._window.querySelector('.craft-slot-first').onclick = () => this.#choose(0);
        this._window.querySelector('.craft-slot-second').onclick = () => this.#choose(1);
        this._window.querySelector('.craft-combine').onclick = () => this.#combine();
        this._window.querySelector('.craft-result-dismiss').onclick = () => {
            this.#result = null;
            this.#render();
        };
    }

    show(context) {
        this.#unsubscribe();
        if (this.#playerId !== window.GameConnection?.playerId) {
            this.#playerId = window.GameConnection?.playerId;
            this.#selected = [];
            this.#element = null;
            this.#result = null;
        }
        this.#inventory = Scene.Instance.GetActorByIdentifier('player')?.GetCompnentByType(Inventory);
        if (!this.#inventory)
            throw new Error('Crafting requires the player inventory.');
        this.#inventory.EventManager.addEventListener(Inventory.CHANGED, this.#render);
        window.addEventListener('worldcleared', this.#reset);
        super.show(context);
        this.#render();
    }

    hide() {
        if (!this.#choosing)
            this.#reset();
        this.#unsubscribe();
        this.#result = null;
        super.hide();
    }

    clear() {
        this.#reset();
        this.#unsubscribe();
        super.clear();
    }

    #unsubscribe() {
        window.clearTimeout(this.#resultTimer);
        this.#resultTimer = null;
        this.#clearTooltips();
        this.#inventory?.EventManager.removeEventListener(Inventory.CHANGED, this.#render);
        this.#inventory = null;
        window.removeEventListener('worldcleared', this.#reset);
    }

    #reset = () => {
        this.#revision++;
        this.#selected = [];
        this.#element = null;
        this.#result = null;
        if (this._window)
            this._window.querySelector('.craft-error').hidden = true;
        if (this.#inventory)
            this.#render();
    };

    #render = () => {
        this.#clearTooltips();
        const items = this.#inventory.orderedItems.filter(item => item.serverId);
        this.#selected = this.#selected.map(id => items.some(item => item.serverId === id) ? id : null);
        for (const [index, selector] of [[0, '.craft-slot-first'], [1, '.craft-slot-second']]) {
            const slot = this._window.querySelector(selector);
            slot.classList.remove('inventory-item', 'inventory-item-icon', 'inventory-own-journal');
            slot.textContent = '';
            slot.disabled = this.#busy || (index === 1 && !this.#selected[0] && !this.#selected[1] && !this.#element);
            const item = items.find(item => item.serverId === this.#selected[index]);
            if (item) {
                ItemIcon.draw(slot, item);
                this.#tooltips.push(ItemIcon.tooltip(slot, item));
            }
            else if (index === 1 && this.#element) {
                slot.innerHTML = CraftingWindow.#symbol(this.#element);
                slot.setAttribute('aria-label', Game.Instance.LocalizationManager.get(`craft.${this.#element}`));
            }
            else {
                slot.textContent = '+';
                slot.setAttribute('aria-label', Game.Instance.LocalizationManager.get('craft.choose'));
            }
        }
        for (const element of ['fire', 'air', 'earth', 'water']) {
            const button = this._window.querySelector(`.craft-${element}`);
            button.setAttribute('aria-pressed', String(this.#element === element));
            button.disabled = this.#busy;
        }
        const ready = !!this.#selected[0] && !!(this.#element || this.#selected[1]);
        this._window.querySelector('.craft-combine').disabled = this.#busy || !ready;
        this._window.querySelector('.craft-core').setAttribute('data-ready', String(ready));
        const result = this._window.querySelector('.craft-result');
        result.hidden = !this.#result;
        this._window.querySelector('.craft-core').hidden = !!this.#result;
        if (this.#result) {
            GameInterface.localize(result.querySelector('.craft-result-dismiss'), `craft.result.${this.#result}`);
            if (this.#resultTimer === null)
                this.#resultTimer = window.setTimeout(() => {
                    this.#resultTimer = null;
                    this.#result = null;
                    if (this.#inventory)
                        this.#render();
                }, 5000);
        }
        else {
            window.clearTimeout(this.#resultTimer);
            this.#resultTimer = null;
        }
    };

    #clearTooltips() {
        for (const dispose of this.#tooltips)
            dispose();
        this.#tooltips = [];
    }

    #choose(index) {
        if (this.#busy)
            return;
        if (this.#selected[index] || (index === 1 && this.#element)) {
            this.#selected[index] = null;
            if (index === 1)
                this.#element = null;
            this.#result = null;
            this.#render();
            return;
        }
        if (index === 1 && !this.#selected[0])
            return;
        const playerId = this.#playerId;
        this.#choosing = true;
        try {
            this.manager.windowByType(MainMenuWindow).openPage(ItemPickerWindow, {
                excluded: this.#selected.filter((id, position) => id && position !== index),
                select: id => {
                    if (playerId !== window.GameConnection?.playerId)
                        return;
                    this.#selected[index] = id;
                    if (index === 1)
                        this.#element = null;
                    this.#result = null;
                }
            }, CraftingWindow);
        }
        finally {
            this.#choosing = false;
        }
    }

    async #combine() {
        const itemIds = this.#selected.filter(Boolean);
        const element = this.#element;
        if (this.#busy || !(element ? itemIds.length === 1 : itemIds.length === 2))
            return;
        const revision = this.#revision;
        const playerId = this.#playerId;
        const status = this._window.querySelector('.craft-error');
        status.hidden = true;
        this.#busy = true;
        this.#render();
        try {
            const result = await window.GameConnection.request('craft', { itemIds, element });
            if (!result || !['ashes', 'dried', 'scattered', 'lye', 'emeraldTablets', 'preparedTablet', 'unchanged', 'resinBinder', 'hardenedResin', 'speedPotion', 'speedEssence'].includes(result.outcome))
                throw new Error(Game.Instance.LocalizationManager.get('craft.invalidResult'));
            if (revision === this.#revision && playerId === window.GameConnection?.playerId) {
                this.#result = result.outcome;
                this.#selected = [];
                this.#element = null;
            }
        }
        catch (error) {
            console.error('Crafting failed:', error);
            if (revision === this.#revision && playerId === window.GameConnection?.playerId && this.visible) {
                GameInterface.localize(status, 'ui.actionError', { message: error.message });
                status.hidden = false;
            }
        }
        finally {
            this.#busy = false;
            if (this.#inventory)
                this.#render();
        }
    }
}
