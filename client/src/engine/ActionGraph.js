class ActionGraph extends Actor {
    constructor(identifier, actions, context = {}, events = []) {
        const runner = new ActionGraphRunner(actions, context, events);
        super(identifier, [runner]);
        this.runner = runner;
    }

    get status() { return this.runner.status; }
    get actions() { return this.runner.actions; }
    get actionIndex() { return this.runner.actionIndex; }
    signal(name, detail) { this.runner.signal(name, detail); }
    cancel() { this.runner.cancel(); }
}

class ActionGraphRunner extends Component {
    status = 'idle';
    actionIndex = 0;
    #started = false;
    #events = new Map();
    #listeners = new Map();

    constructor(actions, context, events) {
        super();
        if (!Array.isArray(actions) || !actions.length ||
            actions.some(action => typeof action.update !== 'function'))
            throw new Error('ActionGraph requires an ordered, nonempty list of actions.');
        this.actions = actions;
        this.context = context;
        this.events = events;
    }

    onEnable() {
        this.status = 'running';
        for (const name of this.events) {
            const listener = event => this.signal(name, event.detail);
            this.#listeners.set(name, listener);
            window.addEventListener(name, listener);
        }
        Scene.Instance.TimeManager.addObjectToRefresh(this, 165);
    }

    signal(name, detail) {
        const queue = this.#events.get(name) ?? [];
        queue.push(detail);
        this.#events.set(name, queue);
    }

    take(name) {
        const queue = this.#events.get(name);
        return queue?.length ? { detail: queue.shift() } : null;
    }

    onRefresh(deltaTime) {
        if (this.status !== 'running')
            return;
        try {
            if (this.context.ready && !this.context.ready())
                return;
            const action = this.actions[this.actionIndex];
            if (!this.#started) {
                this.#started = true;
                action.start?.(this.context, this);
            }
            if (!action.update(Math.max(0, Math.min(deltaTime, 0.1)), this.context, this))
                return;
            action.stop?.(this.context, this);
            this.#started = false;
            this.actionIndex++;
            if (this.actionIndex === this.actions.length) {
                this.status = 'completed';
                this.#detach();
                this.context.onComplete?.();
            }
        }
        catch (error) {
            try { this.cancel(); }
            catch (cleanupError) {
                console.error(`ActionGraph '${this.actor.identifier}' cleanup failed:`, cleanupError);
            }
            this.status = 'failed';
            console.error(`ActionGraph '${this.actor.identifier}' failed at action ${this.actionIndex}:`, error);
            this.context.onError?.(error);
        }
    }

    #detach() {
        Scene.Instance.TimeManager.removeObjectToRefresh(this);
        for (const [name, listener] of this.#listeners)
            window.removeEventListener(name, listener);
        this.#listeners.clear();
    }

    cancel() {
        try {
            if (this.#started)
                this.actions[this.actionIndex]?.stop?.(this.context, this);
        }
        finally {
            this.#started = false;
            this.status = 'cancelled';
            this.#events.clear();
            this.#detach();
            this.context.onCancel?.();
        }
    }

    onDisable() { this.cancel(); }
}

class WaitForEventAction {
    constructor(name, receive = () => {}) {
        this.name = name;
        this.receive = receive;
    }
    update(deltaTime, context, graph) {
        const event = graph.take(this.name);
        if (!event)
            return false;
        this.receive(event.detail, context);
        return true;
    }
}

class TimedAction {
    constructor(duration) {
        if (!Number.isFinite(duration) || duration < 0)
            throw new Error('An action duration must be finite and nonnegative.');
        this.duration = duration;
    }
    start() { this.elapsed = 0; }
    update(deltaTime, context) {
        this.elapsed = Math.min(this.duration, this.timelineStart !== undefined ?
            Math.max(0, context.timeline() - this.timelineStart) : this.elapsed + deltaTime);
        this.apply(this.duration ? this.elapsed / this.duration : 1, context);
        return this.elapsed >= this.duration;
    }
    apply() {}
}

class MoveCameraAction extends TimedAction {
    constructor(duration, pose, arc = null) {
        super(duration);
        this.pose = pose;
        this.arc = arc;
    }
    start(context) {
        super.start();
        this.from = [...context.cameraTransform.position.value];
        this.fromTarget = [...context.lookTarget.position.value];
        this.fromReference = [...context.reference()];
    }
    apply(progress, context) {
        const eased = progress * progress * (3 - 2 * progress);
        const reference = context.reference();
        const pose = this.pose(context);
        const shift = reference.map((value, axis) => value - this.fromReference[axis]);
        const arc = this.arc ? this.arc(context) : [0, 0, 0];
        const position = this.from.map((value, axis) =>
            value + shift[axis] + (pose.position[axis] - value - shift[axis]) * eased +
                Math.sin(eased * Math.PI) * arc[axis]);
        context.cameraController.clearTerrain(position);
        context.cameraTransform.position.value = position;
        context.lookTarget.position.value = this.fromTarget.map((value, axis) =>
            value + shift[axis] + (pose.target[axis] - value - shift[axis]) * eased);
        context.renderer.recalculateViewMatrix();
    }
}

class MoveCharacterAction extends TimedAction {
    constructor(duration, direction) {
        super(duration);
        this.direction = direction;
    }
    start(context) {
        super.start();
        const direction = this.direction(context);
        context.avatarTransform.rotation.value = [0, Math.atan2(direction[0], direction[2]) * 180 / Math.PI, 0];
    }
    apply(progress, context) { context.holdCamera(); }
}

class ShowTextAction extends TimedAction {
    constructor(duration, textId, keepVisible = false) {
        super(duration);
        this.textId = textId;
        this.keepVisible = keepVisible;
    }
    start(context) {
        super.start();
        GameInterface.localize(context.caption, this.textId);
        context.caption.hidden = false;
    }
    apply(progress, context) { context.holdCamera(); }
    stop(context) {
        if (!this.keepVisible)
            context.caption.hidden = true;
    }
}

class FadeAction extends TimedAction {
    constructor(duration, from, to) {
        super(duration);
        this.from = from;
        this.to = to;
    }
    apply(progress, context) {
        context.fade.style.opacity = String(this.from + (this.to - this.from) * progress);
        context.holdCamera();
    }
}

class SpawnObjectAction {
    constructor(create) { this.create = create; }
    update(deltaTime, context) {
        const actor = this.create(context);
        if (!(actor instanceof Actor))
            throw new Error('SpawnObjectAction must create an Actor.');
        Scene.Instance.PushActor(actor);
        return true;
    }
}
