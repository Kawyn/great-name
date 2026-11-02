class DayNightCycle extends Component {
    #sample = null;
    #receivedAt = 0;
    #transform;

    static lighting(phase) {
        const angle = phase * Math.PI * 2;
        const tilt = 35 * Math.PI / 180;
        const sunDirection = [
            Math.cos(angle),
            Math.sin(angle) * Math.cos(tilt),
            Math.sin(angle) * Math.sin(tilt)
        ];
        const t = Math.max(0, Math.min(1, (sunDirection[1] + 0.12) / 0.42));
        return { sunDirection, daylight: t * t * (3 - 2 * t) };
    }

    onEnable() {
        this.#transform = this.actor.GetCompnentByType(Transform);
        if (!this.#transform)
            throw new Error('Day/night lighting requires a sun Transform.');
        window.addEventListener('networkstate', this.#receive);
        window.addEventListener('worldcleared', this.#clear);
        Scene.Instance.TimeManager.addObjectToRefresh(this, 190);
        if (window.GameConnection?.state)
            this.#receive({ detail: window.GameConnection.state });
    }

    #receive = ({ detail }) => {
        if (!detail.dayCycle)
            return;
        this.#sample = { ...detail.dayCycle };
        this.#receivedAt = performance.now();
        this.onRefresh();
    };

    onRefresh() {
        if (!this.#sample)
            return;
        const phase = (this.#sample.phase +
            Math.max(0, performance.now() - this.#receivedAt) / (this.#sample.duration * 1000)) % 1;
        const { sunDirection, daylight } = DayNightCycle.lighting(phase);
        this.#transform.sunDirection = sunDirection;
        this.#transform.daylight = daylight;
        // Moonlight casts shadows at night; the visible sun continues below the horizon.
        const direction = sunDirection[1] >= 0 ? sunDirection : sunDirection.map(value => -value);
        this.#transform.position.value = direction.map((value, axis) =>
            (axis === 1 ? Math.max(0.06, value) : value) * 650);
    }

    #clear = () => { this.#sample = null; };

    onDisable() {
        window.removeEventListener('networkstate', this.#receive);
        window.removeEventListener('worldcleared', this.#clear);
        Scene.Instance.TimeManager.removeObjectToRefresh(this);
        this.#clear();
    }
}
