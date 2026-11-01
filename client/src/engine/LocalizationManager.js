class LocalizationManager {
    static PATH = './src/game/resources/localization/localization.json';
    static STORAGE_KEY = 'great-name.language';
    static ID_ATTRIBUTE_NAME = 'data-localization-id';
    static PARAMETERS_ATTRIBUTE_NAME = 'data-localization-parameters';
    static PARAMETER_PATTERN = /@(\w+)/g;

    language = new DynamicValue(null);
    #tables = new Map();
    #loading = null;
    get languages() { return [...this.#tables.keys()]; }

    constructor() {
        this.language.addChangeListener(() => {
            document.documentElement.lang = this.language.value;
            this.refresh();
        }, false);
    }

    load() {
        this.#loading ??= fetch(LocalizationManager.PATH).then(async response => {
            if (!response.ok)
                throw new Error(`Cannot load '${LocalizationManager.PATH}' (${response.status}).`);
            this.register(await response.json());
            this.setLanguage(this.#startingLanguage());
        });
        return this.#loading;
    }

    register(rows) {
        if (!Array.isArray(rows) || rows.length < 1 || !Array.isArray(rows[0]) ||
            rows[0][0] !== 'id' || rows[0].length < 2)
            throw new Error('Invalid localization header.');
        const languages = rows[0].slice(1);
        if (!languages.every(language => typeof language === 'string' && /^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) ||
            new Set(languages).size !== languages.length)
            throw new Error('Invalid or duplicate localization languages.');
        const ids = new Set();
        for (const row of rows.slice(1)) {
            if (!Array.isArray(row) || row.length !== languages.length + 1 ||
                typeof row[0] !== 'string' || !row[0] || ids.has(row[0]) ||
                !row.slice(1).every(text => typeof text === 'string'))
                throw new Error('Invalid or duplicate localization entry.');
            ids.add(row[0]);
        }
        for (const language of languages)
            if (!this.#tables.has(language))
                this.#tables.set(language, new Map());
        for (const [id, ...texts] of rows.slice(1))
            languages.forEach((language, index) => this.#tables.get(language).set(id, texts[index]));
    }

    setLanguage(language) {
        if (!this.#tables.has(language)) {
            console.error(`[LOCALIZATION MANAGER] Language '${language}' is not supported.`);
            return false;
        }
        localStorage.setItem(LocalizationManager.STORAGE_KEY, language);
        this.language.value = language;
        return true;
    }

    get(id, parameters = {}, language = this.language.value) {
        const text = this.#tables.get(language)?.get(id);
        if (text === undefined) {
            console.error(`[LOCALIZATION MANAGER] Text '${id}' is missing for '${language}'.`);
            return `!!!${id}!!!`;
        }
        return LocalizationManager.setParameters(text, parameters);
    }

    static setParameter(text, name, value) {
        return LocalizationManager.setParameters(text, { [name]: value });
    }

    static setParameters(text, parameters) {
        return text.replace(LocalizationManager.PARAMETER_PATTERN, (match, name) =>
            Object.hasOwn(parameters, name) ? String(parameters[name]) : match);
    }

    localize(element, id, parameters = {}) {
        element.setAttribute(LocalizationManager.ID_ATTRIBUTE_NAME, id);
        element.setAttribute(LocalizationManager.PARAMETERS_ATTRIBUTE_NAME, JSON.stringify(parameters));
        this.#apply(element);
    }

    unlocalize(element) {
        element.removeAttribute(LocalizationManager.ID_ATTRIBUTE_NAME);
        element.removeAttribute(LocalizationManager.PARAMETERS_ATTRIBUTE_NAME);
        element.textContent = '';
    }

    refresh(root = document) {
        if (root.hasAttribute?.(LocalizationManager.ID_ATTRIBUTE_NAME))
            this.#apply(root);
        for (const element of root.querySelectorAll(`[${LocalizationManager.ID_ATTRIBUTE_NAME}]`))
            this.#apply(element);
    }

    #apply(element) {
        const id = element.getAttribute(LocalizationManager.ID_ATTRIBUTE_NAME);
        const parameters = JSON.parse(element.getAttribute(LocalizationManager.PARAMETERS_ATTRIBUTE_NAME) || '{}');
        if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters))
            throw new Error(`Invalid localization parameters for '${id}'.`);
        element.textContent = this.get(id, parameters);
    }

    #startingLanguage() {
        const saved = localStorage.getItem(LocalizationManager.STORAGE_KEY);
        if (this.#tables.has(saved))
            return saved;
        const browser = navigator.language?.split('-')[0];
        return this.#tables.has(browser) ? browser : this.languages[0];
    }
}
