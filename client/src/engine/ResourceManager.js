class ResourceManager {
    static MANIFEST_PATH = './src/game/resources/data/resources.json';
    #resources = new Map();
    #loading = null;

    load() {
        this.#loading ??= this.#load();
        return this.#loading;
    }

    async #load() {
        const manifestUrl = new URL(ResourceManager.MANIFEST_PATH, document.baseURI);
        const files = await ResourceManager.#fetchJson(manifestUrl);
        if (!Array.isArray(files) || !files.every(file => typeof file === 'string' && file.length > 0))
            throw new Error('Invalid resource manifest: expected an array of file paths.');
        const contents = await Promise.all(files.map(file => ResourceManager.#fetchJson(new URL(file, manifestUrl))));
        const combined = {};
        for (const content of contents) {
            ResourceManager.#validate(content);
            for (const [id, data] of Object.entries(content)) {
                if (Object.hasOwn(combined, id))
                    throw new Error(`Duplicate resource '${id}' in manifest.`);
                Object.defineProperty(combined, id, { value: data, enumerable: true });
            }
        }
        this.register(combined);
    }

    register(resources) {
        ResourceManager.#validate(resources);
        const entries = Object.entries(resources).map(([id, data]) =>
            [id, ResourceManager.#deepFreeze(structuredClone({ ...data, id }))]);
        for (const [id, data] of entries) {
            if (this.has(id))
                console.warn(`[RESOURCE MANAGER] Resource '${id}' is registered again - overriding.`);
            this.#resources.set(id, data);
        }
    }

    get(id) {
        if (!this.has(id)) {
            console.error(`[RESOURCE MANAGER] Resource '${id}' does not exist.`);
            return null;
        }
        return this.#resources.get(id);
    }

    has(id) { return this.#resources.has(id); }
    getAllByType(type) { return [...this.#resources.values()].filter(resource => resource.type === type); }

    static #validate(resources) {
        if (!resources || typeof resources !== 'object' || Array.isArray(resources) ||
            !Object.entries(resources).every(([id, data]) => id.length > 0 && data &&
                typeof data === 'object' && !Array.isArray(data) &&
                typeof data.type === 'string' && data.type.length > 0))
            throw new Error('Invalid resources: each resource requires an ID and type.');
    }

    static async #fetchJson(url) {
        const response = await fetch(url);
        if (!response.ok)
            throw new Error(`Cannot load '${url}' (${response.status}).`);
        return response.json();
    }

    static #deepFreeze(object, seen = new WeakSet()) {
        if (seen.has(object))
            return object;
        seen.add(object);
        for (const value of Object.values(object))
            if (value && typeof value === 'object')
                ResourceManager.#deepFreeze(value, seen);
        return Object.freeze(object);
    }
}
