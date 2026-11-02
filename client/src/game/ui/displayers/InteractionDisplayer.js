class InteractionDisplayer extends DisplayerBase {
    #busy = false;

    get target() {
        throw new Error('An interaction displayer requires a target provider.');
    }

    get labelId() { return this.constructor.LABEL_ID; }

    interact(target) {
        throw new Error('An interaction displayer requires an action.');
    }

    _template() {
        return `<div class="parchment interaction-prompt">
            <span class="interaction-label"></span>
            <kbd class="input-icon"></kbd>
            <p class="interaction-error" role="alert" hidden></p>
        </div>`;
    }

    enable() {
        const type = this.constructor;
        const input = Scene.Instance.InputManager;
        input.bindAction(type.ACTION, type.KEY_CODE, type.KEY_LABEL, this.#interact, false,
            () => Boolean(this.target));
        this._displayer.querySelector('.input-icon').textContent = input.getActionLabel(type.ACTION);
        this.refresh();
    }

    #interact = async () => {
        const target = this.target;
        if (!target || this.#busy)
            return;
        this.#busy = true;
        const status = this._displayer.querySelector('.interaction-error');
        try {
            await this.interact(target);
            status.hidden = true;
        }
        catch (error) {
            console.error('Interaction failed:', error);
            status.textContent = error.message;
            status.hidden = false;
        }
        finally {
            this.#busy = false;
        }
    };

    refresh = () => {
        GameInterface.localize(this._displayer.querySelector('.interaction-label'), this.labelId);
        if (this.target)
            this.show();
        else
            this.hide();
    };

    disable() {
        Scene.Instance.InputManager.unbindAction(this.constructor.ACTION);
        this.hide();
    }
}
