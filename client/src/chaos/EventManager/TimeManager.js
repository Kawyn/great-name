class TimeManager {

    static DEFAULT_PRIORITY = 100;

    #objectsToRefresh = {};

    #prioritiesCache = [];

    #frame = null;
    #running = false;

    #time;
    #deltaTime = 0;

    start() {
        if (this.#running)
            return;
        this.#running = true;
        this.#time = performance.now();
        this.#frame = requestAnimationFrame(this.onFrame);
    }

    onFrame = () => {
        this.#frame = null;
        if (!this.#running)
            return;
        this.refresh();
        if (this.#running)
            this.#frame = requestAnimationFrame(this.onFrame);
    };

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

        const currentTime = performance.now();
        this.#deltaTime = Math.min(0.1, Math.max(0, (currentTime - this.#time) / 1000));

        this.#time = currentTime;

        const frame = this.#prioritiesCache.flatMap(priority =>
            [...this.#objectsToRefresh[priority]].map(obj => ({ obj, priority })));
        for (const { obj, priority } of frame)
            if (this.#objectsToRefresh[priority]?.includes(obj))
                obj.onRefresh(this.#deltaTime);
    }

    stop() {
        this.#running = false;
        if (this.#frame !== null)
            cancelAnimationFrame(this.#frame);
        this.#frame = null;
    }
}