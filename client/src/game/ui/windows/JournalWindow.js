class JournalWindow extends MenuDialogWindow {
    titleId = 'journal.title';
    #journal;

    _bodyTemplate() {
        return `
            <p data-localization-id="journal.hint"></p>
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
        this._window.querySelector('.journal-append').onclick = () => this.#perform(() => {
            const draft = this._window.querySelector('#journal-draft');
            this.#journal.append(draft.value, AlchemistJournal.LOCAL_OWNER_ID);
            draft.value = '';
        });
        this._window.querySelector('.journal-strike').onmousedown = event => event.preventDefault();
        this._window.querySelector('.journal-strike').onclick = () => this.#perform(() => {
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
            this.#journal.strike(index, start, start + range.toString().length, AlchemistJournal.LOCAL_OWNER_ID);
            selection.removeAllRanges();
        });
    }

    show(context) {
        if (!(context?.journal instanceof AlchemistJournal))
            throw new Error('JournalWindow requires a journal item.');
        this.#journal = context.journal;
        super.show(context);
        this.#render();
    }

    #perform(action) {
        try {
            action();
            this._window.querySelector('.journal-error').hidden = true;
            this.#render();
        }
        catch (error) {
            console.error('Journal operation failed:', error);
            const status = this._window.querySelector('.journal-error');
            GameInterface.localize(status, 'journal.error', { message: error.message });
            status.hidden = false;
        }
    }

    #render() {
        const list = this._window.querySelector('.journal-entries');
        list.textContent = '';
        for (const entry of this.#journal.entries) {
            const paragraph = document.createElement('p');
            paragraph.classList.add('journal-entry');
            let offset = 0;
            for (const [start, end] of entry.strikes) {
                const plain = document.createElement('span');
                plain.textContent = entry.text.slice(offset, start);
                const struck = document.createElement('s');
                struck.textContent = entry.text.slice(start, end);
                paragraph.appendChild(plain);
                paragraph.appendChild(struck);
                offset = end;
            }
            const tail = document.createElement('span');
            tail.textContent = entry.text.slice(offset);
            paragraph.appendChild(tail);
            list.appendChild(paragraph);
        }
    }
}
