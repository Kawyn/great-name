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

        throw Error;
    }

    callChangedNow() {

        for (const callback of this.#callbacks)
            callback(this.#value);
    }
}