const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadUi } = require('./helpers/ui-context');

function setup() {
    const ui = loadUi();
    const inventory = new ui.Inventory();
    const player = new ui.Actor('player', [inventory]);
    ui.scene.actors.push(player);
    player.onInitialize();
    player.onEnable();
    return { ...ui, player, inventory };
}

function addItem(ui, component, id = 'item', parent = ui.player) {
    const actor = new ui.Actor(id, [component]);
    actor.onInitialize();
    actor.parent = parent;
    ui.scene.actors.push(actor);
    return actor;
}

test('Inventory gathers descendant item components, not loose items or items on its owner', () => {
    const ui = setup();
    const loose = new ui.Actor('loose', [new ui.InventoryItem('Loose')]);
    loose.onInitialize();
    ui.scene.actors.push(loose);
    const bag = new ui.Actor('bag');
    bag.parent = ui.player;
    const first = new ui.InventoryItem('First');
    const second = new ui.InventoryItem('Second');
    addItem(ui, first, 'first');
    addItem(ui, second, 'second', bag);
    assert.deepEqual([...ui.inventory.items], [second, first]);
    ui.inventory.items.length = 0;
    ui.player.children.length = 0;
    assert.equal(ui.inventory.items.length, 2);
    const ownerItem = new ui.InventoryItem('Owner');
    const owner = new ui.Actor('owner', [new ui.Inventory(), ownerItem]);
    owner.onInitialize();
    assert.equal(owner.GetCompnentByType(ui.Inventory).items.length, 0);
});

test('Reparenting, detaching and destroying update inventory without stale or duplicate items', () => {
    const ui = setup();
    let changes = 0;
    ui.inventory.EventManager.addEventListener(ui.Inventory.CHANGED, () => changes++);
    const item = new ui.InventoryItem('Test');
    const actor = addItem(ui, item);
    assert.equal(changes, 1);
    actor.parent = ui.player;
    assert.equal(changes, 1);
    actor.parent = null;
    assert.equal(ui.inventory.items.length, 0);
    actor.parent = ui.player;
    actor.onDestroy();
    assert.equal(ui.inventory.items.length, 0);
    assert.equal(ui.player.children.length, 0);
    const bag = new ui.Actor('bag');
    bag.parent = ui.player;
    addItem(ui, new ui.InventoryItem('Nested'), 'nested', bag);
    bag.onDestroy();
    assert.equal(ui.inventory.items.length, 0);
    ui.player.onDisable();
    const before = changes;
    actor.parent = ui.player;
    assert.equal(changes, before);
});

test('Parent links reject cycles atomically and event listeners can unsubscribe during dispatch', () => {
    const ui = setup();
    const child = new ui.Actor('child');
    child.parent = ui.player;
    assert.throws(() => { ui.player.parent = child; }, /cycle/);
    assert.throws(() => { child.parent = child; }, /cycle/);
    assert.throws(() => { child.parent = {}; }, /Actor or null/);
    assert.equal(child.parent, ui.player);
    assert.equal(ui.player.children.length, 1);
    const events = new ui.EventManager();
    const calls = [];
    const first = () => { calls.push(1); events.removeEventListener('test', first); };
    events.addEventListener('test', first);
    events.addEventListener('test', () => calls.push(2));
    events.riseEvent('test');
    events.riseEvent('test');
    assert.deepEqual(calls, [1, 2, 2]);
});

test('Usable items dispatch their own action only while belonging to the inventory', () => {
    const ui = setup();
    let used = 0;
    class TestItem extends ui.InventoryItemWithUse {
        onUse(context) {
            assert.equal(context.inventory, ui.inventory);
            assert.equal(context.value, 42);
            return ++used;
        }
    }
    const item = new TestItem('Test');
    const actor = addItem(ui, item);
    assert.equal(ui.inventory.use(item, { value: 42 }), 1);
    actor.parent = null;
    assert.throws(() => ui.inventory.use(item), /own usable items/);
    assert.throws(() => item.use({ inventory: ui.inventory }), /belonging/);
    assert.throws(() => ui.inventory.use(new ui.InventoryItem('Plain')), /own usable items/);
    const abstract = new ui.InventoryItemWithUse('Abstract');
    addItem(ui, abstract, 'abstract');
    assert.throws(() => ui.inventory.use(abstract), /implement onUse/);
    assert.equal(used, 1);
});

test('Inventory UI opens Emerald Tablets text, localizes it and preserves menu/input behavior', async () => {
    const ui = setup();
    const table = readFileSync(path.join(__dirname, '..', 'src', 'game', 'resources', 'localization', 'localization.json'), 'utf8');
    ui.localization.register(JSON.parse(table));
    ui.localization.setLanguage('pl');
    const item = new ui.EmeraldTablets();
    addItem(ui, item);
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    const menu = windows.WindowManager.windowByType(ui.MainMenuWindow);
    menu.element.querySelector('.main-menu-inventory').click();
    const inventoryWindow = windows.WindowManager.windowByType(ui.InventoryWindow);
    const textWindow = windows.WindowManager.windowByType(ui.ItemTextWindow);
    const button = inventoryWindow.element.querySelector('.inventory-item');
    assert.equal(button.querySelector('.inventory-item-name').textContent, 'Szmaragdowe Tablice');
    assert.equal(button.querySelector('.inventory-item-author').textContent, 'Anonimowy alchemik');
    button.click();
    assert.equal(inventoryWindow.visible, false);
    assert.equal(textWindow.visible, true);
    assert.equal(textWindow.element.classList.contains('emerald-theme'), true);
    assert.match(textWindow.element.querySelector('.item-text').textContent, /wędrownego alchemika/);
    assert.equal(ui.inventory.items.length, 1);
    assert.equal(ui.input.blocked, 1);
    ui.localization.setLanguage('en');
    assert.equal(textWindow.element.querySelector('#item-text-title').textContent, 'Emerald Tablets');
    assert.match(textWindow.element.querySelector('.item-text').textContent, /wandering alchemist/);
    ui.document.dispatchEvent({ type: 'keydown', key: 'Escape' });
    assert.equal(textWindow.visible, false);
    assert.equal(inventoryWindow.visible, true);
    assert.equal(menu.visible, true);
    assert.equal(ui.input.blocked, 1);
    menu.clear();
});

test('Journal shortcut opens directly, toggles closed, returns to inventory when opened there and unbinds', async () => {
    const ui = setup();
    const journal = new ui.AlchemistJournal(ui.AlchemistJournal.LOCAL_OWNER_ID);
    addItem(ui, journal);
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.DisplayerManager.initialize(windows);
    const shortcut = windows.DisplayerManager.displayerByType(ui.JournalDisplayer);
    shortcut.enable();
    const menu = windows.WindowManager.windowByType(ui.MainMenuWindow);
    const editor = windows.WindowManager.windowByType(ui.JournalWindow);
    const inventory = windows.WindowManager.windowByType(ui.InventoryWindow);
    const canvas = ui.document.querySelector('canvas');
    canvas.requestPointerLock = () => Promise.resolve();
    ui.document.exitPointerLock = () => {
        ui.document.pointerLockElement = null;
        ui.document.dispatchEvent({ type: 'pointerlockchange' });
    };
    const press = (repeat = false) => ui.document.dispatchEvent({
        type: 'keydown', key: 'j', code: 'KeyJ', repeat, preventDefault() {}
    });
    assert.equal(shortcut.element.querySelector('.input-icon').textContent, 'J');
    press();
    assert.equal(editor.visible, false);
    menu.play();
    press();
    assert.equal(editor.visible, true);
    assert.equal(menu.visible, false);
    assert.equal(inventory.visible, false);
    assert.equal(ui.input.blocked, 1);
    press(true);
    assert.equal(editor.visible, true);
    press();
    assert.equal(editor.visible, false);
    assert.equal(ui.input.blocked, 0);
    shortcut.element.click();
    assert.equal(editor.visible, true);
    editor.element.querySelector('.dialog-close').click();
    assert.equal(ui.input.blocked, 0);
    menu.toggleGameInventory();
    press();
    assert.equal(editor.visible, true);
    assert.equal(inventory.visible, false);
    editor.element.querySelector('.dialog-close').click();
    assert.equal(inventory.visible, true);
    assert.equal(ui.input.blocked, 1);
    inventory.element.querySelector('.dialog-close').click();
    assert.equal(ui.input.blocked, 0);
    shortcut.disable();
    assert.throws(() => ui.input.getActionLabel('journal'), /not registered/);
    press();
    assert.equal(editor.visible, false);
});

test('Emerald reader theme resets for other writings', async () => {
    const ui = setup();
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    const reader = windows.WindowManager.windowByType(ui.ItemTextWindow);
    reader.show({ titleId: 'item.emeraldTablets.name', textId: 'item.emeraldTablets.text', theme: 'emerald' });
    assert.equal(reader.element.classList.contains('emerald-theme'), true);
    reader.show({ titleId: 'journal.title', textId: 'journal.hint' });
    assert.equal(reader.element.classList.contains('emerald-theme'), false);
});

test('Open inventory updates on hierarchy changes and reports failed actions visibly', async () => {
    const ui = setup();
    ui.localization.register(JSON.parse(readFileSync(path.join(__dirname, '..', 'src', 'game', 'resources', 'localization', 'localization.json'), 'utf8')));
    ui.localization.setLanguage('pl');
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    const menu = windows.WindowManager.windowByType(ui.MainMenuWindow);
    menu.openDialog(ui.InventoryWindow);
    const inventoryWindow = windows.WindowManager.windowByType(ui.InventoryWindow);
    assert.match(inventoryWindow.element.textContent, /pusty/);
    class BrokenItem extends ui.InventoryItemWithUse {
        onUse() { throw new Error('test failure'); }
    }
    const actor = addItem(ui, new BrokenItem('Broken'));
    const button = inventoryWindow.element.querySelector('.inventory-item');
    await button.onclick();
    const error = inventoryWindow.element.querySelector('.inventory-error');
    assert.equal(error.hidden, false);
    assert.match(error.textContent, /test failure/);
    assert.equal(ui.errors.length, 1);
    actor.parent = null;
    assert.equal(inventoryWindow.element.querySelector('.inventory-item'), null);
    assert.match(inventoryWindow.element.textContent, /pusty/);
    menu.hide();
    actor.parent = ui.player;
    assert.equal(inventoryWindow.element.querySelector('.inventory-item'), null);
});

test('Inventory separates writings with authors from Latin items in both UI languages', async () => {
    const ui = setup();
    ui.localization.register(JSON.parse(readFileSync(path.join(__dirname, '..', 'src', 'game', 'resources', 'localization', 'localization.json'), 'utf8')));
    ui.localization.setLanguage('pl');
    addItem(ui, new ui.EmeraldTablets());
    addItem(ui, new ui.InventoryItem('Citrine Arsenicum'), 'citrine');
    addItem(ui, new ui.InventoryItem('Argentum Vivum'), 'argentum');
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    windows.WindowManager.windowByType(ui.MainMenuWindow).openDialog(ui.InventoryWindow);
    const element = windows.WindowManager.windowByType(ui.InventoryWindow).element;
    assert.equal(element.querySelector('.inventory-notes').querySelectorAll('.inventory-item').length, 1);
    assert.equal(element.querySelector('.inventory-notes').querySelector('.inventory-item-author').textContent, 'Anonimowy alchemik');
    const objects = element.querySelector('.inventory-objects');
    assert.deepEqual(objects.querySelectorAll('.inventory-item-icon').map(icon => icon.getAttribute('aria-label')), ['Citrine Arsenicum', 'Argentum Vivum']);
    assert.equal(objects.querySelector('.inventory-item-name'), null);
    assert.equal(objects.querySelector('.inventory-item-author'), null);
    ui.localization.setLanguage('en');
    assert.equal(element.querySelector('.inventory-item-author').textContent, 'Anonymous alchemist');
    assert.deepEqual(objects.querySelectorAll('.inventory-item-icon').map(icon => icon.getAttribute('aria-label')), ['Citrine Arsenicum', 'Argentum Vivum']);
    assert.throws(() => new ui.InventoryItem('Invalid', '', { category: 'unknown' }), /category/);
    assert.throws(() => new ui.InventoryItem('No author', '', { category: 'notes' }), /author/);
});

test('InputManager inventory action opens directly from gameplay and returns after reading without showing the menu', async () => {
    const ui = setup();
    ui.localization.register(JSON.parse(readFileSync(path.join(__dirname, '..', 'src', 'game', 'resources', 'localization', 'localization.json'), 'utf8')));
    ui.localization.setLanguage('pl');
    addItem(ui, new ui.EmeraldTablets());
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    const menu = windows.WindowManager.windowByType(ui.MainMenuWindow);
    const inventoryWindow = windows.WindowManager.windowByType(ui.InventoryWindow);
    const textWindow = windows.WindowManager.windowByType(ui.ItemTextWindow);
    windows.DisplayerManager.initialize(windows);
    const shortcut = windows.DisplayerManager.displayerByType(ui.InventoryDisplayer);
    shortcut.enable();
    const canvas = ui.document.querySelector('canvas');
    let locks = 0;
    canvas.requestPointerLock = () => {
        locks++;
        ui.document.pointerLockElement = canvas;
        ui.document.dispatchEvent({ type: 'pointerlockchange' });
        return Promise.resolve();
    };
    ui.document.exitPointerLock = () => {
        ui.document.pointerLockElement = null;
        ui.document.dispatchEvent({ type: 'pointerlockchange' });
    };
    const press = (repeat = false) => ui.document.dispatchEvent({
        type: 'keydown', key: 'i', code: 'KeyI', repeat, preventDefault() {}
    });
    assert.equal(shortcut.element.querySelector('.input-icon').textContent, 'I');
    press();
    assert.equal(inventoryWindow.visible, false, 'shortcut must not bypass the main menu');
    menu.play();
    ui.document.dispatchEvent({ type: 'keydown', key: 'w', code: 'KeyW' });
    assert.equal(ui.input.GetAxis('vertical').value, 1);
    press();
    assert.equal(inventoryWindow.visible, true);
    assert.equal(menu.visible, false);
    assert.equal(ui.document.pointerLockElement, null);
    assert.equal(ui.input.blocked, 1);
    assert.equal(ui.input.GetAxis('vertical').value, 0);
    press(true);
    assert.equal(inventoryWindow.visible, true, 'holding I cannot immediately close the inventory');
    inventoryWindow.element.querySelector('.inventory-item').click();
    assert.equal(inventoryWindow.visible, false);
    assert.equal(textWindow.visible, true);
    assert.equal(ui.input.blocked, 1, 'switching to the writing keeps the game input blocked');
    assert.equal(locks, 1, 'changing dialogs must not recapture the cursor');
    ui.document.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
    assert.equal(textWindow.visible, false);
    assert.equal(inventoryWindow.visible, true, 'closing a writing returns to inventory');
    assert.equal(ui.input.blocked, 1);
    assert.equal(locks, 1);
    inventoryWindow.element.querySelector('.dialog-close').click();
    assert.equal(menu.visible, false);
    assert.equal(ui.input.blocked, 0);
    assert.equal(ui.document.pointerLockElement, canvas);
    assert.equal(locks, 2);
    ui.document.dispatchEvent({ type: 'keyup', key: 'w', code: 'KeyW' });
    assert.equal(ui.input.GetAxis('vertical').value, 0, 'releasing a cleared key must not invert the axis');
    shortcut.element.click();
    assert.equal(inventoryWindow.visible, true, 'HUD click dispatches the same InputManager action');
    press();
    assert.equal(inventoryWindow.visible, false, 'I also closes the standalone inventory');
    assert.equal(ui.input.blocked, 0);
    assert.equal(menu.visible, false);
    canvas.requestPointerLock = () => Promise.reject(new Error('denied'));
    shortcut.element.click();
    inventoryWindow.element.querySelector('.dialog-close').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(menu.visible, true, 'failed cursor recapture returns to the main menu');
    assert.equal(ui.input.blocked, 1, 'fallback menu retains exactly one input block');
    menu.hide();
    shortcut.disable();
    assert.throws(() => ui.input.getActionLabel('inventory'), /not registered/);
    press();
    assert.equal(inventoryWindow.visible, false);
});

test('Journal appends immutable entries, strikes selected ranges, persists and rejects other owners', () => {
    const ui = setup();
    const journal = new ui.AlchemistJournal('local-alchemist');
    journal.append('First immutable entry', 'local-alchemist');
    journal.append('Second entry', 'local-alchemist');
    journal.strike(0, 6, 15, 'local-alchemist');
    journal.strike(0, 10, 20, 'local-alchemist');
    assert.deepEqual(journal.entries[0].strikes, [[6, 20]]);
    assert.equal(journal.entries[0].text, 'First immutable entry');
    const copy = journal.entries;
    copy[0].text = 'Deleted';
    assert.equal(journal.entries[0].text, 'First immutable entry');
    assert.throws(() => journal.append('Forgery', 'other'), /owner/);
    assert.throws(() => journal.strike(0, 0, 2, 'other'), /owner/);
    assert.throws(() => journal.strike(0, -1, 2, 'local-alchemist'), /selection/);
    assert.throws(() => journal.append(' ', 'local-alchemist'), /contain text/);
    const restored = new ui.AlchemistJournal('local-alchemist');
    assert.deepEqual(restored.entries, journal.entries);
    assert.equal(new ui.AlchemistJournal('other').entries.length, 0);
    ui.storage.set(journal.storageKey, '{broken');
    assert.throws(() => new ui.AlchemistJournal('local-alchemist'));
});

test('Journal writing UI commits drafts, renders literal text and does not let I close while typing', async () => {
    const ui = setup();
    ui.localization.register(JSON.parse(readFileSync(path.join(__dirname, '..', 'src', 'game', 'resources', 'localization', 'localization.json'), 'utf8')));
    ui.localization.setLanguage('pl');
    const journal = new ui.AlchemistJournal('local-alchemist');
    addItem(ui, journal);
    const windows = ui.GameInterface.create();
    await ui.GameInterface.boot(Promise.resolve(), windows);
    const menu = windows.WindowManager.windowByType(ui.MainMenuWindow);
    menu.openDialog(ui.InventoryWindow);
    const inventory = windows.WindowManager.windowByType(ui.InventoryWindow);
    inventory.element.querySelector('.inventory-item').click();
    const editor = windows.WindowManager.windowByType(ui.JournalWindow);
    assert.equal(editor.visible, true);
    const draft = editor.element.querySelector('#journal-draft');
    draft.value = '<script>literal</script>';
    editor.element.querySelector('.journal-append').click();
    assert.equal(journal.entries.length, 1);
    assert.equal(editor.element.querySelector('.journal-entry').textContent, '<script>literal</script>');
    assert.equal(editor.element.querySelector('script'), null);
    assert.equal(draft.value, '');
    editor.element.querySelector('.journal-append').click();
    assert.equal(editor.element.querySelector('.journal-error').hidden, false);
    ui.input.bindAction('inventory', 'KeyI', 'I', () => { throw new Error('Typing must not trigger input'); }, true);
    draft.dispatchEvent({ type: 'keydown', key: 'i', code: 'KeyI' });
    ui.document.dispatchEvent({ type: 'keydown', key: 'i', code: 'KeyI', target: draft });
    assert.equal(editor.visible, true);
    editor.element.querySelector('.dialog-close').click();
    assert.equal(inventory.visible, true);
});

test('Tooltip accepts arbitrary literal fields and disposes hover/focus and scroll listeners', () => {
    const ui = setup();
    const target = ui.document.createElement('div');
    target.getBoundingClientRect = () => ({ left: 10, bottom: 20 });
    const createElement = ui.document.createElement;
    ui.document.createElement = name => {
        const element = createElement(name);
        element.style = {};
        element.offsetWidth = 100;
        element.offsetHeight = 50;
        return element;
    };
    ui.document.body.appendChild(target);
    const dispose = ui.Tooltip.attach(target, () => [{ heading: true, text: '<b>Name</b>' }, { text: 'Description' }]);
    target.dispatchEvent({ type: 'mouseenter' });
    const element = ui.document.getElementById('universal-tooltip');
    assert.equal(element.textContent, '<b>Name</b>Description');
    assert.equal(element.querySelector('b'), null);
    assert.equal(target.getAttribute('aria-describedby'), element.id);
    target.dispatchEvent({ type: 'mouseleave' });
    assert.equal(element.hidden, true);
    target.dispatchEvent({ type: 'focus' });
    assert.equal(element.hidden, false);
    ui.document.dispatchEvent({ type: 'scroll' });
    assert.equal(element.hidden, true);
    dispose();
    assert.equal(target.listenerCount('mouseenter'), 0);
    assert.equal(ui.document.listenerCount('scroll'), 0);
});

test('Journal rejects noncanonical saved strikes and keeps state unchanged on storage failure', () => {
    const ui = setup();
    const journal = new ui.AlchemistJournal('owner');
    ui.storage.set(journal.storageKey, JSON.stringify({
        version: 1, ownerId: 'owner', entries: [{ text: 'abcdef', strikes: [[1, 4], [3, 5]] }]
    }));
    assert.throws(() => new ui.AlchemistJournal('owner'), /Invalid saved/);
    const storageSet = ui.storage.set;
    ui.storage.set = () => { throw new Error('Storage unavailable'); };
    assert.throws(() => journal.append('Entry', 'owner'), /Storage unavailable/);
    assert.equal(journal.entries.length, 0);
    ui.storage.set = storageSet;
});

test('InputManager actions dispatch once per press, respect blocking, and clean up', () => {
    const ui = setup();
    let calls = 0;
    ui.input.bindAction('test', 'KeyT', 'T', () => calls++);
    assert.throws(() => ui.input.bindAction('test', 'KeyT', 'T', () => {}), /unique/);
    ui.document.dispatchEvent({ type: 'keydown', key: 't', code: 'KeyT' });
    ui.document.dispatchEvent({ type: 'keydown', key: 't', code: 'KeyT', repeat: true });
    assert.equal(calls, 1);
    ui.input.blockInput();
    ui.document.dispatchEvent({ type: 'keydown', key: 't', code: 'KeyT' });
    ui.input.triggerAction('test');
    assert.equal(calls, 1);
    ui.input.unblockInput();
    ui.input.triggerAction('test');
    assert.equal(calls, 2);
    ui.input.unbindAction('test');
    assert.throws(() => ui.input.triggerAction('test'), /not registered/);
});
