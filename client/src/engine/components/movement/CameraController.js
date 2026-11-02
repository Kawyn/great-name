class CameraController extends Component {
    cinematic = false;

    cameraIdentifier = 'camera';
    #sensitivity = 100;
    pitchMinValue = -30;
    pitchMaxValue = 70;

    /** @type {Transform} */ #transform;
    /** @type {Transform} */ #cameraTransform;
    #pitch = 18;
    #targetPitch = 18;
    #pitchVelocity = 0;
    #yawVelocity = 0;
    #targetYaw;
    #targetHeight = 3.3;
    #terrainTransform;
    #orbitYaw = null;

    constructor(cameraIdentifier = 'camera') {
        super();

        this.cameraIdentifier = cameraIdentifier;
    }

    onPostInitialize() {

        this.horizontal = Scene.Instance.InputManager.GetAxis('mouse_x');
        this.vertical = Scene.Instance.InputManager.GetAxis('mouse_y');

        this.#transform = this.actor.GetCompnentByType(Transform);

        const cameraObject = Scene.Instance.GetActorByIdentifier(this.cameraIdentifier);
        this.#cameraTransform = cameraObject.GetCompnentByType(Transform);
        this.#terrainTransform = Scene.Instance.GetActorByIdentifier('terrain')?.GetCompnentByType(Transform);
        this.#targetYaw = this.#transform.rotation.value[1] + 8;
        this.updateOrbit();
    }

    onEnable() {

        this.readSensitivity();

        Scene.Instance.TimeManager.addObjectToRefresh(this, 175);
        Settings.EventManager.addEventListener(Settings.ON_VALUE_CHANGED, this.onEventCame);
    }

    onRefresh(deltaTime) {
        if (this.cinematic) {
            this.#yawVelocity = this.#pitchVelocity = 0;
            return;
        }
        const dx = -this.horizontal.value * 0.08 * this.#sensitivity / 100;
        const dy = -this.vertical.value * 0.08 * this.#sensitivity / 100;
        if (dx || dy) {
            // Bound queued angular travel, not individual mouse events.
            this.#targetYaw = this.#orbitYaw + Math.max(-90, Math.min(90,
                CameraController.angle(this.#targetYaw - this.#orbitYaw) + dx));
            this.#targetPitch = Math.max(this.pitchMinValue, Math.min(this.pitchMaxValue, this.#targetPitch + dy));
            this.#transform.rotation.value = [0, this.#targetYaw - 8, 0];
        }
        this.updateOrbit(deltaTime);
    }

    static angle(value) { return ((value + 180) % 360 + 360) % 360 - 180; }

    static spring(value, velocity, target, deltaTime) {
        const displacement = value - target;
        const decay = Math.exp(-10 * deltaTime);
        const step = (velocity + 10 * displacement) * deltaTime;
        return [target + (displacement + step) * decay, (velocity - 10 * step) * decay];
    }

    updateOrbit(deltaTime = null) {
        this.#orbitYaw ??= this.#targetYaw;
        const targetYaw = this.#orbitYaw + CameraController.angle(this.#targetYaw - this.#orbitYaw);
        if (deltaTime === null) {
            this.#orbitYaw = targetYaw;
            this.#pitch = this.#targetPitch;
            this.#yawVelocity = this.#pitchVelocity = 0;
        }
        else {
            const dt = Math.max(0, Math.min(deltaTime, 0.1));
            [this.#orbitYaw, this.#yawVelocity] = CameraController.spring(
                this.#orbitYaw, this.#yawVelocity, targetYaw, dt);
            [this.#pitch, this.#pitchVelocity] = CameraController.spring(
                this.#pitch, this.#pitchVelocity, this.#targetPitch, dt);
            this.#pitch = Math.max(this.pitchMinValue, Math.min(this.pitchMaxValue, this.#pitch));
        }
        const yaw = this.#orbitYaw * Math.PI / 180;
        const pitch = this.#pitch * Math.PI / 180;
        const progress = this.#pitch < 0 ?
            (this.#pitch - this.pitchMinValue) / -this.pitchMinValue :
            this.#pitch / this.pitchMaxValue;
        const eased = progress * progress * (3 - 2 * progress);
        const distance = this.#pitch < 0 ? 10 + 3 * eased : 13 + 13 * eased;
        const position = [
            -Math.sin(yaw) * Math.cos(pitch) * distance,
            this.#targetHeight + Math.sin(pitch) * distance,
            -Math.cos(yaw) * Math.cos(pitch) * distance
        ];
        // Collision safety overrides easing when the terrain rises under the camera.
        this.clearTerrain(position);
        // Aim from the eased position so the head stays centered during zooming.
        const actualPitch = Math.atan2(
            position[1] - this.#targetHeight,
            Math.hypot(position[0], position[2])) * 180 / Math.PI;
        if (position.some((value, index) => value !== this.#cameraTransform.position.value[index]))
            this.#cameraTransform.position.value = position;
        const current = this.#cameraTransform.rotation.value;
        const actualYaw = Math.atan2(-position[0], -position[2]) * 180 / Math.PI;
        const yawDelta = ((actualYaw - current[1] + 180) % 360 + 360) % 360 - 180;
        const rotation = [
            actualPitch,
            current[1] + yawDelta,
            0
        ];

        if (rotation.some((value, index) => value !== current[index]))
            this.#cameraTransform.rotation.value = rotation;
    }

    clearTerrain(position) {
        // Sample only the server-supplied terrain; no local world generation.
        const world = window.GameConnection?.world;
        const state = window.GameConnection?.state;
        if (world) {
            const offset = this.#terrainTransform?.position.value ??
                (state?.revision === world.revision ? state.terrainOffset : world.terrainOffset);
            const x = position[0] - offset[0];
            const z = position[2] - offset[2];
            const chunkX = Math.floor(x / world.chunkSize);
            const chunkZ = Math.floor(z / world.chunkSize);
            const chunk = world.chunks.find(part => part.x === chunkX && part.z === chunkZ);
            if (chunk) {
                const sx = (x - chunkX * world.chunkSize) / world.step;
                const sz = (z - chunkZ * world.chunkSize) / world.step;
                const ix = Math.floor(sx);
                const iz = Math.floor(sz);
                const fx = sx - ix;
                const fz = sz - iz;
                const h = chunk.heightMap;
                const height = h[ix + 1][iz + 1] * (1 - fx) * (1 - fz) +
                    h[ix + 2][iz + 1] * fx * (1 - fz) +
                    h[ix + 1][iz + 2] * (1 - fx) * fz + h[ix + 2][iz + 2] * fx * fz;
                position[1] = Math.max(position[1], height + offset[1] + 1.5);
            }
        }
    }

    onEventCame = (eventName, data) => {

        if (data === Settings.MOUSE_SENSITIVITY)
            this.readSensitivity();
    }

    readSensitivity() {
        const saved = Settings.GetValueAsString(Settings.MOUSE_SENSITIVITY);
        const value = saved === undefined ? 100 : Number(saved);
        if (!Number.isFinite(value) || value <= 0)
            throw new Error('Mouse sensitivity must be a positive number.');
        this.#sensitivity = value;
    }

    onDisable() {

        Scene.Instance.TimeManager.removeObjectToRefresh(this);
        Settings.EventManager.removeEventListener(Settings.ON_VALUE_CHANGED, this.onEventCame);
    }
}