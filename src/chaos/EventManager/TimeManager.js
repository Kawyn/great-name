class TimeManager {

    static DEFAULT_PRIORITY = 100;

    #objectsToRefresh = {};

    #prioritiesCache = [];

    #interval;

    #time;
    #deltaTime = 0;

    start() {

        this.#time = new Date().getTime() / 1000;
        this.#interval = setInterval(() => { this.refresh() }, 1000 / 30);
    }

    addObjectToRefresh(obj, priority = TimeManager.DEFAULT_PRIORITY) {

        if (!this.#objectsToRefresh[priority])
            this.#objectsToRefresh[priority] = [];

        this.#objectsToRefresh[priority].push(obj);

        if (!this.#prioritiesCache.includes(priority)) {

            this.#prioritiesCache.push(priority);
            this.#prioritiesCache.sort((a, b) => b - a);
        }
    }

    removeObjectToRefresh(obj) {

        for (const priority in this.#objectsToRefresh) {

            const index = this.#objectsToRefresh[priority].indexOf(obj);

            if (index !== -1) {

                this.#objectsToRefresh[priority].splice(index, 1);

                if (this.#objectsToRefresh[priority].length === 0) {

                    delete this.#objectsToRefresh[priority];
                    this.#prioritiesCache = this.#prioritiesCache.filter(p => p !== Number(priority));
                }

                break;
            }
        }
    }

    refresh() {

        const currentTime = new Date().getTime();
        this.#deltaTime = (currentTime - this.#time) / 1000;

        this.#time = currentTime;

        for (const priority of this.#prioritiesCache) {

            for (const obj of this.#objectsToRefresh[priority])
                obj.onRefresh(this.#deltaTime);

        }
    }

    stop() {
        clearInterval(this.#interval);
    }
}