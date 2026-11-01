class EventManager {

    #events = {};

    addEventListener(name, func) {

        if (!this.#events[name])
            this.#events[name] = [];

        this.#events[name].push(func);
    }

    removeEventListener(name, func) {
        const listeners = this.#events[name];
        const index = listeners?.indexOf(func) ?? -1;
        if (index !== -1)
            listeners.splice(index, 1);
    }

    riseEvent(name, data) {

        if (!this.#events[name])
            return;

        for (const func of [...this.#events[name]])
            func(name, data);
    }
}