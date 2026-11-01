/**
 * Versioned LOCAL client snapshots: variables and explicitly opted-in prefab actors.
 * LocalObjects must be a dedicated ObjectManager, never a Scene/Game manager.
 * Factories return fresh, unregistered actors without side effects; codecs persist
 * component state, not services, callbacks or authoritative multiplayer state.
 * Initialize LocalObjects before restoreRequested; Game owns that lifecycle.
 */
class SaveManager {
    static KEY = 'great-name.save';
    static LOAD_REQUEST = 'great-name.load-request';
    #prefabs = new Map();
    #codecs = new Map();
    variables = {};

    constructor(localObjects = new ObjectManager()) {
        Object.defineProperty(this, 'LocalObjects', { value: localObjects, enumerable: true });
        // Game.Instance constructs this while Game itself is still in its TDZ.
        // Ownership checks run at every operation, after singleton construction.
        this.#assertLocalManager(false);
        const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
        this.registerComponent('Transform', {
            write: component => ({
                position: component.position.value,
                rotation: component.rotation.value,
                scale: component.scale.value,
            }),
            valid: state => vector(state.position) && vector(state.rotation) && vector(state.scale),
            read: (component, state) => {
                for (const field of ['position', 'rotation', 'scale'])
                    component[field].value = [...state[field]];
            },
        });
    }

    /** Codec: write(component), valid(state), read(component, state). */
    registerComponent(type, codec) {
        if (typeof type !== 'string' || !type || !codec ||
            ['write', 'valid', 'read'].some(method => typeof codec[method] !== 'function'))
            throw new TypeError('Invalid save component codec.');
        this.#assertLocalType(type);
        this.#codecs.set(type, codec);
    }

    /** Factory receives the saved identifier and JSON-compatible prefab descriptor. */
    registerPrefab(type, factory) {
        if (typeof type !== 'string' || !type || typeof factory !== 'function')
            throw new TypeError('Invalid save prefab registration.');
        this.#prefabs.set(type, factory);
    }

    /** Explicit opt-in; this actor must NOT also belong to a scene or game manager. */
    registerObject(actor) {
        this.#assertLocalManager();
        this.#assertLocalActor(actor);
        if (this.LocalObjects.getByIdentifier(actor.identifier))
            throw new Error(`Duplicate local actor '${actor.identifier}'.`);
        this.LocalObjects.push(actor);
        return actor;
    }

    #assertLocalType(type) {
        if (['ServerMovement', 'RemotePlayers', 'Terrain'].includes(type))
            throw new Error(`Authoritative component '${type}' cannot be saved.`);
    }

    #assertLocalId(id) {
        if (typeof id !== 'string' || !id)
            throw new Error('Invalid local actor identifier.');
        if (/^(player|avatar|terrain)(?:$|[_-])/i.test(id))
            throw new Error(`Authoritative actor '${id}' cannot be saved.`);
    }

    #sharedManagers() {
        return [
            typeof Scene === 'undefined' ? null : Scene.Instance,
            typeof Scene === 'undefined' ? null : Scene.Instance?.ObjectManager,
            typeof Game === 'undefined' ? null : Game.Instance?.ObjectManager,
        ].filter(Boolean);
    }

    #assertLocalManager(checkShared = true) {
        const manager = this.LocalObjects;
        if (!manager || !Array.isArray(manager.actors) ||
            ['getByIdentifier', 'push', 'remove'].some(method => typeof manager[method] !== 'function') ||
            (checkShared && this.#sharedManagers().includes(manager)))
            throw new Error('SaveManager requires a dedicated local ObjectManager.');
    }

    #assertLocalActor(actor) {
        this.#assertLocalId(actor?.identifier);
        if (!Array.isArray(actor.components))
            throw new Error(`Actor '${actor.identifier}' requires a components getter.`);
        for (const component of actor.components)
            this.#assertLocalType(component.constructor.name);
        if (actor.objectManager && actor.objectManager !== this.LocalObjects)
            throw new Error(`Actor '${actor.identifier}' belongs to another object manager.`);
        if (this.#sharedManagers().some(manager => manager.actors?.includes(actor)))
            throw new Error(`Actor '${actor.identifier}' belongs to a shared world manager.`);
    }

    #clone(value) {
        const ancestors = new Set();
        const check = (item, key) => {
            if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
            if (typeof item === 'number' && Number.isFinite(item)) return;
            if (typeof item !== 'object')
                throw new TypeError(`Save value '${key}' is not JSON-compatible.`);
            if (ancestors.has(item)) throw new TypeError('Cyclic save values are not JSON-compatible.');
            if (!Array.isArray(item) && Object.getPrototypeOf(item) !== null &&
                Object.getPrototypeOf(item)?.constructor?.name !== 'Object')
                throw new TypeError(`Save value '${key}' must be a plain object or array.`);
            if (Object.getOwnPropertySymbols(item).length || typeof item.toJSON === 'function')
                throw new TypeError(`Save value '${key}' is not JSON-compatible.`);
            ancestors.add(item);
            if (Array.isArray(item)) {
                if (Object.keys(item).length !== item.length)
                    throw new TypeError(`Save array '${key}' must not have holes or extra properties.`);
                for (let index = 0; index < item.length; index++) check(item[index], String(index));
            } else {
                for (const [name, child] of Object.entries(item)) check(child, name);
            }
            ancestors.delete(item);
        };
        check(value, '');
        return JSON.parse(JSON.stringify(value));
    }

    snapshot() {
        this.#assertLocalManager();
        const data = this.#clone({
            version: 1, location: 'client', variables: this.variables,
            objects: this.LocalObjects.actors.map(actor => {
                this.#assertLocalActor(actor);
                if (actor.parent && !this.LocalObjects.actors.includes(actor.parent))
                    throw new Error(`Parent of '${actor.identifier}' is not an opted-in local actor.`);
                if (!actor.prefab || !this.#prefabs.has(actor.prefab.type))
                    throw new Error(`No save prefab registered for '${actor.identifier}'.`);
                return {
                    id: actor.identifier, prefab: actor.prefab, active: actor.active,
                    parent: actor.parent?.identifier ?? null,
                    components: actor.components.map(component => {
                        const type = component.constructor.name;
                        const codec = this.#codecs.get(type);
                        if (!codec) throw new Error(`No save codec registered for '${type}'.`);
                        return { type, state: codec.write(component) };
                    }),
                };
            }),
        });
        this.#prepare(data);
        return data;
    }

    // Prepare every record (including factory results) before any lifecycle mutation.
    #prepare(data) {
        this.#assertLocalManager();
        if (!data || data.version !== 1 || data.location !== 'client' ||
            !data.variables || Array.isArray(data.variables) || typeof data.variables !== 'object' ||
            !Array.isArray(data.objects) || 'game' in data || 'scene' in data)
            throw new Error('Unsupported or invalid local save snapshot.');
        const currentIds = new Set();
        for (const actor of this.LocalObjects.actors) {
            this.#assertLocalActor(actor);
            if (currentIds.has(actor.identifier)) throw new Error('Duplicate local actor identifiers.');
            currentIds.add(actor.identifier);
        }
        const records = new Map();
        for (const saved of data.objects) {
            this.#assertLocalId(saved?.id);
            if (records.has(saved.id) || typeof saved.active !== 'boolean' ||
                (saved.parent !== null && typeof saved.parent !== 'string') ||
                !saved.prefab || !this.#prefabs.has(saved.prefab.type) || !Array.isArray(saved.components))
                throw new Error('Invalid actor in save snapshot.');
            records.set(saved.id, saved);
            for (const component of saved.components) {
                if (!component || typeof component.type !== 'string')
                    throw new Error(`Invalid component on '${saved.id}'.`);
                this.#assertLocalType(component.type);
                const codec = this.#codecs.get(component.type);
                if (!codec || !component.state || typeof component.state !== 'object' ||
                    !codec.valid(component.state))
                    throw new Error(`Invalid component state '${component.type}' on '${saved.id}'.`);
            }
        }
        const ordered = [];
        const visited = new Set();
        const visiting = new Set();
        const visit = saved => {
            if (visited.has(saved.id)) return;
            if (visiting.has(saved.id)) throw new Error('Cyclic actor parents in save snapshot.');
            visiting.add(saved.id);
            if (saved.parent !== null) {
                const parent = records.get(saved.parent);
                if (!parent) throw new Error(`Missing parent of '${saved.id}'.`);
                visit(parent);
            }
            visiting.delete(saved.id);
            visited.add(saved.id);
            ordered.push(saved);
        };
        for (const saved of records.values()) visit(saved);
        for (const actor of this.LocalObjects.actors)
            if (actor.prefab?.required && !records.has(actor.identifier))
                throw new Error(`Missing required actor '${actor.identifier}'.`);
        return ordered.map(saved => {
            const existing = this.LocalObjects.getByIdentifier(saved.id);
            const actor = existing ?? this.#prefabs.get(saved.prefab.type)(saved.id, this.#clone(saved.prefab));
            this.#assertLocalActor(actor);
            if (!existing && actor.objectManager)
                throw new Error(`Prefab factory for '${saved.id}' must return an unregistered actor.`);
            if (actor.identifier !== saved.id || actor.components.length !== saved.components.length ||
                JSON.stringify(this.#clone(actor.prefab)) !== JSON.stringify(saved.prefab))
                throw new Error(`Prefab mismatch for '${saved.id}'.`);
            for (const [index, component] of saved.components.entries())
                if (actor.components[index].constructor.name !== component.type)
                    throw new Error(`Prefab component mismatch on '${saved.id}'.`);
            return { saved, actor, existing: Boolean(existing) };
        });
    }

    validate(data) {
        const clean = this.#clone(data);
        this.#prepare(clean);
        return clean;
    }

    save() {
        localStorage.setItem(SaveManager.KEY, JSON.stringify(this.snapshot()));
    }

    #storedSnapshot() {
        const stored = localStorage.getItem(SaveManager.KEY);
        if (!stored) throw new Error('No local save snapshot exists.');
        return this.#clone(JSON.parse(stored));
    }

    load() {
        this.#prepare(this.#storedSnapshot());
        sessionStorage.setItem(SaveManager.LOAD_REQUEST, 'true');
        location.reload();
    }

    restoreRequested() {
        if (sessionStorage.getItem(SaveManager.LOAD_REQUEST) !== 'true') return false;
        const data = this.#storedSnapshot();
        const plan = this.#prepare(data);
        const actors = new Map(plan.map(record => [record.saved.id, record.actor]));
        // Detach first: the old hierarchy may be the reverse of the saved one.
        for (const actor of this.LocalObjects.actors) actor.parent = null;
        for (const actor of [...this.LocalObjects.actors])
            if (!actors.has(actor.identifier)) this.LocalObjects.remove(actor);
        for (const { saved, actor, existing } of plan) {
            const changedActive = actor.active !== saved.active;
            if (existing && changedActive && actor.active && this.LocalObjects.initialized)
                actor.onDisable();
            actor.active = saved.active;
            actor.parent = saved.parent === null ? null : actors.get(saved.parent);
            for (const [index, component] of saved.components.entries())
                this.#codecs.get(component.type).read(actor.components[index], this.#clone(component.state));
            if (!existing) this.LocalObjects.push(actor);
            else if (changedActive && actor.active && this.LocalObjects.initialized) actor.onEnable();
        }
        this.variables = data.variables;
        sessionStorage.removeItem(SaveManager.LOAD_REQUEST);
        return true;
    }
}
