class PlayerDust extends ParticleSystem {
    #avatar;
    #terrain;
    #origin = null;
    #offset = null;
    #revision;
    #grounded = false;
    #distance = 0;
    #foot = 1;
    #fallSpeed = 0;
    #landingId = null;
    #pendingLanding = null;

    constructor(avatarIdentifier = 'avatar') {
        super({
            count: 160, lifetime: [0.45, 0.95], size: [0.35, 0.8],
            spawn: { min: [-0.25, 0.04, -0.25], max: [0.25, 0.16, 0.25] },
            velocity: { min: [-0.7, 0.5, -0.7], max: [0.7, 1.4, 0.7] },
            acceleration: [0, -0.25, 0], turbulence: 0.06, color: [0.63, 0.44, 0.25, 0.32]
        }, { continuous: false, worldSpace: true, additive: false, lit: true });
        this.avatarIdentifier = avatarIdentifier;
    }

    onPostInitialize() {
        this.#avatar = Scene.Instance.GetActorByIdentifier(this.avatarIdentifier).GetCompnentByType(Transform);
        this.#terrain = Scene.Instance.GetActorByIdentifier('terrain').GetCompnentByType(Transform);
    }

    onRefresh(deltaTime) {
        const world = window.GameConnection?.world;
        if (!world || !this.#terrain) {
            this.resetMotion();
            super.onRefresh(deltaTime);
            return;
        }
        const offset = [...this.#terrain.position.value];
        const position = this.#avatar.position.value;
        const origin = position.map((value, axis) => value - offset[axis]);
        const ground = WandererAnimation.groundAt(origin[0], origin[2], world);
        const motion = window.GameConnection?.state?.motion;
        const grounded = ground !== null && origin[1] - ground < 0.2 && !motion?.airborne;
        if (this.#revision !== world.revision) {
            // Chunk rebases must not look like footsteps or a jump.
            this.resetMotion();
            this.#revision = world.revision;
        }
        if (motion) {
            if (this.#landingId !== null && motion.landingId !== this.#landingId)
                this.#pendingLanding = motion.landingSpeed;
            this.#landingId = motion.landingId;
        }
        if (this.#origin && deltaTime > 0) {
            this.shift(offset.map((value, axis) => value - this.#offset[axis]));
            const displacement = origin.map((value, axis) => value - this.#origin[axis]);
            const distance = Math.hypot(displacement[0], displacement[2]);
            if (Math.hypot(...displacement) > 5 || ground === null) {
                this.resetMotion();
            }
            else {
                if (this.#grounded && !grounded && displacement[1] > 0 && (!motion || motion.airborne))
                    this.emit(22, [position[0], ground + offset[1], position[2]]);
                if (!grounded)
                    this.#fallSpeed = Math.max(this.#fallSpeed, -displacement[1] / deltaTime);
                if (grounded && (motion ? this.#pendingLanding !== null : !this.#grounded)) {
                    const impact = WandererAnimation.landingImpact(this.#pendingLanding ?? this.#fallSpeed);
                    this.emit(12 + Math.round(84 * impact), [position[0], ground + offset[1], position[2]], 0.65 + 1.75 * impact);
                    this.#fallSpeed = 0;
                    this.#pendingLanding = null;
                }
                if (grounded && this.#grounded && distance / deltaTime > 1) {
                    this.#distance += distance;
                    while (this.#distance >= 1.8) {
                        this.#distance -= 1.8;
                        this.#foot *= -1;
                        const yaw = this.#avatar.rotation.value[1] * Math.PI / 180;
                        this.emit(5, [position[0] + Math.cos(yaw) * this.#foot * 0.28,
                            ground + offset[1], position[2] - Math.sin(yaw) * this.#foot * 0.28]);
                    }
                }
                else
                    this.#distance = 0;
            }
        }
        this.#origin = origin;
        this.#offset = offset;
        this.#grounded = grounded;
        super.onRefresh(deltaTime);
    }

    resetMotion() {
        this.#origin = this.#offset = null;
        this.#distance = 0;
        this.#grounded = false;
        this.#fallSpeed = 0;
        this.#landingId = this.#pendingLanding = null;
        this.clearParticles();
    }

    onDisable() {
        this.resetMotion();
        this.#revision = undefined;
        super.onDisable();
    }
}
