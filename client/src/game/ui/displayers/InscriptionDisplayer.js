class InscriptionDisplayer extends InteractionDisplayer {
    static ACTION = 'stoneInscription';
    static KEY_CODE = 'KeyE';
    static KEY_LABEL = 'E';
    static LABEL_ID = 'inscription.read';
    #stones = null;
    #inventory = null;

    get target() { return this.#stones?.nearest ?? null; }

    enable() {
        const player = Scene.Instance.GetActorByIdentifier('player');
        this.#stones = player?.GetCompnentByType(StoneInscriptions);
        this.#inventory = player?.GetCompnentByType(Inventory);
        if (!this.#stones || !this.#inventory)
            throw new Error('Stone interaction requires inscriptions and inventory.');
        super.enable();
        window.addEventListener('networkstate', this.#update);
        window.addEventListener('worldcleared', this.#update);
        this.#inventory.EventManager.addEventListener(Inventory.CHANGED, this.#update);
        this.#update();
    }

    #update = () => {
        GameInterface.localize(this._displayer.querySelector('.interaction-label'),
            this.target?.occupied ? 'inscription.read' : 'inscription.place');
        this.refresh();
    };

    async interact(site) {
        const menu = this.manager.owner.WindowManager.windowByType(MainMenuWindow);
        if (site.occupied) {
            const playerId = window.GameConnection.playerId;
            const data = await window.GameConnection.request('readInscription', { stoneId: site.stoneId });
            if (playerId !== window.GameConnection.playerId || !this.#stones)
                return;
            ServerInventory.validate([data]);
            if (data.type !== 'preparedTablet')
                throw new Error('Invalid stone inscription.');
            const tablet = ServerInventory.createItem(data);
            menu.openGameDialog(ItemTextWindow, {
                titleId: tablet.nameId, textId: 'item.emeraldTablets.text',
                tablet: tablet.entries === null ? null : tablet, theme: 'emerald'
            });
            return;
        }
        const tablets = this.#inventory.orderedItems.filter(item =>
            item instanceof EmeraldTablets && item.prepared && item.serverId);
        if (!tablets.length)
            throw new Error(Game.Instance.LocalizationManager.get('inventory.itemUnavailable'));
        if (tablets.length > 1) {
            menu.openGameDialog(ItemPickerWindow, {
                titleId: 'inscription.choose', excluded: [], closeOnSelect: false,
                filter: item => item instanceof EmeraldTablets && item.prepared,
                select: id => {
                    const item = this.#inventory?.items.find(item => item.serverId === id);
                    if (!item)
                        throw new Error(Game.Instance.LocalizationManager.get('inventory.itemUnavailable'));
                    this.#confirm(menu, site, item);
                }
            });
            return;
        }
        this.#confirm(menu, site, tablets[0]);
    }

    #confirm(menu, site, item) {
        menu.openGameDialog(TextDialogWindow, {
            titleId: 'inscription.place', textId: 'inscription.confirm',
            subject: { name: ItemIcon.name(item), author: ItemIcon.author(item) },
            buttons: [
                { labelId: 'ui.cancel' },
                { labelId: 'inscription.place', action: () =>
                    window.GameConnection.request('placeInscription', { stoneId: site.stoneId, itemId: item.serverId }) }
            ]
        });
    }

    disable() {
        super.disable();
        window.removeEventListener('networkstate', this.#update);
        window.removeEventListener('worldcleared', this.#update);
        this.#inventory?.EventManager.removeEventListener(Inventory.CHANGED, this.#update);
        this.#inventory = null;
        this.#stones = null;
    }
}
