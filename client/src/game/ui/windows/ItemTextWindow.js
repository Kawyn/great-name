class ItemTextWindow extends MenuDialogWindow {
    titleId = 'inventory.read';

    _bodyTemplate() {
        return '<p class="item-text"></p>';
    }

    show(context) {
        if (!context?.titleId || !context.textId)
            throw new Error('ItemTextWindow requires title and text localization IDs.');
        super.show(context);
        this._window.classList.remove('emerald-theme');
        if (context.theme === 'emerald')
            this._window.classList.add('emerald-theme');
        GameInterface.localize(this._window.querySelector(`#${this.id}-title`), context.titleId);
        GameInterface.localize(this._window.querySelector('.item-text'), context.textId);
    }
}
