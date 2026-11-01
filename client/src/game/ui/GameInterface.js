class GameInterface {

    static CANVAS_SELECTOR = '#xxx';
    static STATUS_ID = 'world-status';

    /** @type {UserInterface?} */ static #instance = null;

    /** @returns {UserInterface} */
    static get Instance() {

        return GameInterface.#instance ??= GameInterface.create();
    }

    /** @returns {UserInterface} */
    static create() {

        return new UserInterface({
            windows: [
                new MainMenuWindow('MainMenuWindow', 'main-menu', true, { canvasSelector: GameInterface.CANVAS_SELECTOR }),
                new ControlsWindow('ControlsWindow', 'controls'),
                new SettingsWindow('SettingsWindow', 'settings'),
                new InventoryWindow('InventoryWindow', 'inventory'),
                new ItemTextWindow('ItemTextWindow', 'item-text'),
                new JournalWindow('JournalWindow', 'journal')
            ],
            displayers: [
                new ScoreStateDisplayer('ScoreStateDisplayer', 'score', true, 'player'),
                new InventoryDisplayer('InventoryDisplayer', 'inventory-shortcut', true),
                new JournalDisplayer('JournalDisplayer', 'journal-shortcut', true)
            ]
        });
    }

    static localize(element, id, parameters = {}, fallback = '') {
        const localization = Game.Instance.LocalizationManager;
        if (localization.language.value !== null)
            localization.localize(element, id, parameters);
        else {
            element.setAttribute(LocalizationManager.ID_ATTRIBUTE_NAME, id);
            element.setAttribute(LocalizationManager.PARAMETERS_ATTRIBUTE_NAME, JSON.stringify(parameters));
            if (fallback)
                element.textContent = fallback;
        }
    }

    /**
     * Builds the menus immediately and starts the scene once it is ready.
     * @param {Promise<void>} sceneReady 
     * @param {UserInterface} userInterface 
     */
    static boot(sceneReady, userInterface = GameInterface.Instance) {

        userInterface.initializeWindows();
        const menu = userInterface.WindowManager.windowByType(MainMenuWindow);

        return Promise.all([Game.Instance.initialize(), sceneReady]).then(() => {

            Scene.Instance.Start();
            Game.Instance.SaveManager.restoreRequested();
            menu.setReady();
        }).catch(error => {

            console.error('Scene initialization failed:', error);
            menu.setUnavailable();

            const status = document.getElementById(GameInterface.STATUS_ID);

            if (status) {

                status.setAttribute('data-scene-error', 'true');
                status.hidden = false;
                GameInterface.localize(status, 'status.sceneError', { message: error.message },
                    'Blad inicjalizacji sceny: ' + error.message);
            }
        });
    }
}