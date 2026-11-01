class InputManager {

    #count = 0;
    #actions = new Map();
    get blocked() { return this.#count; }
    keys = {};
    axes = {};
    constructor(timeManager) {

        this.axes['horizontal'] = new Axis('D', 'A');
        this.axes['vertical'] = new Axis('W', 'S');

        this.axes['mouse_x'] = new Axis();
        this.axes['mouse_y'] = new Axis();
        timeManager.addObjectToRefresh(this, 50);
        document.addEventListener('mousemove', data => {

            if (this.#count !== 0)
                return;

            this.axes['mouse_x'].value = data.movementX * 2;
            this.axes['mouse_y'].value = data.movementY * 2;

        });
        document.addEventListener('keydown', data => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(data.target?.tagName) || data.target?.isContentEditable)
                return;
            const action = [...this.#actions.values()].find(action => action.code === data.code);
            if (this.#count !== 0) {
                if (action?.allowWhenBlocked && !data.repeat && !data.ctrlKey && !data.altKey && !data.metaKey) {
                    data.preventDefault?.();
                    action.handler();
                }
                return;
            }

            if (this.keys[data.key.toUpperCase()] == 1)
                return;

            this.keys[data.key.toUpperCase()] = 1;

            for (let key in this.axes) {
                if (this.axes[key].positiveKey == data.key.toUpperCase())
                    this.axes[key].value++;

                if (this.axes[key].negaticeKey == data.key.toUpperCase())
                    this.axes[key].value--;
            }
            if (action && !data.repeat && !data.ctrlKey && !data.altKey && !data.metaKey) {
                data.preventDefault?.();
                action.handler();
            }
        });

        document.addEventListener('keyup', data => {

            if (this.#count !== 0)
                return;

            const keyName = data.key.toUpperCase();
            if (!this.keys[keyName])
                return;
            this.keys[keyName] = 0;

            for (let key in this.axes) {
                if (this.axes[key].positiveKey == data.key.toUpperCase())
                    this.axes[key].value--;

                if (this.axes[key].negaticeKey == data.key.toUpperCase())
                    this.axes[key].value++;
            }
        });
    }

    blockInput() {

        this.#count++;

        if (this.#count === 1) {
            this.keys = {};

            this.axes['mouse_x'].value = 0;
            this.axes['mouse_y'].value = 0;

            for (let key in this.axes)
                this.axes[key].value = 0;
        }
    }

    unblockInput() {
        if (this.#count > 0)
            this.#count--;

    }

    bindAction(name, code, label, handler, allowWhenBlocked = false) {
        if (!name || !code || !label || typeof handler !== 'function' || this.#actions.has(name))
            throw new Error('Input actions require a unique name, key code, label and handler.');
        this.#actions.set(name, { code, label, handler, allowWhenBlocked });
    }

    unbindAction(name) {
        this.#actions.delete(name);
    }

    getActionLabel(name) {
        const action = this.#actions.get(name);
        if (!action)
            throw new Error(`Input action '${name}' is not registered.`);
        return action.label;
    }

    triggerAction(name) {
        const action = this.#actions.get(name);
        if (!action)
            throw new Error(`Input action '${name}' is not registered.`);
        if (this.#count === 0 || action.allowWhenBlocked)
            action.handler();
    }
    GetAxis(name) {
        return this.axes[name];
    }

    onRefresh() {
        this.axes['mouse_x'].value = 0;
        this.axes['mouse_y'].value = 0;
    }
}

class Axis {

    positiveKey;
    negaticeKey;

    value = 0;
    constructor(positiveKey, negaticeKey) {
        this.positiveKey = positiveKey;
        this.negaticeKey = negaticeKey;
    }
}