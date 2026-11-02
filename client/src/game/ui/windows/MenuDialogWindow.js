/**
 * Brass-framed parchment dialog opened from the main menu.
 */
class MenuDialogWindow extends WindowBase {

    static CLOSE_SELECTOR = '.dialog-close';

    /** @type {string} */ title = '';
    titleId = '';

    _template() {

        return `
            <div class="overlay dialog-overlay">
                <section class="parchment dialog" role="dialog" aria-modal="true" aria-labelledby="${this.id}-title">
                    <header class="dialog-header">
                        <span class="sigil" aria-hidden="true">&#9670;</span>
                        <h1 id="${this.id}-title"></h1>
                        <span class="sigil" aria-hidden="true">&#9670;</span>
                    </header>
                    <div class="dialog-body">${this._bodyTemplate()}</div>
                    ${this._footerTemplate()}
                </section>
            </div>`;
    }

    /** @returns {string} */
    _bodyTemplate() {

        return '';
    }

    _footerTemplate() {
        return `<footer class="dialog-footer">
            <button type="button" class="brass-button dialog-close" data-localization-id="ui.close">Zamknij</button>
        </footer>`;
    }

    initialize() {

        if (this._window)
            return;

        super.initialize();

        GameInterface.localize(this._window.querySelector(`#${this.id}-title`), this.titleId, {}, this.title);
        const close = this._window.querySelector(MenuDialogWindow.CLOSE_SELECTOR);
        if (close)
            close.onclick = () => this.hide();
    }

    show(context) {

        super.show(context);
        this._window.querySelector(MenuDialogWindow.CLOSE_SELECTOR)?.focus?.();
    }

    hide() {
        const wasVisible = this.visible;
        super.hide();
        if (wasVisible)
            this.manager?.windowByType(MainMenuWindow)?.onDialogClosed();
    }
}