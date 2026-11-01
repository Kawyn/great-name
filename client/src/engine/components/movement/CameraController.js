class CameraController extends Component {

    cameraIdentifier = 'camera';
    #sensitivity = 100;
    pitchMinValue = -85;
    pitchMaxValue = 80;

    /** @type {Transform} */ #transform;
    /** @type {Transform} */ #cameraTransform;
    #pitch = 18;
    #targetHeight = 3.3;
    #terrainTransform;

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
        this.updateOrbit();
    }

    onEnable() {

        this.#sensitivity = Settings.GetValueAsString(Settings.MOUSE_SENSITIVITY) ?? 10;

        Scene.Instance.TimeManager.addObjectToRefresh(this, 175);
        Settings.EventManager.addEventListener(Settings.ON_VALUE_CHANGED, this.onEventCame);
    }

    onRefresh(deltaTime) {

        const mouseScale = 0.08;


        const deltaX = - this.vertical.value * mouseScale * this.#sensitivity / 10;
        const deltaY = - this.horizontal.value * mouseScale * this.#sensitivity / 10;
        this.#pitch = Math.min(this.pitchMaxValue, Math.max(this.pitchMinValue, this.#pitch + deltaX));
        if (deltaY !== 0)
            this.#transform.rotation.value = [0, this.#transform.rotation.value[1] + deltaY, 0];
        this.updateOrbit(deltaTime);
    }

    updateOrbit(deltaTime = null) {
        const blend = deltaTime === null ? 1 : 1 - Math.exp(-8 * Math.max(0, deltaTime));
        const yaw = this.#transform.rotation.value[1] * Math.PI / 180;
        const pitch = this.#pitch * Math.PI / 180;
        const progress = this.#pitch < 0 ?
            (this.#pitch - this.pitchMinValue) / -this.pitchMinValue :
            Math.min(1, this.#pitch / 60);
        const eased = progress * progress * (3 - 2 * progress);
        const distance = this.#pitch < 0 ? 1 + 23 * eased : 24 + 2 * eased;
        const desiredPosition = [
            -Math.sin(yaw) * Math.cos(pitch) * distance,
            this.#targetHeight + Math.sin(pitch) * distance,
            -Math.cos(yaw) * Math.cos(pitch) * distance
        ];
        this.clearTerrain(desiredPosition);
        const previousPosition = [...this.#cameraTransform.position.value];
        const position = desiredPosition.map((value, index) =>
            previousPosition[index] + (value - previousPosition[index]) * blend);
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
            this.#sensitivity = Settings.GetValueAsString(Settings.MOUSE_SENSITIVITY);
    }

    onDisable() {

        Scene.Instance.TimeManager.removeObjectToRefresh(this);
        Settings.EventManager.removeEventListener(Settings.ON_VALUE_CHANGED, this.onEventCame);
    }
}