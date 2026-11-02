class JournalWindow extends MenuDialogWindow {
    titleId = 'inventory.read';
    #journal;
    #busy = false;
    #inventory = null;
    #draftItemId = null;

    _bodyTemplate() {
        return `
            <p data-localization-id="journal.hint"></p>
            <p class="journal-ownership"></p>
            <div class="journal-entries"></div>
            <button type="button" class="brass-button journal-strike" data-localization-id="journal.strike"></button>
            <label for="journal-draft" data-localization-id="journal.draft"></label>
            <textarea id="journal-draft" rows="4"></textarea>
            <button type="button" class="brass-button journal-append" data-localization-id="journal.append"></button>
            <p class="journal-error" role="alert" hidden></p>`;
    }

    initialize() {
        if (this._window)
            return;
        super.initialize();
        this._window.querySelector('.journal-append').onclick = () => this.#perform(async () => {
            const draft = this._window.querySelector('#journal-draft');
            const journal = this.#journal;
            const text = draft.value;
            await journal.append(text);
            if (this.#journal === journal && draft.value === text)
                draft.value = '';
        });
        this._window.querySelector('.journal-strike').onmousedown = event => event.preventDefault();
        this._window.querySelector('.journal-strike').onclick = () => this.#perform(async () => {
            const selection = document.getSelection();
            if (!selection || selection.isCollapsed || !selection.rangeCount)
                throw new Error(Game.Instance.LocalizationManager.get('journal.select'));
            const range = selection.getRangeAt(0);
            const paragraphs = [...this._window.querySelectorAll('.journal-entry')];
            const index = paragraphs.findIndex(element => element.contains(range.startContainer) &&
                element.contains(range.endContainer));
            if (index === -1)
                throw new Error(Game.Instance.LocalizationManager.get('journal.select'));
            const prefix = range.cloneRange();
            prefix.selectNodeContents(paragraphs[index]);
            prefix.setEnd(range.startContainer, range.startOffset);
            const start = prefix.toString().length;
            await this.#journal.strike(index, start, start + range.toString().length);
            selection.removeAllRanges();
        });
    }

    show(context) {
        if (!(context?.journal instanceof AlchemistJournal))
            throw new Error('JournalWindow requires a journal item.');
        this.#journal = context.journal;
        if (this.#draftItemId !== this.#journal.serverId) {
            this._window.querySelector('#journal-draft').value = '';
            this.#draftItemId = this.#journal.serverId;
        }
        this.#unsubscribe();
        this.#inventory = Scene.Instance.GetActorByIdentifier('player').GetCompnentByType(Inventory);
        this.#inventory.EventManager.addEventListener(Inventory.CHANGED, this.#onInventory);
        super.show(context);
        GameInterface.localize(this._window.querySelector(`#${this.id}-title`), this.#journal.nameId);
        this.#render();
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
        this.#inventory?.EventManager.removeEventListener(Inventory.CHANGED, this.#onInventory);
        this.#inventory = null;
    }

    #onInventory = () => {
        if (!this.#inventory.items.includes(this.#journal)) {
            this.hide();
            return;
        }
        this.#render();
    };

    async #perform(action) {
        if (this.#busy)
            return;
        this.#busy = true;
        this.#renderControls();
        try {
            await action();
            this._window.querySelector('.journal-error').hidden = true;
            this.#render();
        }
        catch (error) {
            console.error('Journal operation failed:', error);
            const status = this._window.querySelector('.journal-error');
            GameInterface.localize(status, 'journal.error', { message: error.message });
            status.hidden = false;
        }
        finally {
            this.#busy = false;
            this.#renderControls();
        }
    }

    #renderControls() {
        const disabled = this.#busy || !this.#journal.writable;
        this._window.querySelector('.journal-append').disabled = disabled;
        this._window.querySelector('.journal-strike').disabled = disabled;
        this._window.querySelector('#journal-draft').disabled = disabled;
        GameInterface.localize(this._window.querySelector('.journal-ownership'),
            this.#journal.writable ? 'journal.owned' : 'journal.readOnly', { author: this.#journal.author });
    }

    #render() {
        this.#renderControls();
        const list = this._window.querySelector('.journal-entries');
        ItemTextWindow.renderEntries(list, this.#journal.entries);
    }
}
