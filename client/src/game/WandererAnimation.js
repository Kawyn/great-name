class WandererAnimation extends Component {
    movementDirection = [0, 0, 0];
    windDirection = [0.8, 0, 0.3];
    airborne = 0;
    landingCrouch = 0;
    motion = null;
    scarfVerticalMotion = 0;
    time = 0;
    #origin = null;
    #revision;
    #transform;
    #fallSpeed = 0;
    #grounded = false;
    #landingId = null;
    #pendingLanding = null;

    onPostInitialize() {
        this.#transform = this.actor.GetCompnentByType(Transform);
    }

    onEnable() {
        Scene.Instance.TimeManager.addObjectToRefresh(this, 160);
    }

    onDisable() {
        Scene.Instance.TimeManager.removeObjectToRefresh(this);
        this.#origin = null;
        this.movementDirection.fill(0);
        this.airborne = 0;
        this.scarfVerticalMotion = 0;
        this.landingCrouch = 0;
        this.#fallSpeed = 0;
        this.#landingId = this.#pendingLanding = null;
    }

    onRefresh(deltaTime) {
        const world = window.GameConnection?.world;
        const terrain = Scene.Instance.GetActorByIdentifier('terrain')?.GetCompnentByType(Transform);
        if (!world || !terrain)
            return;
        if (this.#revision !== world.revision) {
            this.#origin = null;
            this.#revision = world.revision;
        }
        const origin = this.#transform.position.value.map((value, i) => value - terrain.position.value[i]);
        const motion = this.actor.identifier === 'avatar' ? window.GameConnection?.state?.motion : this.motion;
        this.updateMotion(deltaTime, origin, WandererAnimation.groundAt(origin[0], origin[2], world), motion);
    }

    static landingImpact(speed) { return Math.min(1, Math.max(0, speed) / 24); }

    static groundAt(x, z, world) {
        const cx = Math.floor(x / world.chunkSize), cz = Math.floor(z / world.chunkSize);
        const chunk = world.chunks?.find(part => part.x === cx && part.z === cz);
        if (!chunk)
            return null;
        const sx = (x - cx * world.chunkSize) / world.step;
        const sz = (z - cz * world.chunkSize) / world.step;
        const ix = Math.floor(sx), iz = Math.floor(sz), fx = sx - ix, fz = sz - iz;
        const heights = chunk.heightMap;
        const a = heights[ix + 1][iz + 1], b = heights[ix + 2][iz + 1];
        const c = heights[ix + 1][iz + 2], d = heights[ix + 2][iz + 2];
        return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz :
            d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
    }

    updateMotion(deltaTime, origin, ground = null, motion = null) {
        const dt = Math.max(0, Math.min(deltaTime, 0.1));
        const displacement = this.#origin ? origin.map((value, i) => value - this.#origin[i]) : [0, 0, 0];
        const reset = !this.#origin || Math.hypot(...displacement) > 5;
        const grounded = ground !== null && origin[1] - ground < 0.2 && !motion?.airborne;
        this.landingCrouch *= Math.exp(-7 * dt);
        if (reset) {
            this.#fallSpeed = 0;
            this.#landingId = motion?.landingId ?? null;
            this.#pendingLanding = null;
            this.landingCrouch = 0;
        }
        else {
            if (motion && motion.landingId !== this.#landingId) {
                if (this.#landingId !== null)
                    this.#pendingLanding = motion.landingSpeed;
                this.#landingId = motion.landingId;
            }
            if (!grounded && dt > 0)
                this.#fallSpeed = Math.max(this.#fallSpeed, -displacement[1] / dt);
            if (grounded && (motion ? this.#pendingLanding !== null : !this.#grounded && this.#fallSpeed > 0)) {
                this.landingCrouch = WandererAnimation.landingImpact(this.#pendingLanding ?? this.#fallSpeed);
                this.#fallSpeed = 0;
                this.#pendingLanding = null;
            }
        }
        this.#grounded = grounded;
        const speed = dt > 0 && !reset ? Math.hypot(displacement[0], displacement[2]) / dt : 0;
        const scale = speed > 0 ? Math.min(speed / 13, 1) / Math.hypot(displacement[0], displacement[2]) : 0;
        const blend = reset ? 1 : 1 - Math.exp(-12 * dt);
        const vertical = dt > 0 && !reset ? Math.max(-1, Math.min(1, displacement[1] / dt / 13)) : 0;
        this.scarfVerticalMotion = reset ? 0 : this.scarfVerticalMotion +
            (vertical - this.scarfVerticalMotion) * (1 - Math.exp(-5 * dt));
        for (let i = 0; i < 3; i++) {
            const target = i === 1 ? vertical : displacement[i] * scale;
            this.movementDirection[i] += (target - this.movementDirection[i]) * blend;
        }
        const height = ground === null ? 0 : Math.max(0, origin[1] - ground - 0.08);
        const lift = Math.min(1, height / 0.55);
        this.airborne = reset ? lift : this.airborne + (lift - this.airborne) * blend;
        this.time += dt * (2 + 10 * Math.hypot(this.movementDirection[0], this.movementDirection[2]));
        this.#origin = [...origin];
    }
}
