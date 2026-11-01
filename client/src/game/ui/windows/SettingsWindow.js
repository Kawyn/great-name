class SettingsWindow extends MenuDialogWindow {

    static SENSITIVITY_SELECTOR = '#settings-sensitivity';
    static SENSITIVITY_VALUE_SELECTOR = '#settings-sensitivity-value';
    static RENDER_DISTANCE_SELECTOR = '#settings-render-distance';
    static RENDER_DISTANCE_VALUE_SELECTOR = '#settings-render-distance-value';

    title = 'Ustawienia';
    titleId = 'menu.settings';

    /** @type {HTMLInputElement} */ #sensitivity;
    /** @type {HTMLElement} */ #sensitivityValue;
    /** @type {HTMLInputElement} */ #renderDistance;
    /** @type {HTMLElement} */ #renderDistanceValue;

    _bodyTemplate() {

        return `
            <label class="setting-row" for="settings-sensitivity">
                <span class="setting-name" data-localization-id="settings.sensitivity">Czułość myszy</span>
                <input type="range" min="50" max="250" value="100" step="10" id="settings-sensitivity">
                <output class="setting-value" id="settings-sensitivity-value">100%</output>
            </label>
            <label class="setting-row" for="settings-render-distance">
                <span class="setting-name" data-localization-id="settings.distance">Odległość rysowania</span>
                <input type="range" min="3" max="10" value="6" step="1" id="settings-render-distance" disabled>
                <output class="setting-value" id="settings-render-distance-value">6 (serwer)</output>
            </label>
            <label class="setting-row" for="settings-language">
                <span class="setting-name" data-localization-id="settings.language">Język</span>
                <select id="settings-language" aria-label="Language">
                    <option value="pl">Polski</option>
                    <option value="en">English</option>
                </select>
            </label>
            <p class="dialog-note" data-localization-id="settings.cookies">Ustawienia korzystają z cookies.</p>`;
    }

    initialize() {

        if (this._window)
            return;

        super.initialize();

        this.#sensitivity = this._window.querySelector(SettingsWindow.SENSITIVITY_SELECTOR);
        this.#sensitivityValue = this._window.querySelector(SettingsWindow.SENSITIVITY_VALUE_SELECTOR);
        this.#renderDistance = this._window.querySelector(SettingsWindow.RENDER_DISTANCE_SELECTOR);
        this.#renderDistanceValue = this._window.querySelector(SettingsWindow.RENDER_DISTANCE_VALUE_SELECTOR);

        this.#sensitivity.addEventListener('input', this.#displaySensitivity);
        this.#sensitivity.addEventListener('change', this.#saveSensitivity);
        this._window.querySelector('#settings-language').addEventListener('change', event => {
            Game.Instance.LocalizationManager.setLanguage(event.target.value);
        });
    }

    show(context) {

        super.show(context);
        this.refresh();
    }

    /** Loads persisted values; like the previous UI, opening settings stores the shown sensitivity. */
    refresh() {

        const sensitivity = Settings.GetValueAsString(Settings.MOUSE_SENSITIVITY);

        if (sensitivity !== undefined)
            this.#sensitivity.value = sensitivity;

        this.#saveSensitivity();
        GameInterface.localize(this.#renderDistanceValue, 'settings.server',
            { distance: this.#renderDistance.value }, `${this.#renderDistance.value} (serwer)`);
        this._window.querySelector('#settings-language').value = Game.Instance.LocalizationManager.language.value ?? 'pl';
    }

    #displaySensitivity = () => {

        this.#sensitivityValue.textContent = `${this.#sensitivity.value}%`;
    };

    #saveSensitivity = () => {

        this.#displaySensitivity();
        Settings.SetValue(Settings.MOUSE_SENSITIVITY, this.#sensitivity.value);
    };
}