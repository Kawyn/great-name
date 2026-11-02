class PickupDisplayer extends InteractionDisplayer {
    static ACTION = 'pickup';
    static KEY_CODE = 'KeyE';
    static KEY_LABEL = 'E';
    static LABEL_ID = 'loot.pickup';
    #loot = null;

    get labelId() { return this.target?.kind === 'resin' ? 'resource.gatherResin' : this.constructor.LABEL_ID; }

    get target() {
        if (Scene.Instance.GetActorByIdentifier('player')?.GetCompnentByType(StoneInscriptions)?.nearest)
            return null;
        return this.#loot?.nearest ?? null;
    }

    enable() {
        this.#loot = Scene.Instance.GetActorByIdentifier('player')?.GetCompnentByType(LootDrops);
        if (!this.#loot)
            throw new Error('Pickup UI requires loot rendering on the player.');
        super.enable();
        window.addEventListener('networkstate', this.refresh);
        window.addEventListener('worldcleared', this.refresh);
    }

    interact(drop) {
        window.GameConnection.sendCommand({ command: 'pickup', dropId: drop.id });
    }

    disable() {
        super.disable();
        window.removeEventListener('networkstate', this.refresh);
        window.removeEventListener('worldcleared', this.refresh);
        this.#loot = null;
    }
}
