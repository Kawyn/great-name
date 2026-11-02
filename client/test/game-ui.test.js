const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadUi } = require('./helpers/ui-context');

const buildInterface = (options) => {
    const ui = loadUi(options);
    const userInterface = ui.GameInterface.create();
    userInterface.initializeWindows();
    const windows = userInterface.WindowManager;
    return {
        ...ui,
        userInterface,
        menu: windows.windowByType(ui.MainMenuWindow),
        controls: windows.windowByType(ui.ControlsWindow),
        settings: windows.windowByType(ui.SettingsWindow)
    };
};

const press = (document, key, extra = {}) =>
    document.dispatchEvent({ type: 'keydown', key, repeat: false, preventDefault() {}, ...extra });

test('main menu pauses input, waits for readiness and hands control to pointer lock', async () => {
    const { menu, document, input, events } = buildInterface();
    const canvas = document.querySelector('#xxx');
    const play = menu.element.querySelector('.main-menu-play');
    let lockRequests = 0;
    canvas.requestPointerLock = () => { lockRequests++; return Promise.resolve(); };

    assert.equal(menu.visible, true);
    assert.equal(input.blocked, 1, 'opening menu blocks scene input');
    assert.equal(menu.element.querySelector('.main-menu-title').textContent, 'Dziennik alchemika');
    assert.equal(play.disabled, true);
    play.click();
    assert.equal(menu.visible, true, 'play is unavailable before the scene is ready');

    menu.setReady();
    assert.equal(play.disabled, false);
    assert.equal(menu.element.querySelector('.main-menu-readiness').getAttribute('data-state'), 'ready');
    play.click();
    assert.equal(menu.visible, false);
    assert.equal(input.blocked, 0);
    assert.deepEqual(events, [['OnContinue', null]]);
    assert.equal(lockRequests, 1);

    document.pointerLockElement = canvas;
    document.dispatchEvent({ type: 'pointerlockchange' });
    assert.equal(menu.visible, false, 'acquiring the lock keeps the menu closed');

    document.pointerLockElement = null;
    document.dispatchEvent({ type: 'pointerlockchange' });
    document.dispatchEvent({ type: 'pointerlockchange' });
    assert.equal(menu.visible, true, 'Escape releasing pointer lock reopens the menu');
    assert.equal(input.blocked, 1, 'repeated unlock events do not stack input blocks');
});

test('a rejected pointer lock request returns to the menu', async () => {
    const { menu, document, input } = buildInterface();
    document.querySelector('#xxx').requestPointerLock = () => Promise.reject(new Error('denied'));
    menu.setReady();
    menu.play();
    assert.equal(menu.visible, false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(menu.visible, true);
    assert.equal(input.blocked, 1);
});

test('cinematics ignore pointer-unlock menus; a completed journey offers a new alchemist instead of resuming', () => {
    const { menu, document, input, window, SettingsWindow } = buildInterface();
    menu.setReady();
    menu.hide();
    menu.cinematic = true;
    document.dispatchEvent({ type: 'pointerlockchange' });
    assert.equal(menu.visible, false);
    menu.openDialog(SettingsWindow);
    assert.equal(input.blocked, 0);
    menu.cinematic = false;
    menu.endJourney();
    assert.equal(menu.visible, true);
    assert.equal(menu.element.querySelector('.main-menu-inventory').disabled, true);
    assert.equal(menu.element.querySelector('.main-menu-crafting').disabled, true);
    let reloaded = 0;
    window.location = { reload: () => reloaded++ };
    menu.play();
    assert.equal(reloaded, 1);
    assert.equal(menu.visible, true, 'the ended alchemist is never resumed');
});

test('controls dialog lists real bindings including Space jump and closes with Escape', () => {
    const { menu, controls, settings, document } = buildInterface();
    menu.element.querySelector('.main-menu-controls').click();
    assert.equal(controls.visible, true);

    const rows = controls.element.querySelectorAll('dt').map((keys, index) => [
        keys.querySelectorAll('kbd').map(key => key.textContent).join(' '),
        controls.element.querySelectorAll('dd')[index].textContent
    ]);
    assert.deepEqual(rows, [
        ['W A S D', 'Ruch względem kamery'],
        ['Mysz', 'Obrót kamery'],
        ['Spacja', 'Skok'],
        ['I', 'Ekwipunek'],
        ['J', 'Dziennik'],
        ['C', 'Przemiany'],
        ['E', 'Interakcja'],
        ['Klik', 'Przejęcie kursora w świecie'],
        ['Esc', 'Zwolnienie kursora i powrót do menu']
    ]);

    menu.element.querySelector('.main-menu-settings').click();
    assert.equal(controls.visible, false, 'only one dialog is open at a time');
    assert.equal(settings.visible, true);

    press(document, 'Escape');
    assert.equal(settings.visible, false);
    assert.equal(menu.visible, true, 'Escape inside the menu only closes the dialog');

    menu.openDialog(controls.constructor);
    controls.element.querySelector('.dialog-close').click();
    assert.equal(controls.visible, false);
});

test('settings load and persist mouse sensitivity through Settings cookies', () => {
    const { menu, settings, document, Settings } = buildInterface();
    const changes = [];
    Settings.EventManager.addEventListener(Settings.ON_VALUE_CHANGED, (name, data) => changes.push(data ?? name));
    document.cookie = `${Settings.MOUSE_SENSITIVITY}=170;path=/`;

    menu.openDialog(settings.constructor);
    const slider = settings.element.querySelector('#settings-sensitivity');
    assert.equal(slider.value, '170');
    assert.equal(settings.element.querySelector('#settings-sensitivity-value').textContent, '170%');
    assert.equal(settings.element.querySelector('#settings-render-distance').disabled, true);
    assert.equal(settings.element.querySelector('#settings-render-distance-value').textContent, '6 (serwer)');

    slider.value = 90;
    slider.dispatchEvent({ type: 'input' });
    assert.equal(settings.element.querySelector('#settings-sensitivity-value').textContent, '90%');
    assert.equal(Settings.GetValueAsString(Settings.MOUSE_SENSITIVITY), '170', 'dragging does not persist yet');
    slider.dispatchEvent({ type: 'change' });
    assert.equal(Settings.GetValueAsString(Settings.MOUSE_SENSITIVITY), '90');
    assert.ok(changes.includes(Settings.MOUSE_SENSITIVITY));
});

test('score displayer shows the ScoreState value as samples and unsubscribes on disable', () => {
    const scoreState = { score: null };
    const player = { identifier: 'player', GetCompnentByType: type => {
        if (type.name === 'Inventory')
            return scoreState.inventory;
        if (type.name === 'LootDrops')
            return { nearest: null };
        return scoreState.instance;
    } };
    const ui = buildInterface({ actors: [player] });
    scoreState.instance = new ui.ScoreState();
    scoreState.inventory = { EventManager: new ui.EventManager() };
    const { userInterface, document } = ui;

    userInterface.onInitialize({});
    userInterface.onPostInitialize();
    userInterface.onEnable();

    const plaque = document.querySelector('#score');
    assert.equal(plaque.querySelector('.score-label').textContent, 'Próbki');
    assert.equal(plaque.querySelector('.score-value').textContent, '0');
    scoreState.instance.score.value = 4;
    assert.equal(plaque.querySelector('.score-value').textContent, '4');

    userInterface.onDisable();
    scoreState.instance.score.value = 9;
    assert.equal(plaque.querySelector('.score-value').textContent, '4');
});

test('score displayer reports a missing ScoreState', () => {
    const { userInterface } = buildInterface({ actors: [] });
    userInterface.onInitialize({});
    userInterface.onPostInitialize();
    assert.throws(() => userInterface.onEnable(), /actor 'player' has no ScoreState/);
});

test('settings switch the language of menus, controls and dynamic labels without changing values', () => {
    const ui = buildInterface();
    const rows = JSON.parse(readFileSync(path.join(__dirname, '..', 'src', 'game', 'resources',
        'localization', 'localization.json'), 'utf8'));
    ui.localization.register(rows);
    ui.localization.setLanguage('pl');
    ui.menu.setReady();
    ui.menu.openDialog(ui.SettingsWindow);
    const language = ui.settings.element.querySelector('#settings-language');
    language.value = 'en';
    language.dispatchEvent({ type: 'change' });
    assert.equal(ui.menu.element.querySelector('.main-menu-play').textContent, 'Play');
    assert.equal(ui.menu.element.querySelector('.main-menu-title').textContent, "Alchemist's Journal");
    assert.equal(ui.menu.element.querySelector('.main-menu-readiness').textContent, 'Ready for the journey');
    assert.equal(ui.settings.element.querySelector('#settings-render-distance-value').textContent, '6 (server)');
    assert.equal(ui.controls.element.querySelectorAll('dd')[2].textContent, 'Jump');
    assert.equal(ui.settings.element.querySelector('#settings-sensitivity-value').textContent, '100%');
});

test('boot waits for Game initialization and displays manager load errors before scene startup', async () => {
    const ui = loadUi();
    ui.game.initialize = () => Promise.reject(new Error('localization failed'));
    await ui.GameInterface.boot(Promise.resolve(), ui.GameInterface.create());
    assert.equal(ui.scene.started, 0);
    assert.equal(ui.document.getElementById('world-status').textContent,
        'Blad inicjalizacji sceny: localization failed');
    assert.equal(ui.errors.length, 1);
});

test('boot starts the scene when ready and surfaces readiness errors in world-status', async () => {
    const ready = loadUi();
    const readyUi = ready.GameInterface.create();
    await ready.GameInterface.boot(Promise.resolve(), readyUi);
    const readyMenu = readyUi.WindowManager.windowByType(ready.MainMenuWindow);
    assert.equal(ready.scene.started, 1);
    assert.equal(readyMenu.element.querySelector('.main-menu-play').disabled, false);

    const failed = loadUi();
    const failedUi = failed.GameInterface.create();
    await failed.GameInterface.boot(Promise.reject(new Error('shader missing')), failedUi);
    const failedMenu = failedUi.WindowManager.windowByType(failed.MainMenuWindow);
    const status = failed.document.getElementById('world-status');
    assert.equal(failed.scene.started, 0);
    assert.equal(failedMenu.element.querySelector('.main-menu-play').disabled, true);
    assert.equal(failedMenu.element.querySelector('.main-menu-readiness').getAttribute('data-state'), 'failed');
    assert.equal(status.hidden, false);
    assert.equal(status.getAttribute('data-scene-error'), 'true');
    assert.equal(status.textContent, 'Blad inicjalizacji sceny: shader missing');
    assert.equal(failed.errors.length, 1);
});

test('index.html loads every UI script in dependency order and keeps the scene hooks', () => {
    const client = path.join(__dirname, '..');
    const html = readFileSync(path.join(client, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1].replace(/^\.\//, ''));
    for (const script of scripts)
        assert.ok(existsSync(path.join(client, script)), `${script} exists`);

    const order = name => scripts.indexOf(name);
    for (const file of ['MyInterfaceFunctions', 'windows/WindowBase', 'windows/WindowManager', 'displayers/DisplayerBase',
        'displayers/DisplayerManager', 'UserInterface'])
        assert.ok(order(`src/engine/ui/${file}.js`) > order('src/engine/components/base/Component.js'), file);
    assert.ok(order('src/game/ui/windows/MenuDialogWindow.js') < order('src/game/ui/windows/ControlsWindow.js'));
    assert.ok(order('src/game/ui/GameInterface.js') < order('src/game/PlayableScene.js'));
    assert.ok(!scripts.some(script => script.includes('interface/ScoreStateDisplayer')));
    assert.match(html, /<canvas id="xxx" onclick="this.requestPointerLock\(\)"><\/canvas>/);
    assert.match(html, /<div id="interface">/);
    assert.match(html, /id="world-status"[^>]*role="status"/);
    assert.match(html, /GameInterface\.boot\(playableSceneReady\)/);

    const scene = readFileSync(path.join(client, 'src', 'game', 'PlayableScene.js'), 'utf8');
    assert.match(scene, /new Actor\('UI', \[GameInterface\.Instance\]\)/);
    assert.match(scene, /Scene\.Instance\.actors = \[ui, /);
});