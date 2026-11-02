class ControlsWindow extends MenuDialogWindow {

    static CONTROLS = [
        { keys: ['W', 'A', 'S', 'D'], action: 'Ruch względem kamery', id: 'controls.move' },
        { keys: ['Mysz'], action: 'Obrót kamery', id: 'controls.look', keyId: 'key.mouse' },
        { keys: ['Spacja'], action: 'Skok', id: 'controls.jump', keyId: 'key.space' },
        { keys: [InventoryDisplayer.KEY_LABEL], action: 'Ekwipunek', id: 'controls.inventory' },
        { keys: [JournalDisplayer.KEY_LABEL], action: 'Dziennik', id: 'controls.journal' },
        { keys: [CraftingDisplayer.KEY_LABEL], action: 'Przemiany', id: 'controls.crafting' },
        { keys: [PickupDisplayer.KEY_LABEL], action: 'Interakcja', id: 'controls.pickup' },
        { keys: ['Klik'], action: 'Przejęcie kursora w świecie', id: 'controls.capture', keyId: 'key.click' },
        { keys: ['Esc'], action: 'Zwolnienie kursora i powrót do menu', id: 'controls.menu' }
    ];

    title = 'Sterowanie';
    titleId = 'menu.controls';

    _bodyTemplate() {

        return '<dl class="controls-list"></dl>';
    }

    initialize() {

        if (this._window)
            return;

        super.initialize();

        const list = this._window.querySelector('.controls-list');

        for (const control of ControlsWindow.CONTROLS) {

            const keys = document.createElement('dt');

            for (const key of control.keys) {

                const kbd = document.createElement('kbd');
                kbd.textContent = key;
                if (control.keyId)
                    GameInterface.localize(kbd, control.keyId, {}, key);
                keys.appendChild(kbd);
            }

            const action = document.createElement('dd');
            GameInterface.localize(action, control.id, {}, control.action);

            list.appendChild(keys);
            list.appendChild(action);
        }
    }
}