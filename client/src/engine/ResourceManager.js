class ResourceManager {
    static MANIFEST_PATH = './src/game/resources/data/DataContainers.json';
    #resources = new Map();
    #loading = null;

    load() {
        this.#loading ??= this.#load();
        return this.#loading;
    }

    async #load() {
        const manifestUrl = new URL(ResourceManager.MANIFEST_PATH, document.baseURI);
        const files = await ResourceManager.#fetchJson(manifestUrl);
        if (files && typeof files === 'object' && !Array.isArray(files)) {
            this.register(files);
            return;
        }
        if (!Array.isArray(files) || !files.every(file => typeof file === 'string' && file.length > 0))
            throw new Error('Invalid resource manifest: expected resource definitions or an array of file paths.');
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
        const icons = new Set([...this.#resources.values()]
            .filter(resource => resource.type === 'inventoryItem' && !Object.hasOwn(resources, resource.id))
            .map(resource => resource.icon));
        const serverTypes = new Set([...this.#resources.values()]
            .filter(resource => resource.type === 'inventoryItem' && !Object.hasOwn(resources, resource.id))
            .map(resource => resource.serverType));
        for (const [, data] of entries)
            if (data.type === 'inventoryItem') {
                if (icons.has(data.icon))
                    throw new Error('Inventory resources require unique icons.');
                if (serverTypes.has(data.serverType))
                    throw new Error('Inventory resources require unique server types.');
                icons.add(data.icon);
                serverTypes.add(data.serverType);
            }
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
        const icons = new Set();
        const serverTypes = new Set();
        for (const [id, data] of Object.entries(resources)) {
            if (data.type !== 'inventoryItem')
                continue;
            const path = value => typeof value === 'string' && value.trim().length > 0 &&
                /^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/.test(value);
            if (!/^item\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) ||
                typeof data.serverType !== 'string' || !data.serverType || serverTypes.has(data.serverType) ||
                typeof data.iconColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(data.iconColor) ||
                !['notes', 'items'].includes(data.category) ||
                typeof data.nameId !== 'string' || !data.nameId ||
                typeof data.descriptionId !== 'string' || !data.descriptionId ||
                !path(data.icon) || icons.has(data.icon) ||
                (data.ownIcon !== undefined && !path(data.ownIcon)) ||
                (data.ownDescriptionId !== undefined && (typeof data.ownDescriptionId !== 'string' || !data.ownDescriptionId)) ||
                (data.authorId !== undefined && (typeof data.authorId !== 'string' || !data.authorId)))
                throw new Error('Invalid inventory resource: localized name, description, category and unique SVG path are required.');
            icons.add(data.icon);
            serverTypes.add(data.serverType);
        }
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
