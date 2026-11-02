class DepartureCutscene extends ActionGraph {
    constructor(material) {
        const context = {
            material, active: false, stoneId: null, direction: null, shot: null,
            ready() {
                return !this.active || !!window.GameConnection.world &&
                    window.GameConnection.state?.revision === window.GameConnection.world.revision;
            },
            site() {
                const site = window.GameConnection.state?.stoneSites?.find(site => site.stoneId === this.stoneId);
                if (!site)
                    throw new Error('The departure stone is no longer in the received terrain.');
                return site;
            },
            reference() {
                const state = window.GameConnection.state, terrain = Scene.Instance.GetActorByIdentifier('terrain')
                    .GetCompnentByType(Transform).position.value;
                return this.site().position.map((value, axis) => value - state.terrainOffset[axis] + terrain[axis]);
            },
            scarfPosition() {
                const site = this.site();
                if (!site.scarf)
                    throw new Error('The server has not committed the scarf.');
                return site.scarf.map((value, axis) => value - site.position[axis] + this.reference()[axis]);
            },
            holdCamera() {
                if (!this.shot)
                    return;
                const reference = this.reference();
                const position = this.shot.position.map((value, axis) => value + reference[axis]);
                this.cameraController.clearTerrain(position);
                this.cameraTransform.position.value = position;
                this.lookTarget.position.value = this.shot.target.map((value, axis) => value + reference[axis]);
                this.renderer.recalculateViewMatrix();
            },
            begin(data) {
                this.finished = false;
                this.startedAt = performance.now();
                this.timeline = () => (performance.now() - this.startedAt) / 1000;
                this.stoneId = data.stoneId;
                this.direction = data.direction;
                this.site();
                const player = Scene.Instance.GetActorByIdentifier('player');
                this.cameraController = player.GetCompnentByType(CameraController);
                this.movement = player.GetCompnentByType(ServerMovement);
                this.avatar = Scene.Instance.GetActorByIdentifier('avatar');
                this.avatarTransform = this.avatar.GetCompnentByType(Transform);
                this.avatarTransform.rotation.value = [0, Math.atan2(data.direction[0], data.direction[2]) * 180 / Math.PI, 0];
                const camera = Scene.Instance.GetActorByIdentifier('camera');
                this.cameraTransform = camera.GetCompnentByType(Transform);
                this.renderer = camera.GetCompnentByType(Renderer);
                this.previousTarget = this.renderer.target;
                const position = this.cameraTransform.position.value;
                const front = this.cameraTransform.front;
                this.lookTarget = { position: { value: position.map((value, axis) => value + front[axis] * 24) } };
                this.renderer.target = this.lookTarget;
                this.menu = GameInterface.Instance.WindowManager.windowByType(MainMenuWindow);
                this.menu.beginCinematic();
                this.cameraController.cinematic = true;
                this.movement.cinematic = true;
                player.GetCompnentByType(StoneInscriptions).hiddenScarf = data.stoneId;
                Scene.Instance.InputManager.blockInput();
                this.active = true;
                document.body.classList.add('cinematic');
                document.exitPointerLock?.();
                this.overlay = document.createElement('div');
                this.overlay.classList.add('cutscene-overlay');
                this.fade = document.createElement('div');
                this.fade.classList.add('cutscene-fade');
                this.caption = document.createElement('p');
                this.caption.classList.add('cutscene-caption');
                this.caption.setAttribute('role', 'status');
                this.caption.hidden = true;
                this.overlay.appendChild(this.fade);
                this.overlay.appendChild(this.caption);
                document.body.appendChild(this.overlay);
                const origin = this.reference();
                const left = [-data.direction[2], 0, data.direction[0]];
                const interceptDistance = data.speed * 4;
                this.frontShot = origin.map((value, axis) => -value +
                    (axis === 1 ? 1.1 : data.direction[axis] * (interceptDistance + 7) + left[axis] * 4.5));
                this.frontTarget = origin.map((value, axis) => -value +
                    (axis === 1 ? 2.1 : data.direction[axis] * interceptDistance));
                this.cameraArc = left.map((value, axis) => axis === 1 ? 5 : value * 18);
            },
            cleanup() {
                if (!this.active)
                    return;
                this.active = false;
                document.body.classList.remove('cinematic');
                this.overlay.remove();
                if (this.flying) {
                    for (const renderable of this.flying.GetCompnentsByType(Renderable))
                        renderable.material.clear();
                    this.flying.destroy();
                    this.flying = null;
                }
                const inscriptions = Scene.Instance.GetActorByIdentifier('player').GetCompnentByType(StoneInscriptions);
                inscriptions.hiddenScarf = null;
                this.renderer.target = this.previousTarget;
                this.renderer.recalculateViewMatrix();
                this.cameraController.cinematic = false;
                this.movement.cinematic = false;
                this.menu.cinematic = false;
                if (!this.finished)
                    for (const renderable of this.avatar.GetCompnentsByType(Renderable))
                        if (!renderable.active)
                            renderable.active = true;
                Scene.Instance.InputManager.unblockInput();
                this.menu.show();
            }
        };
        const startCamera = new MoveCameraAction(4, c => ({
            position: c.frontShot.map((value, axis) => value + c.reference()[axis]),
            target: c.frontTarget.map((value, axis) => value + c.reference()[axis])
        }), c => c.cameraArc);
        const walk = new MoveCharacterAction(7, c => c.direction);
        const startWalk = walk.start.bind(walk);
        walk.start = c => {
            startWalk(c);
            c.shot = { position: [...c.frontShot], target: [...c.frontTarget] };
        };
        const lookAtStone = new MoveCameraAction(0, c => {
            const reference = c.reference();
            const left = [-c.direction[2], 0, c.direction[0]];
            return {
                position: reference.map((value, axis) => value +
                    (axis === 1 ? 2 : c.direction[axis] * 11 + left[axis] * 4)),
                target: reference.map((value, axis) => value + (axis === 1 ? -0.5 : 0))
            };
        });
        const lookStart = lookAtStone.start.bind(lookAtStone);
        lookAtStone.start = c => {
            lookStart(c);
            c.shot = null;
            for (const renderable of c.avatar.GetCompnentsByType(Renderable))
                renderable.active = false;
        };
        const lookApply = lookAtStone.apply.bind(lookAtStone);
        lookAtStone.apply = (progress, c) => {
            lookApply(progress, c);
            const reference = c.reference();
            c.shot = {
                position: c.cameraTransform.position.value.map((value, axis) => value - reference[axis]),
                target: c.lookTarget.position.value.map((value, axis) => value - reference[axis])
            };
        };
        const actions = [
            new WaitForEventAction('journeystarted', (data, c) => c.begin(data)),
            startCamera,
            walk,
            new ShowTextAction(7, 'cutscene.departure', true),
            new FadeAction(2, 0, 1),
            new WaitForEventAction('journeyended', (data, c) => {
                if (data.stoneId !== c.stoneId)
                    throw new Error('Departure completion refers to a different stone.');
                c.caption.hidden = true;
                Scene.Instance.GetActorByIdentifier('player').GetCompnentByType(StoneInscriptions).hiddenScarf = c.stoneId;
            }),
            lookAtStone,
            new FadeAction(1.2, 1, 0),
            new SpawnObjectAction(c => {
                const instance = c.material.clone();
                instance.postprocess = () => instance.isMeshDirty = false;
                c.flightFinished = false;
                c.flying = new Actor('departing-scarf', [
                    new Transform(), new Renderable(Scarf.build(), instance), new FlyingScarf(c)
                ]);
                return c.flying;
            }),
            { update: (dt, c) => { c.holdCamera(); return c.flightFinished === true; } },
            new FadeAction(2, 0, 1)
        ];
        startCamera.timelineStart = 0;
        walk.timelineStart = 4;
        actions[3].timelineStart = 11;
        actions[4].timelineStart = 18;
        super('departure-cutscene', actions, context, ['journeystarted', 'journeyended']);
        context.onCancel = () => context.cleanup();
        context.onError = error => {
            context.cleanup();
            const status = document.getElementById('world-status');
            status.hidden = false;
            GameInterface.localize(status, 'cutscene.error', { message: error.message });
        };
        context.onComplete = () => {
            context.finished = true;
            window.GameConnection.endJourneyView();
            context.cleanup();
            context.menu.endJourney();
        };
        this.context = context;
    }

    reset = () => {
        this.cancel();
        this.runner.actionIndex = 0;
        this.runner.onEnable();
    };

    onEnable() {
        super.onEnable();
        window.addEventListener('worldcleared', this.reset);
    }
    onDisable() {
        window.removeEventListener('worldcleared', this.reset);
        super.onDisable();
    }
}
