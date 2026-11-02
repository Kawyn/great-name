const assert = require('node:assert/strict');
const test = require('node:test');
const { loadUi } = require('./helpers/ui-context');
const { readFileSync } = require('node:fs');
const path = require('node:path');

function setup() {
    const ui = loadUi();
    ui.localization.register(JSON.parse(readFileSync(path.join(__dirname, '..', 'src', 'game', 'resources', 'localization', 'localization.json'), 'utf8')));
    ui.localization.setLanguage('pl');
    const inventory = new ui.Inventory();
    const synchronization = new ui.ServerInventory();
    const player = new ui.Actor('player', [inventory, synchronization]);
    ui.scene.actors.push(player);
    player.onInitialize();
    player.onEnable();
    return { ...ui, player, inventory, synchronization };
}

const journal = (isNew = true) => ({
    id: 'journal-1', type: 'journal', ownerId: 'local-alchemist', author: 'Alchemist Test',
    entries: [], isNew, burnable: true
});

test('gathered resin has localized icons, contextual E pickup and accepts both new crafting outcomes', async () => {
    for (const [type, outcome, text] of [
        ['resin', 'hardenedResin', /stężała/],
        ['hardenedResin', 'resinBinder', /spoiwo/]
    ]) {
        const ui = setup();
        const data = { id: 'resin-1', type, isNew: true };
        ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [data] });
        const item = ui.inventory.items[0];
        assert.equal(item.icon, ui.game.ResourceManager.get(ui.ServerInventory.resourceID(type)).icon);
        assert.match(ui.ItemIcon.name(item), /[Żż]ywica/);
        const windows = ui.GameInterface.create();
        await ui.GameInterface.boot(Promise.resolve(), windows);
        windows.DisplayerManager.initialize(windows);
        const loot = { nearest: { id: 'resin-site', kind: 'resin' } };
        const getComponent = ui.player.GetCompnentByType.bind(ui.player);
        ui.player.GetCompnentByType = Kind => Kind === ui.LootDrops ? loot : getComponent(Kind);
        const pickup = windows.DisplayerManager.displayerByType(ui.PickupDisplayer);
        pickup.enable();
        assert.match(pickup.element.textContent, /Zbierz żywicę/);
        pickup.interact(loot.nearest);
        assert.deepEqual(structuredClone(ui.connection.sent.at(-1)), { command: 'pickup', dropId: 'resin-site' });
        loot.nearest = { id: 'book' };
        pickup.refresh();
        assert.equal(pickup.labelId, 'loot.pickup');
        const menu = windows.WindowManager.windowByType(ui.MainMenuWindow);
        menu.openDialog(ui.CraftingWindow);
        const crafting = windows.WindowManager.windowByType(ui.CraftingWindow);
        pick(ui, windows, crafting, '.craft-slot-first');
        crafting.element.querySelector('.craft-fire').onclick();
        ui.connection.request = async () => ({ outcome });
        await crafting.element.querySelector('.craft-combine').onclick();
        assert.match(crafting.element.querySelector('.craft-result').textContent, text);
        assert.equal(crafting.element.querySelector('.craft-error').hidden, true);
    }
});

test('inventory renders 32 occupied or empty slots and rejects oversized snapshots atomically', async () => {
    const ui = setup();
    const items = Array.from({ length: 32 }, (_, index) =>
        ({ id: `resin-${index}`, type: 'resin', isNew: false }));
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: items });
    assert.equal(ui.inventory.items.length, 32, 'identical types occupy separate slots');
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.WindowManager.windowByType(ui.MainMenuWindow).openDialog(ui.InventoryWindow);
    const inventory = windows.WindowManager.windowByType(ui.InventoryWindow);
    assert.equal(inventory.element.querySelectorAll('.inventory-entry').length, 32);
    assert.equal(inventory.element.querySelectorAll('.inventory-empty-slot').length, 0);
    assert.equal(inventory.element.querySelector('.inventory-capacity'), null);
    assert.throws(() => ui.window.dispatchEvent({ type: 'inventoryreceived',
        detail: [...items, { id: 'overflow', type: 'resin', isNew: false }] }), /item list/);
    assert.equal(ui.inventory.items.length, 32);
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: items.slice(0, 31) });
    assert.equal(inventory.element.querySelectorAll('.inventory-entry').length, 31);
    assert.equal(inventory.element.querySelectorAll('.inventory-empty-slot').length, 1);
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [] });
    assert.equal(inventory.element.querySelectorAll('.inventory-empty-slot').length, 32);
});

test('prepared tablets retain literal writing, author, distinct icon and read-only reader', async () => {
    const ui = setup();
    const data = { id: 'mounted', type: 'preparedTablet', isNew: true, ownerId: 'foreign',
        author: 'Alchemist Far Away', entries: [{ text: '<img>Ancient words', strikes: [[5, 12]] }] };
    ui.ServerInventory.validate([data, { id: 'binder', type: 'bitumen', isNew: false }]);
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [data] });
    const item = ui.inventory.items[0];
    assert.equal(item.prepared, true);
    assert.equal(item.author, data.author);
    assert.equal(item.nameId, 'item.preparedTablet.name');
    assert.deepEqual(item.entries, data.entries);
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.WindowManager.windowByType(ui.MainMenuWindow).openDialog(ui.InventoryWindow);
    item.onUse({ windows: windows.WindowManager });
    const reader = windows.WindowManager.windowByType(ui.ItemTextWindow);
    assert.equal(reader.visible, true);
    assert.match(reader.element.textContent, /Alchemist Far Away/);
    assert.match(reader.element.textContent, /<img>/);
    assert.equal(reader.element.querySelectorAll('textarea').length, 0);
    assert.equal(reader.element.querySelectorAll('s').length, 1);
    assert.throws(() => ui.ServerInventory.validate([{ ...data, author: undefined }]), /owner/);
});

test('potions drink through acknowledged inventory use, block repeat clicks and surface failures without losing the item', async () => {
    for (const type of ['speedPotion', 'speedEssence']) {
        const ui = setup();
        const data = { id: 'drink-1', type, isNew: false };
        ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [data] });
        const item = ui.inventory.items[0];
        assert.ok(item instanceof ui.InventoryItemWithUse);
        assert.equal(item.icon, ui.game.ResourceManager.get(ui.ServerInventory.resourceID(type)).icon);
        const windows = ui.GameInterface.create();
        await ui.GameInterface.boot(Promise.resolve(), windows);
        windows.WindowManager.windowByType(ui.MainMenuWindow).openDialog(ui.InventoryWindow);
        const inventory = windows.WindowManager.windowByType(ui.InventoryWindow);
        let accept, calls = 0;
        ui.connection.request = (command, fields) => {
            calls++;
            assert.equal(command, 'drink');
            assert.deepEqual(structuredClone(fields), { itemId: 'drink-1' });
            return new Promise(resolve => { accept = resolve; });
        };
        const button = inventory.element.querySelector('.inventory-item');
        const pending = button.onclick();
        await button.onclick();
        assert.equal(calls, 1);
        assert.ok(ui.inventory.items.includes(item), 'request alone does not remove a potion');
        ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [] });
        accept({ type });
        await pending;
        assert.equal(ui.inventory.items.length, 0);
        ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [data] });
        ui.connection.request = async () => { throw new Error('Already strengthened'); };
        await inventory.element.querySelector('.inventory-item').onclick();
        assert.equal(ui.inventory.items.length, 1);
        assert.equal(inventory.element.querySelector('.inventory-error').hidden, false);
        assert.match(inventory.element.querySelector('.inventory-error').textContent, /Already strengthened/);
        for (const [outcome, text] of [['speedPotion', /bursztynowa/], ['speedEssence', /kropla/]]) {
            windows.WindowManager.windowByType(ui.MainMenuWindow).openDialog(ui.CraftingWindow);
            const crafting = windows.WindowManager.windowByType(ui.CraftingWindow);
            pick(ui, windows, crafting, '.craft-slot-first');
            crafting.element.querySelector('.craft-fire').onclick();
            ui.connection.request = async () => ({ outcome });
            await crafting.element.querySelector('.craft-combine').onclick();
            assert.match(crafting.element.querySelector('.craft-result').textContent, text);
            crafting.hide();
        }
    }
});

test('stone prompts prioritize inscriptions, confirm irreversible placement and open read-only text', async () => {
    const ui = setup();
    const tabletData = { id: 'tablet', type: 'preparedTablet', isNew: false,
        ownerId: 'foreign', author: 'Alchemist Stone', entries: [{ text: '<b>Stone words</b>', strikes: [] }] };
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [tabletData] });
    const stones = { nearest: { stoneId: `stone-${'a'.repeat(32)}`, position: [1, 0, 0], occupied: false },
        preparedTablet: ui.inventory.items[0] };
    const loot = { nearest: { id: 'nearby-drop' } };
    const getComponent = ui.player.GetCompnentByType.bind(ui.player);
    ui.player.GetCompnentByType = type => type === ui.StoneInscriptions ? stones :
        type === ui.LootDrops ? loot : getComponent(type);
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.DisplayerManager.initialize(windows);
    const prompt = windows.DisplayerManager.displayerByType(ui.InscriptionDisplayer);
    windows.WindowManager.windowByType(ui.MainMenuWindow).hide();
    const pickup = windows.DisplayerManager.displayerByType(ui.PickupDisplayer);
    pickup.enable();
    prompt.enable();
    assert.equal(prompt.visible, true);
    assert.equal(pickup.target, null);
    const calls = [];
    ui.connection.request = async (command, fields) => {
        calls.push({ command, ...fields });
        return command === 'readInscription' ? tabletData : undefined;
    };
    const pressE = async () => {
        ui.document.dispatchEvent({ type: 'keydown', key: 'e', code: 'KeyE', repeat: false });
        ui.document.dispatchEvent({ type: 'keyup', key: 'e', code: 'KeyE' });
        await Promise.resolve();
        await Promise.resolve();
    };
    await pressE();
    const dialog = windows.WindowManager.windowByType(ui.TextDialogWindow);
    assert.equal(dialog.visible, true);
    assert.match(dialog.element.textContent, /Alchemist Stone/);
    assert.equal(calls.length, 0, 'placement needs confirmation');
    assert.equal(ui.connection.sent.some(message => message.command === 'pickup'), false);
    await dialog.element.querySelector('.text-dialog-actions').querySelectorAll('button')[1].onclick();
    assert.deepEqual(calls[0], { command: 'placeInscription', itemId: 'tablet', stoneId: stones.nearest.stoneId });
    stones.nearest.occupied = true;
    windows.WindowManager.windowByType(ui.MainMenuWindow).hide();
    await pressE();
    const reader = windows.WindowManager.windowByType(ui.ItemTextWindow);
    assert.equal(reader.visible, true);
    assert.match(reader.element.textContent, /<b>Stone words<\/b>/);
    assert.equal(reader.element.querySelectorAll('textarea').length, 0);
    await pressE();
    assert.equal(calls.filter(call => call.command === 'readInscription').length, 1,
        'E cannot interact again while a dialog blocks gameplay');
    reader.hide();
    windows.WindowManager.windowByType(ui.MainMenuWindow).hide();
    stones.nearest = null;
    await pressE();
    assert.deepEqual(structuredClone(ui.connection.sent.find(message => message.command === 'pickup')),
        { command: 'pickup', dropId: 'nearby-drop' });
    loot.nearest = null;
    const sentCount = ui.connection.sent.length;
    await pressE();
    assert.equal(ui.connection.sent.length, sentCount, 'E without a target does nothing');
    pickup.disable();
    prompt.disable();
    assert.throws(() => ui.input.getActionLabel('stoneInscription'), /not registered/);
});

test('stone state validates opaque identities, unique sites and finite unit surface normals', () => {
    const ui = setup();
    const site = { stoneId: `stone-${'a'.repeat(32)}`, position: [1, 2, 3], normal: [0, 0, 1], occupied: false };
    assert.equal(ui.StoneInscriptions.validate([site]), true);
    for (const invalid of [[site, site], [{ ...site, position: [NaN, 0, 0] }],
        [{ ...site, normal: [0, 0, 0] }], [{ ...site, stoneId: '0:0' }], [{ ...site, occupied: 'yes' }]])
        assert.equal(ui.StoneInscriptions.validate(invalid), false);
});

test('several prepared tablets offer a filtered choice and place only the selected writing', async () => {
    const ui = setup();
    const first = { id: 'first', type: 'preparedTablet', isNew: false, ownerId: 'one',
        author: 'Alchemist One', entries: [{ text: 'First inscription', strikes: [] }] };
    const second = { ...first, id: 'second', ownerId: 'two', author: 'Alchemist Two',
        entries: [{ text: 'Second inscription', strikes: [] }] };
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [journal(false), first, second,
        { id: 'raw', type: 'emeraldTablets', isNew: false }] });
    const stones = { nearest: { stoneId: `stone-${'a'.repeat(32)}`, occupied: false } };
    const getComponent = ui.player.GetCompnentByType.bind(ui.player);
    ui.player.GetCompnentByType = type => type === ui.StoneInscriptions ? stones : getComponent(type);
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.DisplayerManager.initialize(windows);
    const menu = windows.WindowManager.windowByType(ui.MainMenuWindow);
    menu.hide();
    const prompt = windows.DisplayerManager.displayerByType(ui.InscriptionDisplayer);
    prompt.enable();
    const calls = [];
    ui.connection.request = async (command, fields) => calls.push({ command, ...fields });
    await prompt.interact(stones.nearest);
    const picker = windows.WindowManager.windowByType(ui.ItemPickerWindow);
    const dialog = windows.WindowManager.windowByType(ui.TextDialogWindow);
    assert.equal(picker.visible, true);
    assert.equal(dialog.visible, false);
    assert.equal(picker.element.querySelectorAll('.picker-item').length, 2);
    assert.match(picker.element.querySelector('h1').textContent, /Wybierz tablic/);
    picker.element.querySelectorAll('.picker-item')[1].dispatchEvent({ type: 'mouseenter' });
    assert.match(ui.document.getElementById('universal-tooltip').textContent, /Second inscription/);
    picker.element.querySelectorAll('.picker-item')[1].onclick();
    assert.equal(picker.visible, false);
    assert.equal(dialog.visible, true);
    assert.match(dialog.element.textContent, /Alchemist Two/);
    assert.equal(ui.input.blocked, 1, 'selection transitions directly to confirmation without resuming gameplay');
    assert.equal(calls.length, 0);
    await dialog.element.querySelector('.text-dialog-actions').querySelectorAll('button')[1].onclick();
    assert.deepEqual(calls, [{ command: 'placeInscription', stoneId: stones.nearest.stoneId, itemId: 'second' }]);
    menu.hide();
    await prompt.interact(stones.nearest);
    picker.hide();
    assert.equal(ui.input.blocked, 0);
    assert.equal(calls.length, 1, 'canceling the choice does not place another tablet');
    prompt.disable();
});

function pick(ui, windows, crafting, slot, index = 0) {
    crafting.element.querySelector(slot).onclick();
    const picker = windows.WindowManager.windowByType(ui.ItemPickerWindow);
    assert.equal(picker.visible, true);
    picker.element.querySelectorAll('.picker-item')[index].onclick();
    assert.equal(crafting.visible, true);
}

test('Server snapshots retain item identities, update journals, reconcile parents and never duplicate additions', () => {
    const ui = setup();
    const added = [];
    ui.inventory.EventManager.addEventListener(ui.Inventory.ADDED, (event, item) => added.push(item));
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [journal()] });
    const item = ui.inventory.items[0];
    assert.equal(item.ownerId, ui.connection.playerId);
    assert.equal(item.actor.parent, ui.player);
    assert.equal(item.serverId, 'journal-1');
    assert.equal(added.length, 1);
    const next = journal(false);
    next.entries = [{ text: '<script>literal</script>', strikes: [[0, 8]] }];
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [next] });
    assert.equal(ui.inventory.items[0], item);
    assert.equal(item.isNew, false);
    assert.equal(item.entries[0].text, '<script>literal</script>');
    assert.equal(added.length, 1);
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [] });
    assert.equal(ui.inventory.items.length, 0);
    assert.equal(item.actor.parent, null);
    assert.equal(ui.scene.actors.length, 1);
    ui.synchronization.onDisable();
});

test('New indicator and popup are universal for inventory additions and seen is server-commanded', async () => {
    const ui = setup();
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.DisplayerManager.initialize(windows);
    const notifications = windows.DisplayerManager.displayerByType(ui.InventoryNotifications);
    notifications.enable();
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [journal()] });
    assert.equal(notifications.element.children.length, 1);
    assert.match(notifications.element.textContent, /Dodano do ekwipunku/);
    windows.WindowManager.windowByType(ui.MainMenuWindow).openDialog(ui.InventoryWindow);
    const button = windows.WindowManager.windowByType(ui.InventoryWindow).element.querySelector('.inventory-item');
    assert.equal(button.classList.contains('inventory-item-new'), true);
    button.dispatchEvent({ type: 'mouseenter' });
    assert.deepEqual(structuredClone(ui.connection.sent.at(-1)), { command: 'inventorySeen', itemId: 'journal-1' });
    assert.equal(button.classList.contains('inventory-item-new'), true, 'seen does not succeed optimistically before server commit');
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [journal(false)] });
    assert.equal(windows.WindowManager.windowByType(ui.InventoryWindow).element.querySelector('.inventory-item'),
        button, 'seen updates preserve the hovered icon and its tooltip');
    assert.equal(windows.WindowManager.windowByType(ui.InventoryWindow).element.querySelector('.inventory-item')
        .classList.contains('inventory-item-new'), false);
    assert.equal(notifications.element.children.length, 1);
    const local = new ui.Actor('local', [new ui.InventoryItem('item.resin')]);
    local.onInitialize();
    local.parent = ui.player;
    assert.equal(notifications.element.children.length, 1, 'generic hierarchy additions wait in the same notification queue');
    notifications.disable();
    assert.equal(ui.timers.size, 0);
    assert.equal(notifications.element.children.length, 0);
});

test('Foreign journal opens the ordinary reader with literal text and strikes, never the editor', async () => {
    const ui = setup();
    const data = journal();
    data.ownerId = 'another-alchemist';
    data.entries = [{ text: '<img>Recovered writing', strikes: [[5, 14]] }];
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [data] });
    const item = ui.inventory.items[0];
    assert.equal(item.writable, false);
    assert.throws(() => item.append('Forgery'), /owner/);
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    const editor = windows.WindowManager.windowByType(ui.JournalWindow);
    windows.WindowManager.windowByType(ui.ItemTextWindow).show({
        titleId: 'item.emeraldTablets.name', textId: 'item.emeraldTablets.text', theme: 'emerald'
    });

    windows.WindowManager.windowByType(ui.MainMenuWindow).openDialog(ui.InventoryWindow);
    await ui.inventory.use(item, { windows: windows.WindowManager });
    const reader = windows.WindowManager.windowByType(ui.ItemTextWindow);
    assert.equal(editor.visible, false);
    assert.equal(reader.visible, true);
    assert.equal(reader.element.classList.contains('emerald-theme'), false);
    assert.equal(reader.element.querySelector('#journal-draft'), null);
    assert.equal(reader.element.querySelector('.journal-entry').textContent, '<img>Recovered writing');
    assert.equal(reader.element.querySelector('s').textContent, 'Recovered');
    assert.equal(reader.element.querySelector('img'), null);
    assert.equal(reader.element.querySelector('.journal-reader-author').textContent, 'Autor: Alchemist Test');
    assert.doesNotMatch(reader.element.textContent, /Możesz czytać|zmieniać tego dziennika/);
    ui.localization.setLanguage('en');
    assert.equal(reader.element.querySelector('.journal-entry').textContent, '<img>Recovered writing');
    assert.equal(reader.element.querySelector('.journal-reader-author').textContent, 'Author: Alchemist Test');
    assert.doesNotMatch(reader.element.textContent, /can read|cannot modify|cannot change/);
    reader.hide();
    assert.equal(windows.WindowManager.windowByType(ui.InventoryWindow).visible, true);
});

test('Inscribed emerald tablets preserve literal writing, strikes and author in the emerald reader', async () => {
    const ui = setup();
    const tablet = {
        ...journal(false), id: 'preserved-tablet', type: 'emeraldTablets', burnable: false,
        entries: [{ text: '<img>preserved ink', strikes: [[5, 14]] }, { text: 'Second entry', strikes: [] }]
    };
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [
        tablet, { id: 'salt', type: 'salSmaragdinum', isNew: false }
    ] });
    const item = ui.inventory.items[0];
    assert.equal(item.author, tablet.author);
    assert.equal(item.authorId, '');
    assert.equal(item.burnable, false);
    assert.equal(item instanceof ui.AlchemistJournal, false);
    assert.deepEqual(structuredClone(item.entries), tablet.entries);
    assert.equal(ui.inventory.items[1].name, 'Sal Smaragdinum');
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.WindowManager.windowByType(ui.MainMenuWindow).openDialog(ui.InventoryWindow);
    await ui.inventory.use(item, { windows: windows.WindowManager });
    const reader = windows.WindowManager.windowByType(ui.ItemTextWindow);
    assert.equal(reader.visible, true);
    assert.equal(reader.element.classList.contains('emerald-theme'), true);
    assert.match(reader.element.querySelector('.journal-reader-author').textContent, /Alchemist Test/);
    assert.equal(reader.element.querySelectorAll('.journal-entry').length, 2);
    assert.equal(reader.element.querySelector('.journal-entry').textContent, tablet.entries[0].text);
    assert.equal(reader.element.querySelector('s').textContent, 'preserved');
    assert.equal(reader.element.querySelector('img'), null);
    assert.equal(windows.WindowManager.windowByType(ui.JournalWindow).visible, false);
    ui.localization.setLanguage('en');
    assert.equal(reader.element.querySelector('#item-text-title').textContent, 'Emerald Tablets');
    assert.equal(reader.element.querySelector('.journal-entry').textContent, tablet.entries[0].text);
    const malformed = { ...tablet, entries: [{ text: 'ink', strikes: [[0, 99]] }] };
    assert.throws(() => ui.ServerInventory.validate([malformed]), /entries/);
    assert.throws(() => ui.ServerInventory.validate([{ ...tablet, author: undefined }]), /owner/);
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [tablet] });
    assert.equal(ui.inventory.items[0], item);
});

test('Journal writing uses in-world language in both languages without changing server ownership rules', async () => {
    const ui = setup();
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [journal(false)] });
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    const editor = windows.WindowManager.windowByType(ui.JournalWindow);
    editor.show({ journal: ui.inventory.items[0] });
    assert.match(editor.element.textContent, /Atrament pozostawia trwały ślad/);
    assert.equal(editor.element.querySelector('.journal-append').textContent, 'Zapisz na kartach');
    assert.equal(editor.element.querySelector('.journal-append').disabled, false);
    assert.doesNotMatch(editor.element.textContent, /serwer|Zatwierdź|zatwierdzonych/i);
    ui.localization.setLanguage('en');
    assert.match(editor.element.textContent, /Ink leaves a lasting trace/);
    assert.equal(editor.element.querySelector('.journal-append').textContent, 'Inscribe on the pages');
    assert.doesNotMatch(editor.element.textContent, /server|commit|read.only/i);
});

test('Interaction displayer supports another target/action and cleans its InputManager binding', async () => {
    const ui = setup();
    let target = { id: 'altar' };
    const interacted = [];
    class AltarInteraction extends ui.InteractionDisplayer {
        static ACTION = 'altar';
        static KEY_CODE = 'KeyF';
        static KEY_LABEL = 'F';
        static LABEL_ID = 'inventory.read';
        get target() { return target; }
        interact(value) { interacted.push(value.id); }
    }
    const prompt = new AltarInteraction('altar', 'altar-prompt', false);
    prompt.initialize();
    prompt.enable();
    assert.equal(prompt.visible, true);
    assert.equal(prompt.element.querySelector('.input-icon').textContent, 'F');
    ui.document.dispatchEvent({ type: 'keydown', key: 'f', code: 'KeyF', repeat: false });
    ui.document.dispatchEvent({ type: 'keyup', key: 'f', code: 'KeyF' });
    await Promise.resolve();
    assert.deepEqual(interacted, ['altar']);
    target = null;
    prompt.refresh();
    assert.equal(prompt.visible, false);
    prompt.disable();
    assert.throws(() => ui.scene.InputManager.getActionLabel('altar'), /Unknown|not bound|not registered/i);
});

test('Starter items do not notify, while the same item picked up later does', async () => {
    const ui = setup();
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.DisplayerManager.initialize(windows);
    const notifications = windows.DisplayerManager.displayerByType(ui.InventoryNotifications);
    notifications.enable();
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [journal(false)] });
    assert.equal(notifications.element.children.length, 0);
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [] });
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [journal(true)] });
    assert.equal(notifications.element.children.length, 1);
    notifications.disable();
});

test('Drop waits for server commit and inventory no longer has a separate burn action', async () => {
    const ui = setup();
    const tablet = { id: 'tablet', type: 'emeraldTablets', isNew: false, burnable: false };
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [journal(false), tablet] });
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.WindowManager.windowByType(ui.MainMenuWindow).openDialog(ui.InventoryWindow);
    const inventoryWindow = windows.WindowManager.windowByType(ui.InventoryWindow);
    const entries = inventoryWindow.element.querySelectorAll('.inventory-entry');
    assert.equal(entries[1].querySelectorAll('.inventory-action').length, 0);
    entries[0].querySelector('.inventory-item').dispatchEvent({ type: 'contextmenu', preventDefault() {} });
    const actions = windows.WindowManager.windowByType(ui.TextDialogWindow);
    assert.equal(actions.visible, true);
    assert.match(actions.element.querySelector('.text-dialog-subject').textContent, /Alchemist Test/);
    const calls = [];
    let acknowledge;
    ui.connection.request = (command, payload) => {
        calls.push({ command, ...payload });
        return new Promise(resolve => acknowledge = resolve);
    };
    const drop = actions.element.querySelector('.text-dialog-actions').querySelectorAll('button')[1].onclick();
    assert.equal(ui.inventory.items.length, 2, 'no optimistic item removal');
    assert.deepEqual(calls[0], { command: 'inventoryDrop', itemId: 'journal-1' });
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [tablet] });
    acknowledge();
    await drop;
    assert.equal(inventoryWindow.visible, true);
    inventoryWindow.element.querySelector('.inventory-item').dispatchEvent({
        type: 'keydown', key: 'F10', shiftKey: true, preventDefault() {}, stopPropagation() {}
    });
    assert.equal(actions.visible, true);
    assert.match(actions.element.querySelector('.text-dialog-subject').textContent, /Anonimowy/);
});

test('Unified inventory keeps own journal first, then foreign journals, other writings and resources across snapshots', async () => {
    const ui = setup();
    const own = journal(false);
    const foreign = { ...journal(), id: 'foreign', ownerId: 'other', author: 'Another alchemist' };
    const resource = { id: 'sample', type: 'ash', isNew: false };
    const tablet = { id: 'tablet', type: 'emeraldTablets', isNew: false };
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [resource, tablet, foreign, own] });
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.WindowManager.windowByType(ui.MainMenuWindow).openDialog(ui.InventoryWindow);
    const inventory = windows.WindowManager.windowByType(ui.InventoryWindow);
    assert.deepEqual(structuredClone(ui.inventory.orderedItems.map(item => item.serverId)), ['journal-1', 'foreign', 'tablet', 'sample']);
    const cards = inventory.element.querySelectorAll('.inventory-entry');
    assert.match(cards[0].querySelector('.inventory-item').getAttribute('aria-label'), /Alchemist Test/);
    assert.match(cards[1].querySelector('.inventory-item').getAttribute('aria-label'), /Another alchemist/);
    assert.equal(cards[0].querySelector('.inventory-own-journal') !== null, true);
    assert.equal(cards[1].querySelector('.inventory-own-journal'), null);
    assert.equal(cards[3].querySelector('.inventory-item-icon') !== null, true);
    assert.equal(inventory.element.querySelector('.inventory-section'), null);
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [resource, foreign, own] });
    assert.deepEqual(structuredClone(ui.inventory.orderedItems.map(item => item.serverId)), ['journal-1', 'foreign', 'sample']);
});

test('Crafting enforces two items or one item plus an element, removes unavailable selections and resets on disconnect', async () => {
    const ui = setup();
    const samples = ['ash', 'water', 'lye'].map((type, index) => ({ id: `sample-${index}`, type, isNew: false }));
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: samples });
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    const craft = windows.WindowManager.windowByType(ui.CraftingWindow);
    craft.show();
    pick(ui, windows, craft, '.craft-slot-first');
    pick(ui, windows, craft, '.craft-slot-second');
    assert.equal(craft.element.querySelector('.craft-combine').disabled, false);
    craft.element.querySelector('.craft-air').onclick();
    assert.equal(craft.element.querySelector('.craft-slot-second').getAttribute('aria-label'), 'Powietrze');
    craft.element.querySelector('.craft-air').onclick();
    assert.equal(craft.element.querySelector('.craft-combine').disabled, true);
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: samples.slice(1) });
    assert.equal(craft.element.querySelector('.craft-slot-first').textContent, '+');
    pick(ui, windows, craft, '.craft-slot-first');
    ui.window.dispatchEvent({ type: 'worldcleared' });
    assert.equal(craft.element.querySelector('.craft-combine').disabled, true);
    assert.equal(craft.element.querySelector('.craft-result').hidden, true);
});

test('Crafting runs immediately, reports failures inline and clears on close without losing picker selections', async () => {
    const ui = setup();
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [journal(false)] });
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    const menu = windows.WindowManager.windowByType(ui.MainMenuWindow);
    menu.openDialog(ui.InventoryWindow);
    const inventoryWindow = windows.WindowManager.windowByType(ui.InventoryWindow);
    inventoryWindow.element.querySelector('.inventory-craft').onclick();
    const crafting = windows.WindowManager.windowByType(ui.CraftingWindow);
    pick(ui, windows, crafting, '.craft-slot-first');
    crafting.element.querySelector('.craft-fire').onclick();
    const confirmation = windows.WindowManager.windowByType(ui.TextDialogWindow);
    ui.connection.request = () => Promise.reject(new Error('Storage unavailable'));
    await crafting.element.querySelector('.craft-combine').onclick();
    assert.equal(ui.inventory.items.length, 1);
    assert.match(crafting.element.querySelector('.craft-error').textContent, /Storage unavailable/);
    assert.equal(crafting.element.querySelector('.craft-error').hidden, false);
    assert.equal(confirmation.visible, false);
    const ash = { id: 'ash-1', type: 'ash', isNew: true, burnable: false };
    ui.connection.request = async (command, payload) => {
        assert.equal(command, 'craft');
        assert.deepEqual(structuredClone(payload), { itemIds: ['journal-1'], element: 'fire' });
        ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [ash] });
        return { outcome: 'ashes' };
    };
    await crafting.element.querySelector('.craft-combine').onclick();
    assert.equal(confirmation.visible, false);
    assert.equal(crafting.visible, true);
    assert.match(crafting.element.querySelector('.craft-result').textContent, /popiół/);
    assert.equal(crafting.element.querySelector('.craft-result').hidden, false);
    assert.equal(crafting.element.querySelector('.craft-core').hidden, true);
    assert.equal(crafting.element.querySelector('.craft-result').parentNode,
        crafting.element.querySelector('.craft-elements'));
    crafting.element.querySelector('.craft-result-dismiss').onclick();
    assert.equal(crafting.element.querySelector('.craft-result').hidden, true);
    assert.equal(crafting.element.querySelector('.craft-core').hidden, false);
    assert.equal(crafting.element.querySelector('.craft-slot-first').textContent, '+');
    assert.equal(crafting.element.querySelector('.craft-combine').disabled, true);
    assert.equal(ui.timers.size, 0, 'dismissing the result cancels its expiry timer');
    pick(ui, windows, crafting, '.craft-slot-first');
    assert.equal(crafting.element.querySelector('.craft-slot-first').getAttribute('aria-label'), 'Popiół');
    const ashItem = ui.inventory.items.find(item => item.serverId === 'ash-1');
    assert.equal(ashItem.nameId, 'item.ash.name');
    assert.equal(ashItem.icon, ui.game.ResourceManager.get('item.ash').icon);
    assert.equal(ashItem.burnable, false);
    crafting.hide();
    assert.equal(inventoryWindow.visible, true);
    assert.equal(ui.timers.size, 0, 'closing crafting clears the popup timer');
    inventoryWindow.element.querySelector('.inventory-craft').onclick();
    assert.equal(crafting.element.querySelector('.craft-result').hidden, true);
    assert.equal(crafting.element.querySelector('.craft-core').hidden, false);
    assert.equal(crafting.element.querySelector('.craft-slot-first').textContent, '+');
    assert.equal(crafting.element.querySelector('.craft-combine').disabled, true);
});

test('Closing crafting during a request ignores its late result after reopening', async () => {
    const ui = setup();
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [journal(false)] });
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    const menu = windows.WindowManager.windowByType(ui.MainMenuWindow);
    menu.openDialog(ui.CraftingWindow);
    const craft = windows.WindowManager.windowByType(ui.CraftingWindow);
    pick(ui, windows, craft, '.craft-slot-first');
    craft.element.querySelector('.craft-water').onclick();
    let acknowledge;
    ui.connection.request = () => new Promise(resolve => acknowledge = resolve);
    const pending = craft.element.querySelector('.craft-combine').onclick();
    craft.hide();
    menu.openDialog(ui.CraftingWindow);
    assert.equal(craft.element.querySelector('.craft-slot-first').textContent, '+');
    assert.equal(craft.element.querySelector('.craft-water').getAttribute('aria-pressed'), 'false');
    acknowledge({ outcome: 'dried' });
    await pending;
    assert.equal(craft.element.querySelector('.craft-result').hidden, true);
    assert.equal(craft.element.querySelector('.craft-error').hidden, true);
    assert.equal(ui.timers.size, 0);
    pick(ui, windows, craft, '.craft-slot-first');
    craft.element.querySelector('.craft-water').onclick();
    assert.equal(craft.element.querySelector('.craft-combine').disabled, false);
});

test('Two physical ingredients use no element and show only the server result after the inventory snapshot', async () => {
    const ui = setup();
    const inputs = [
        { id: 'ash', type: 'ash', isNew: false },
        { id: 'water', type: 'water', isNew: false }
    ];
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: inputs });
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.WindowManager.windowByType(ui.MainMenuWindow).openDialog(ui.InventoryWindow);
    windows.WindowManager.windowByType(ui.MainMenuWindow).openInventoryPage(ui.CraftingWindow);
    const crafting = windows.WindowManager.windowByType(ui.CraftingWindow);
    pick(ui, windows, crafting, '.craft-slot-first');
    pick(ui, windows, crafting, '.craft-slot-second');
    assert.equal(crafting.element.querySelector('.craft-result').hidden, true);
    let acknowledge;
    ui.connection.request = (command, payload) => {
        assert.equal(command, 'craft');
        assert.deepEqual(structuredClone(payload), { itemIds: ['ash', 'water'], element: null });
        return new Promise(resolve => acknowledge = resolve);
    };
    const pending = crafting.element.querySelector('.craft-combine').onclick();
    assert.equal(ui.inventory.items.length, 2);
    assert.equal(crafting.element.querySelector('.craft-combine').disabled, true);
    assert.equal(crafting.element.querySelector('.craft-slot-first').disabled, true);
    await crafting.element.querySelector('.craft-combine').onclick();
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [{ id: 'lye', type: 'lye', isNew: true }] });
    acknowledge({ outcome: 'lye' });
    await pending;
    assert.equal(crafting.visible, true);
    assert.equal(ui.inventory.items[0].name, 'Lixivium');
    assert.match(crafting.element.querySelector('.craft-result').textContent, /ług/);
    ui.localization.setLanguage('en');
    assert.match(crafting.element.querySelector('.craft-result').textContent, /Lye/);
    const [timerId, expire] = ui.timers.entries().next().value;
    ui.timers.delete(timerId);
    expire();
    assert.equal(crafting.element.querySelector('.craft-result').hidden, true);
    assert.equal(crafting.element.querySelector('.craft-core').hidden, false);
    assert.equal(ui.timers.size, 0);
});

test('Occupied slots clear directly and preserve the other ingredient, while empty slots open the picker', async () => {
    const ui = setup();
    const items = ['ash', 'water', 'lye'].map((type, index) => ({ id: `item-${index}`, type, isNew: false }));
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: items });
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    const menu = windows.WindowManager.windowByType(ui.MainMenuWindow);
    menu.openDialog(ui.CraftingWindow);
    const craft = windows.WindowManager.windowByType(ui.CraftingWindow);
    pick(ui, windows, craft, '.craft-slot-first');
    craft.element.querySelector('.craft-slot-second').onclick();
    const picker = windows.WindowManager.windowByType(ui.ItemPickerWindow);
    assert.equal(picker.element.querySelectorAll('.picker-item').length, 2);
    picker.element.querySelector('.dialog-close').onclick();
    assert.equal(craft.element.querySelector('.craft-combine').disabled, true);
    pick(ui, windows, craft, '.craft-slot-second');
    assert.equal(craft.element.querySelector('.craft-combine').disabled, false);
    const secondLabel = craft.element.querySelector('.craft-slot-second').getAttribute('aria-label');
    craft.element.querySelector('.craft-slot-first').onclick();
    assert.equal(craft.visible, true);
    assert.equal(picker.visible, false);
    assert.equal(craft.element.querySelector('.craft-slot-first').textContent, '+');
    assert.equal(craft.element.querySelector('.craft-slot-second').getAttribute('aria-label'), secondLabel);
    assert.equal(craft.element.querySelector('.craft-combine').disabled, true);
    craft.element.querySelector('.craft-slot-first').onclick();
    assert.equal(picker.element.querySelectorAll('.picker-item').length, 2);
    assert.equal(picker.element.querySelector('.picker-empty'), null);
    picker.element.querySelectorAll('.picker-item')[0].onclick();
    assert.equal(craft.element.querySelector('.craft-combine').disabled, false);
    craft.element.querySelector('.craft-slot-second').onclick();
    assert.equal(craft.element.querySelector('.craft-slot-second').textContent, '+');
    craft.element.querySelector('.craft-water').onclick();
    craft.element.querySelector('.craft-slot-second').onclick();
    assert.equal(craft.element.querySelector('.craft-water').getAttribute('aria-pressed'), 'false');
    assert.equal(picker.visible, false);
    craft.element.querySelector('.craft-slot-first').onclick();
    assert.equal(craft.element.querySelector('.craft-slot-second').disabled, true);
    assert.equal(ui.connection.sent.length, 0);
    craft.element.querySelector('.craft-slot-first').onclick();
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [] });
    assert.equal(picker.element.querySelectorAll('.picker-item').length, 0);
    picker.element.querySelector('.dialog-close').onclick();
    assert.equal(craft.element.querySelector('.craft-combine').disabled, true);
});

test('Crafting shortcut opens from gameplay through InputManager and menu alongside the compact inventory action', async () => {
    const ui = setup();
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.DisplayerManager.initialize(windows);
    const shortcut = windows.DisplayerManager.displayerByType(ui.CraftingDisplayer);
    shortcut.enable();
    const menu = windows.WindowManager.windowByType(ui.MainMenuWindow);
    const craft = windows.WindowManager.windowByType(ui.CraftingWindow);
    menu.element.querySelector('.main-menu-crafting').onclick();
    assert.equal(craft.visible, true);
    craft.hide();
    menu.hide();
    ui.document.querySelector('canvas').requestPointerLock = () => Promise.resolve();
    ui.document.dispatchEvent({ type: 'keydown', key: 'c', code: 'KeyC', repeat: false });
    ui.document.dispatchEvent({ type: 'keyup', key: 'c', code: 'KeyC' });
    assert.equal(craft.visible, true);
    assert.equal(menu.visible, false);
    assert.equal(ui.scene.InputManager.getActionLabel('crafting'), 'C');
    shortcut.element.onclick();
    assert.equal(craft.visible, false);
    assert.ok(windows.WindowManager.windowByType(ui.InventoryWindow).element.querySelector('.dialog-footer')
        .querySelector('.inventory-craft'));
    shortcut.disable();
    assert.throws(() => ui.scene.InputManager.getActionLabel('crafting'), /not registered/);
});

test('Text dialog accepts literal text and arbitrary actions, blocks duplicate clicks and ignores stale completions', async () => {
    const ui = setup();
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    const dialog = windows.WindowManager.windowByType(ui.TextDialogWindow);
    let calls = 0;
    let finish;
    dialog.show({
        title: 'Question', text: '<img src=x> Plain text',
        buttons: [{ label: 'Continue', action: () => { calls++; return new Promise(resolve => finish = resolve); } }]
    });
    assert.equal(dialog.element.querySelector('.text-dialog-message').textContent, '<img src=x> Plain text');
    assert.equal(dialog.element.querySelector('img'), null);
    const button = dialog.element.querySelector('.text-dialog-actions').querySelector('button');
    const pending = button.onclick();
    await button.onclick();
    assert.equal(calls, 1);
    assert.equal(button.disabled, true);
    dialog.hide();
    dialog.show({ title: 'Next', text: 'Another question', buttons: [{ label: 'Stay', close: false }] });
    finish();
    await pending;
    assert.equal(dialog.visible, true);
    assert.equal(dialog.element.querySelector('.text-dialog-message').textContent, 'Another question');
    await dialog.element.querySelector('.text-dialog-actions').querySelector('button').onclick();
    assert.equal(dialog.visible, true);
    dialog.show({ titleId: 'inventory.burn', textId: 'inventory.burnConfirm', parameters: { name: 'Test' },
        buttons: [{ labelId: 'ui.cancel' }] });
    ui.localization.setLanguage('en');
    assert.doesNotMatch(dialog.element.querySelector('.text-dialog-message').textContent, /ash/);
    assert.throws(() => dialog.show({ text: 'Missing title', buttons: [] }), /requires/);
});

test('Server-created ash uses universal acquisition popup, seen state and localized tooltip', async () => {
    const ui = setup();
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.DisplayerManager.initialize(windows);
    const notifications = windows.DisplayerManager.displayerByType(ui.InventoryNotifications);
    notifications.enable();
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [journal(false)] });
    const ash = { id: 'ash-1', type: 'ash', isNew: true, burnable: false };
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [ash] });
    assert.equal(ui.inventory.items.length, 1);
    assert.equal(notifications.element.children.length, 1);
    assert.match(notifications.element.textContent, /Popiół/);
    windows.WindowManager.windowByType(ui.MainMenuWindow).openDialog(ui.InventoryWindow);
    const icon = windows.WindowManager.windowByType(ui.InventoryWindow).element.querySelector('.inventory-item-icon');
    icon.getBoundingClientRect = () => ({ left: 10, bottom: 20 });
    const createElement = ui.document.createElement;
    ui.document.createElement = name => {
        const element = createElement(name);
        element.style = {};
        element.offsetWidth = 200;
        element.offsetHeight = 60;
        return element;
    };
    icon.dispatchEvent({ type: 'mouseenter' });
    assert.match(ui.document.querySelector('.universal-tooltip').textContent, /Popiół/);
    assert.deepEqual(structuredClone(ui.connection.sent.at(-1)), { command: 'inventorySeen', itemId: 'ash-1' });
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [{ ...ash, isNew: false }] });
    assert.equal(notifications.element.children.length, 1);
    notifications.disable();
});

test('Inventory notifications stagger arrivals by 350 ms, show up to five and expire individually', async () => {
    const ui = setup();
    let now = 0;
    let nextTimer = 0;
    const scheduled = new Map();
    ui.window.setTimeout = (callback, delay) => {
        scheduled.set(++nextTimer, { callback, at: now + delay });
        return nextTimer;
    };
    ui.window.clearTimeout = id => scheduled.delete(id);
    const advance = duration => {
        const end = now + duration;
        while (true) {
            const next = [...scheduled].sort((a, b) => a[1].at - b[1].at)[0];
            if (!next || next[1].at > end)
                break;
            now = next[1].at;
            scheduled.delete(next[0]);
            next[1].callback();
        }
        now = end;
    };
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.DisplayerManager.initialize(windows);
    const notifications = windows.DisplayerManager.displayerByType(ui.InventoryNotifications);
    notifications.enable();
    const types = ['resin', 'hardenedResin', 'ash', 'water', 'lye', 'bitumen', 'salSmaragdinum'];
    for (let index = 0; index < 7; index++) {
        const actor = new ui.Actor(`sample-${index}`, [new ui.InventoryItem(ui.ServerInventory.resourceID(types[index]))]);
        actor.onInitialize();
        actor.parent = ui.player;
    }
    assert.equal(notifications.element.children.length, 1);
    advance(349);
    assert.equal(notifications.element.children.length, 1);
    advance(1);
    assert.equal(notifications.element.children.length, 2);
    for (let index = 2; index < 5; index++) {
        advance(350);
        assert.equal(notifications.element.children.length, index + 1);
    }
    advance(3599);
    assert.equal(notifications.element.children.length, 5);
    assert.match(notifications.element.textContent, /Żywica/);
    advance(1);
    assert.equal(notifications.element.children.length, 5);
    assert.doesNotMatch(notifications.element.textContent, /Żywica/);
    assert.match(notifications.element.textContent, /Stwardniała żywica/);
    assert.match(notifications.element.textContent, /Bitumen/);
    assert.doesNotMatch(notifications.element.textContent, /Sal Smaragdinum/);
    advance(350);
    assert.equal(notifications.element.children.length, 5);
    assert.doesNotMatch(notifications.element.textContent, /Stwardniała żywica/);
    assert.match(notifications.element.textContent, /Sal Smaragdinum/);
    advance(5000);
    assert.equal(notifications.element.children.length, 0);
    const next = new ui.Actor('next', [new ui.InventoryItem('item.speed-potion')]);
    next.onInitialize();
    next.parent = ui.player;
    assert.match(notifications.element.textContent, /Mikstura rączego kroku/);
    notifications.disable();
    assert.equal(scheduled.size, 0);
    advance(10000);
    assert.equal(notifications.element.children.length, 0);
    assert.equal(ui.timers.size, 0);
});

test('Rejected journal operation preserves draft and old text until an acknowledged snapshot', async () => {
    const ui = setup();
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [journal()] });
    const item = ui.inventory.items[0];
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    const editor = windows.WindowManager.windowByType(ui.JournalWindow);
    editor.show({ journal: item });
    const draft = editor.element.querySelector('#journal-draft');
    draft.value = 'Uncommitted text';
    ui.connection.request = () => Promise.reject(new Error('Disk write failed'));
    await editor.element.querySelector('.journal-append').onclick();
    assert.equal(draft.value, 'Uncommitted text');
    assert.equal(item.entries.length, 0);
    assert.equal(editor.element.querySelector('.journal-error').hidden, false);
    assert.match(editor.element.querySelector('.journal-error').textContent, /Disk write failed/);
});

test('Malformed inventory does not partially mutate the existing hierarchy', () => {
    const ui = setup();
    ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [journal()] });
    assert.throws(() => ui.window.dispatchEvent({ type: 'inventoryreceived', detail: [journal(), journal()] }), /duplicate/);
    assert.equal(ui.inventory.items.length, 1);
    assert.throws(() => ui.ServerInventory.validate([{ ...journal(), entries: [{ text: 'bad\u0000', strikes: [] }] }]), /entries/);
    ui.window.dispatchEvent({ type: 'worldcleared' });
    assert.equal(ui.inventory.items.length, 0);
});

test('Dropped inventory state validates IDs, counts and distance for pickup', () => {
    const ui = setup();
    assert.equal(ui.LootDrops.validate([{ id: 'drop', position: [0, 0, 0], count: 1 }]), true);
    assert.equal(ui.LootDrops.validate([{ id: 'drop', position: [0, 0, NaN], count: 1 }]), false);
    assert.equal(ui.LootDrops.validate([{ id: 'drop', position: [0, 0, 0], count: 0 }]), false);
    const drops = new ui.LootDrops(null);
    ui.connection.state = { drops: [
        { id: 'far', position: [6.01, 0, 0], count: 1 },
        { id: 'near', position: [5.99, 0, 0], count: 2 }
    ] };
    assert.equal(drops.nearest.id, 'near');
    ui.connection.state = null;
    assert.equal(drops.nearest, null);
});
