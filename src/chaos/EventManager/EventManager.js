class EventManager {

    #events = {};

    addEventListener(name, func) {

        if (!this.#events[name])
            this.#events[name] = [];

        this.#events[name].push(func);
    }

    removeEventListener() {

        console.error("ADSDASD");
    }

    riseEvent(name, data) {

        if (!this.#events[name])
            return;

        for (const func of this.#events[name])
            func(name, data);
    }
}