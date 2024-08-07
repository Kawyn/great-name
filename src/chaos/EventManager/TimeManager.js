class TimeManager {

    #objectsToRefresh = [];
    #interval;

    #time;
    #deltaTime = 0;

    start() {

        this.#time = new Date().getTime() / 1000;

        this.#interval = setInterval(() => { this.refresh() });
    }

    addObjectToRefresh(obj) {

        this.#objectsToRefresh.push(obj);
    }

    removeObjectToRefresh() {

        console.error("ADSDASD");
    }

    refresh() {
        const currentTime = new Date().getTime();

        this.#deltaTime = (currentTime - this.#time) / 1000;
        this.#time = currentTime;

        for (const obj of this.#objectsToRefresh)
            obj.onRefresh(this.#deltaTime);
    }

    stop() {

    }
}