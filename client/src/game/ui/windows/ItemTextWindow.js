class ItemTextWindow extends MenuDialogWindow {
    titleId = 'inventory.read';

    _bodyTemplate() {
        return '<div class="item-text"></div>';
    }

    show(context) {
        if (!(context?.journal instanceof AlchemistJournal) && (!context?.titleId || !context.textId))
            throw new Error('ItemTextWindow requires title and text localization IDs.');
        super.show(context);
        this._window.classList.remove('emerald-theme');
        if (context.theme === 'emerald')
            this._window.classList.add('emerald-theme');
        const body = this._window.querySelector('.item-text');
        body.removeAttribute(LocalizationManager.ID_ATTRIBUTE_NAME);
        body.removeAttribute(LocalizationManager.PARAMETERS_ATTRIBUTE_NAME);
        body.textContent = '';
        const writing = context.journal instanceof AlchemistJournal ? context.journal :
            context.tablet instanceof EmeraldTablets && context.tablet.entries !== null ? context.tablet : null;
        if (writing) {
            GameInterface.localize(this._window.querySelector(`#${this.id}-title`), writing.nameId);
            const author = document.createElement('p');
            author.classList.add('journal-reader-author');
            GameInterface.localize(author, 'inventory.author', { author: writing.author });
            body.appendChild(author);
            const entries = document.createElement('div');
            ItemTextWindow.renderEntries(entries, writing.entries);
            body.appendChild(entries);
        }
        else {
            GameInterface.localize(this._window.querySelector(`#${this.id}-title`), context.titleId);
            GameInterface.localize(body, context.textId);
        }
    }

    static renderEntries(list, entries) {
        list.textContent = '';
        for (const entry of entries) {
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
