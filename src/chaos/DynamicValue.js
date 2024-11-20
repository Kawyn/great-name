class DynamicValue {

    #value;
    #callbacks = [];

    get value() { return this.#value; }
    set value(value) {

        if (this.#value !== value) {

            this.#value = value;
            this.callChangedNow();
        }
    }

    constructor(value) {

        this.value = value;
    }

    addChangeListener(callback, callInstantly = true) {

        this.#callbacks.push(callback);

        if (callInstantly)
            callback(this.value);
    }

    removeChangeListener(func) {

        const index = this.#callbacks.indexOf(func);

        if (index === -1) {

            console.error(`Trying to remove function which never was added? (func: ${func})`);
            return;
        }

        this.#callbacks.splice(index, 1);
    }

    callChangedNow() {

        for (const callback of this.#callbacks)
            callback(this.#value);
    }
}