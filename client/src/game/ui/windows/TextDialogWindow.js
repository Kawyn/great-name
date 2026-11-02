class TextDialogWindow extends MenuDialogWindow {
    titleId = 'inventory.read';
    #busy = false;

    _bodyTemplate() {
        return `<p class="text-dialog-message"></p>
            <div class="text-dialog-subject" hidden>
                <strong class="text-dialog-subject-name"></strong>
                <p class="text-dialog-subject-author"></p>
            </div>
            <div class="text-dialog-actions"></div>
            <p class="text-dialog-error" role="alert" hidden></p>`;
    }

    _footerTemplate() { return ''; }

    show(context) {
        if (!context || (typeof context.text !== 'string' && typeof context.textId !== 'string') ||
            (typeof context.title !== 'string' && typeof context.titleId !== 'string') ||
            (context.subject !== undefined && (!context.subject ||
                typeof context.subject.name !== 'string' || typeof context.subject.author !== 'string' ||
                (context.subject.nameId !== undefined && typeof context.subject.nameId !== 'string'))) ||
            !Array.isArray(context.buttons) || !context.buttons.length ||
            !context.buttons.every(button => button &&
                (typeof button.label === 'string' || typeof button.labelId === 'string') &&
                (button.action === undefined || typeof button.action === 'function')))
            throw new Error('Text dialog requires a title, text and labeled buttons with optional actions.');
        super.show(context);
        this.#busy = false;
        this.#setText(this._window.querySelector(`#${this.id}-title`), context.title, context.titleId,
            context.titleParameters);
        this.#setText(this._window.querySelector('.text-dialog-message'), context.text, context.textId,
            context.parameters);
        const subject = this._window.querySelector('.text-dialog-subject');
        subject.hidden = !context.subject;
        if (context.subject) {
            this.#setText(subject.querySelector('.text-dialog-subject-name'), context.subject.name, context.subject.nameId);
            this.#setText(subject.querySelector('.text-dialog-subject-author'), '', 'inventory.author',
                { author: context.subject.author });
        }
        this._window.querySelector('.text-dialog-error').hidden = true;
        const actions = this._window.querySelector('.text-dialog-actions');
        actions.textContent = '';
        for (const definition of context.buttons) {
            const button = document.createElement('button');
            button.setAttribute('type', 'button');
            button.classList.add('brass-button');
            this.#setText(button, definition.label, definition.labelId, definition.parameters);
            button.onclick = () => this.#perform(context, definition);
            actions.appendChild(button);
        }
        actions.querySelector('button').focus?.();
    }

    #setText(element, text, id, parameters = {}) {
        element.removeAttribute(LocalizationManager.ID_ATTRIBUTE_NAME);
        element.removeAttribute(LocalizationManager.PARAMETERS_ATTRIBUTE_NAME);
        if (id)
            GameInterface.localize(element, id, parameters, text);
        else
            element.textContent = text;
    }

    async #perform(context, button) {
        if (this.#busy || this._context !== context)
            return;
        this.#busy = true;
        this.#setBusy(true);
        try {
            await button.action?.();
            if (this._context === context && this.visible) {
                this._window.querySelector('.text-dialog-error').hidden = true;
                if (button.close !== false)
                    this.hide();
            }
        }
        catch (error) {
            console.error('Text dialog action failed:', error);
            if (this._context === context && this.visible) {
                const status = this._window.querySelector('.text-dialog-error');
                GameInterface.localize(status, 'ui.actionError', { message: error.message });
                status.hidden = false;
            }
        }
        finally {
            if (this._context === context) {
                this.#busy = false;
                this.#setBusy(false);
            }
        }
    }

    #setBusy(busy) {
        for (const button of this._window.querySelectorAll('button'))
            button.disabled = busy;
    }
}
