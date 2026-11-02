const { readFileSync } = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');
const { createDocument } = require('./fake-dom');

const SOURCES = [
    'chaos/DynamicValue.js',
    'engine/LocalizationManager.js',
    'engine/ResourceManager.js',
    'chaos/EventManager/EventManager.js',
    'chaos/web/InputManager.js',
    'engine/Settings.js',
    'engine/components/base/Component.js',
    'engine/ActorEvents.js',
    'engine/Actor.js',
    'engine/components/inventory/InventoryItem.js',
    'engine/components/inventory/InventoryItemWithUse.js',
    'engine/components/inventory/Inventory.js',
    'game/items/EmeraldTablets.js',
    'game/items/SpeedPotion.js',
    'game/items/AlchemistJournal.js',
    'network/ServerInventory.js',
    'network/LootDrops.js',
    'network/StoneInscriptions.js',
    'game/score/ScoreState.js',
    'engine/ui/MyInterfaceFunctions.js',
    'engine/ui/Tooltip.js',
    'game/ui/ItemIcon.js',
    'engine/ui/windows/WindowBase.js',
    'engine/ui/windows/WindowManager.js',
    'engine/ui/displayers/DisplayerBase.js',
    'engine/ui/displayers/DisplayerManager.js',
    'engine/ui/UserInterface.js',
    'game/ui/displayers/InventoryDisplayer.js',
    'game/ui/displayers/JournalDisplayer.js',
    'game/ui/displayers/CraftingDisplayer.js',
    'game/ui/displayers/InventoryNotifications.js',
    'game/ui/displayers/InteractionDisplayer.js',
    'game/ui/displayers/PickupDisplayer.js',
    'game/ui/displayers/InscriptionDisplayer.js',
    'game/ui/windows/MenuDialogWindow.js',
    'game/ui/windows/ControlsWindow.js',
    'game/ui/windows/SettingsWindow.js',
    'game/ui/windows/InventoryWindow.js',
    'game/ui/windows/CraftingWindow.js',
    'game/ui/windows/ItemPickerWindow.js',
    'game/ui/windows/ItemTextWindow.js',
    'game/ui/windows/TextDialogWindow.js',
    'game/ui/windows/JournalWindow.js',
    'game/ui/windows/MainMenuWindow.js',
    'game/ui/displayers/ScoreStateDisplayer.js',
    'game/ui/GameInterface.js'
];

const EXPORTS = ['DynamicValue', 'LocalizationManager', 'ResourceManager', 'EventManager', 'Settings', 'Component', 'ScoreState', 'MyInterfaceFunctions',
    'WindowContextBase', 'WindowBase', 'WindowManager', 'DisplayerBase', 'DisplayerManager', 'UserInterface',
    'MenuDialogWindow', 'ControlsWindow', 'SettingsWindow', 'MainMenuWindow', 'ScoreStateDisplayer', 'GameInterface',
    'Actor', 'ActorEvents', 'Inventory', 'InventoryItem', 'InventoryItemWithUse', 'EmeraldTablets', 'InventoryWindow', 'ItemTextWindow',
    'InputManager', 'InventoryDisplayer', 'JournalDisplayer', 'Tooltip', 'AlchemistJournal', 'JournalWindow', 'TextDialogWindow',
    'ServerInventory', 'LootDrops', 'InventoryNotifications', 'InteractionDisplayer', 'PickupDisplayer', 'CraftingWindow',
    'ItemIcon', 'CraftingDisplayer', 'ItemPickerWindow', 'StoneInscriptions', 'InscriptionDisplayer'];

/**
 * Loads the classic UI scripts into one VM context with a fake DOM and a stub Scene.
 */
function loadUi({ bodyMarkup = '<canvas id="xxx"></canvas><div id="interface"><div id="world-status" role="status">x</div></div>', actors = [] } = {}) {
    const document = createDocument(bodyMarkup);
    document.documentElement = { lang: 'pl' };
    const events = [];
    const scene = {
        started: 0,
        actors,
        InputManager: null,
        EventManager: { riseEvent: (name, data) => events.push([name, data]) },
        GetActorByIdentifier: identifier => actors.find(actor => actor.identifier === identifier),
        PushActor(actor) {
            actors.push(actor);
            actor.onInitialize();
            actor.onPostInitialize();
            if (actor.active)
                actor.onEnable();
        },
        RemoveActor(actor) {
            actor.onDisable();
            actor.onDestroy();
            actors.splice(actors.indexOf(actor), 1);
        },
        Start() { this.started++; }
    };
    const errors = [];
    const storage = new Map();
    const windowEvents = new Map();
    const timers = new Map();
    let nextTimer = 0;
    const connection = {
        playerId: 'local-alchemist', inventory: null, state: null, world: null,
        sent: [],
        sendCommand(message) { this.sent.push(message); },
        request: () => Promise.reject(new Error('No mock server operation handler configured.'))
    };
    const window = {
        innerWidth: 1000, innerHeight: 800, GameConnection: connection,
        addEventListener(name, listener) {
            if (!windowEvents.has(name))
                windowEvents.set(name, new Set());
            windowEvents.get(name).add(listener);
        },
        removeEventListener(name, listener) { windowEvents.get(name)?.delete(listener); },
        dispatchEvent(event) { for (const listener of [...(windowEvents.get(event.type) ?? [])]) listener(event); },
        setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
        clearTimeout(id) { timers.delete(id); }
    };
    const context = {
        document,
        Scene: { Instance: scene },
        Game: { Instance: {
            LocalizationManager: null,
            initialize: () => Promise.resolve(),
            SaveManager: { restoreRequested: () => false }
        } },
        localStorage: { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key) ?? null },
        structuredClone,
        window,
        navigator: { language: 'pl' },
        console: { log() {}, info() {}, warn() {}, error: (...args) => errors.push(args) }
    };
    const root = path.join(__dirname, '..', '..', 'src');
    const source = SOURCES.map(file => readFileSync(path.join(root, file), 'utf8')).join('\n');
    const classes = runInNewContext(`${source}\n({ ${EXPORTS.join(', ')} });`, context);
    const input = new classes.InputManager({ addObjectToRefresh() {} });
    scene.InputManager = input;
    const localization = new classes.LocalizationManager();
    context.Game.Instance.LocalizationManager = localization;
    const resources = new classes.ResourceManager();
    resources.register(JSON.parse(readFileSync(path.join(root, 'game', 'resources', 'data', 'DataContainers.json'), 'utf8')));
    context.Game.Instance.ResourceManager = resources;
    return { ...classes, localization, game: context.Game.Instance, document, scene, input, events, errors, storage,
        connection, window, timers };
}

module.exports = { loadUi };