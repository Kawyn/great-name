class DynamicValue {

    #value;
    #callbacks = [];

    get value() { return this.#value; }
    set value(value) {

        if (this.#value !== value) {

            this.#value = value;

            for (const callback of this.#callbacks)
                callback(value);
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

        throw Error;
    }

    callChangedNow() {

        for (const callback in this.#callbacks)
            callback(value);
    }
}