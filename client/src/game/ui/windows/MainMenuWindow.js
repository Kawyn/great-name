class MainMenuWindow extends WindowBase {

    static PLAY_SELECTOR = '.main-menu-play';
    static CONTROLS_SELECTOR = '.main-menu-controls';
    static SETTINGS_SELECTOR = '.main-menu-settings';
    static INVENTORY_SELECTOR = '.main-menu-inventory';
    static READINESS_SELECTOR = '.main-menu-readiness';
    static TITLE_SELECTOR = '.main-menu-title';

    static CONTINUE_EVENT = 'OnContinue';
    static CLOSE_DIALOG_KEY = 'Escape';

    static READINESS = {
        loading: 'Przygotowywanie sceny…',
        ready: 'Gotowe do wyprawy',
        failed: 'Scena niedostępna'
    };

    /** @type {string} */ #canvasSelector;
    #ready = false;
    #inputBlocked = false;
    #gameDialogOpen = false;
    #switchingDialogs = false;
    #returnDialog = null;

    /**
     * @param {string} name 
     * @param {string} id 
     * @param {boolean} visible 
     * @param {{ canvasSelector?: string }} options 
     */
    constructor(name, id, visible = true, { canvasSelector = 'canvas' } = {}) {

        super(name, id, visible);

        this.#canvasSelector = canvasSelector;
    }

    get ready() { return this.#ready; }

    _template() {

        return `
            <div class="overlay main-menu-overlay">
                <nav class="parchment main-menu-panel" aria-labelledby="main-menu-title">
                    <header class="main-menu-header">
                        <span class="sigil main-menu-sigil" aria-hidden="true">&#9879;</span>
                        <p class="main-menu-kicker" data-localization-id="menu.kicker">Zapiski z poszukiwań</p>
                        <h1 class="main-menu-title" id="main-menu-title" data-localization-id="game.title"></h1>
                        <span class="rule" aria-hidden="true"></span>
                    </header>
                    <div class="menu-actions">
                        <button type="button" class="menu-action main-menu-play" data-localization-id="menu.play" disabled>Graj</button>
                        <button type="button" class="menu-action main-menu-inventory" data-localization-id="menu.inventory" disabled>Ekwipunek</button>
                        <button type="button" class="menu-action main-menu-controls" data-localization-id="menu.controls">Sterowanie</button>
                        <button type="button" class="menu-action main-menu-settings" data-localization-id="menu.settings">Ustawienia</button>
                    </div>
                    <p class="main-menu-readiness" role="status"></p>
                </nav>
            </div>`;
    }

    initialize() {

        if (this._window)
            return;

        super.initialize();

        GameInterface.localize(this._window.querySelector(MainMenuWindow.TITLE_SELECTOR),
            'game.title', {}, document.title || 'Dziennik alchemika');
        this._window.querySelector(MainMenuWindow.PLAY_SELECTOR).onclick = () => this.play();
        this._window.querySelector(MainMenuWindow.CONTROLS_SELECTOR).onclick = () => this.openDialog(ControlsWindow);
        this._window.querySelector(MainMenuWindow.SETTINGS_SELECTOR).onclick = () => this.openDialog(SettingsWindow);
        this._window.querySelector(MainMenuWindow.INVENTORY_SELECTOR).onclick = () => this.openDialog(InventoryWindow);

        this.#setReadiness('loading');

        // Not through InputManager - it is blocked while the menu is open.
        document.addEventListener('keydown', this.#onKeyDown);
        document.addEventListener('pointerlockchange', this.#onPointerLockChange);

        if (this.visible)
            this.#blockInput();
    }

    show(context) {

        if (this.visible)
            return;

        super.show(context);
        this.#blockInput();
    }

    hide() {

        if (!this.visible)
            return;

        this.#closeDialogs();

        super.hide();
        this.#unblockInput();
    }

    setReady() {

        this.#ready = true;
        this._window.querySelector(MainMenuWindow.PLAY_SELECTOR).disabled = false;
        this._window.querySelector(MainMenuWindow.INVENTORY_SELECTOR).disabled = false;
        this.#setReadiness('ready');
    }

    setUnavailable() {

        this.#ready = false;
        this._window.querySelector(MainMenuWindow.PLAY_SELECTOR).disabled = true;
        this._window.querySelector(MainMenuWindow.INVENTORY_SELECTOR).disabled = true;
        this.#setReadiness('failed');
    }

    play() {

        if (!this.#ready)
            return;

        this.hide();
        Scene.Instance.EventManager.riseEvent(MainMenuWindow.CONTINUE_EVENT, null);

        const request = this.#canvas()?.requestPointerLock?.();
        request?.catch?.(error => {

            console.warn('Pointer lock request failed:', error);
            this.show();
        });
    }

    /**
     * @param {Function} type window type opened above the menu
     */
    openDialog(type, context) {

        const dialog = this.manager?.windowByType(type);
        if (!dialog)
            throw new Error('Requested dialog is not registered.');
        this.#closeDialogs();
        this.#returnDialog = null;
        dialog.show(context);
    }

    openInventoryPage(type, context) {
        this.openDialog(type, context);
        this.#returnDialog = InventoryWindow;
    }

    toggleGameInventory() {
        this.#toggleGameDialog(InventoryWindow);
    }

    toggleGameJournal() {
        if (!this.#ready || (this.visible && !this.#dialogs().some(dialog => dialog.visible)))
            return;
        const journal = Scene.Instance.GetActorByIdentifier('player')?.GetCompnentByType(Inventory)?.items
            .find(item => item instanceof AlchemistJournal && item.ownerId === AlchemistJournal.LOCAL_OWNER_ID);
        if (!journal)
            throw new Error('The alchemist has no personal journal in the inventory.');
        this.#toggleGameDialog(JournalWindow, { journal });
    }

    #toggleGameDialog(type, context) {
        if (!this.#ready)
            return;
        const current = this.#dialogs().find(dialog => dialog.visible);
        if (current instanceof type) {
            current.hide();
            return;
        }
        if (current) {
            const returnToInventory = current instanceof InventoryWindow || this.#returnDialog === InventoryWindow;
            this.openDialog(type, context);
            if (type === JournalWindow && returnToInventory)
                this.#returnDialog = InventoryWindow;
            return;
        }
        if (this.visible)
            return;
        this.#gameDialogOpen = true;
        this.#blockInput();
        this.openDialog(type, context);
        document.exitPointerLock?.();
    }

    onDialogClosed() {
        if (this.#switchingDialogs)
            return;
        if (this.#returnDialog) {
            const type = this.#returnDialog;
            this.#returnDialog = null;
            this.manager.windowByType(type).show();
            return;
        }
        if (!this.#gameDialogOpen || this.#switchingDialogs)
            return;
        this.#gameDialogOpen = false;
        this.#unblockInput();
        this.play();
    }

    clear() {

        this.#gameDialogOpen = false;
        this.#returnDialog = null;
        this.#closeDialogs();
        document.removeEventListener('keydown', this.#onKeyDown);
        document.removeEventListener('pointerlockchange', this.#onPointerLockChange);

        if (this.#inputBlocked)
            this.#unblockInput();

        super.clear();
    }

    #dialogs() {

        return (this.manager?.windows ?? []).filter(window => window instanceof MenuDialogWindow);
    }

    #closeDialogs() {
        this.#switchingDialogs = true;
        try {
            for (const dialog of this.#dialogs())
                if (dialog.visible)
                    dialog.hide();
        }
        finally {
            this.#switchingDialogs = false;
        }
    }

    #canvas() {

        return document.querySelector(this.#canvasSelector);
    }

    #setReadiness(state) {

        const readiness = this._window.querySelector(MainMenuWindow.READINESS_SELECTOR);
        GameInterface.localize(readiness, `menu.${state}`, {}, MainMenuWindow.READINESS[state]);
        readiness.setAttribute('data-state', state);
    }

    #blockInput() {

        if (this.#inputBlocked)
            return;

        this.#inputBlocked = true;
        Scene.Instance.InputManager.blockInput();
    }

    #unblockInput() {

        if (!this.#inputBlocked)
            return;

        this.#inputBlocked = false;
        Scene.Instance.InputManager.unblockInput();
    }

    #onKeyDown = (event) => {

        if (event.key !== MainMenuWindow.CLOSE_DIALOG_KEY || event.repeat)
            return;

        const dialog = this.#dialogs().find(window => window.visible);

        if (dialog) {

            event.preventDefault?.();
            dialog.hide();
        }
    };

    #onPointerLockChange = () => {

        if (document.pointerLockElement !== this.#canvas() && !this.#gameDialogOpen)
            this.show();
    };
}