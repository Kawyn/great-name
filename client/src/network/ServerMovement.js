class ServerMovement extends Component {
    #keys = new Set();
    #transform;
    #lastSent = -Infinity;
    #avatarTransform;

    constructor(avatarIdentifier = null) {
        super();
        this.avatarIdentifier = avatarIdentifier;
    }

    onPostInitialize() {
        this.#transform = this.actor.GetCompnentByType(Transform);
        if (this.avatarIdentifier)
            this.#avatarTransform = Scene.Instance.GetActorByIdentifier(this.avatarIdentifier).GetCompnentByType(Transform);
    }

    onEnable() {
        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('keyup', this.onKeyUp);
        document.addEventListener('pointerlockchange', this.onPointerLock);
        window.addEventListener('blur', this.stop);
        window.addEventListener('worldcleared', this.stop);
        Scene.Instance.TimeManager.addObjectToRefresh(this);
    }

    onKeyDown = (event) => {
        if (document.pointerLockElement === document.querySelector('canvas') && event.code === 'Space') {
            event.preventDefault();
            if (!event.repeat)
                window.GameConnection?.sendJump();
            return;
        }
        if (document.pointerLockElement === document.querySelector('canvas') &&
            ['KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(event.code)) {
            event.preventDefault();
            this.#keys.add(event.code);
        }
    };

    onKeyUp = (event) => {
        if (this.#keys.delete(event.code))
            this.send();
    };

    onPointerLock = () => {
        if (document.pointerLockElement !== document.querySelector('canvas'))
            this.stop();
    };

    stop = () => {
        this.#keys.clear();
        this.send();
    };

    send() {
        const forward = Number(this.#keys.has('KeyW')) - Number(this.#keys.has('KeyS'));
        const right = Number(this.#keys.has('KeyD')) - Number(this.#keys.has('KeyA'));
        const yaw = ((this.#transform.rotation.value[1] + 180) % 360 + 360) % 360 - 180;
        if (this.#avatarTransform && (forward || right)) {
            const heading = yaw + Math.atan2(right, forward) * 180 / Math.PI;
            if (this.#avatarTransform.rotation.value[1] !== heading)
                this.#avatarTransform.rotation.value = [0, heading, 0];
        }
        window.GameConnection?.sendInput(forward, right, yaw);
        this.#lastSent = performance.now();
    }

    onRefresh() {
        if (performance.now() - this.#lastSent >= 100)
            this.send();
    }

    onDisable() {
        this.stop();
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        document.removeEventListener('pointerlockchange', this.onPointerLock);
        window.removeEventListener('blur', this.stop);
        window.removeEventListener('worldcleared', this.stop);
        Scene.Instance.TimeManager.removeObjectToRefresh(this);
    }
}
