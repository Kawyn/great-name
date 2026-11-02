const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');
const { createDocument } = require('./helpers/fake-dom');

function load({ rows = [['id', 'pl', 'en'], ['hello', 'Czesc @name', 'Hello @name']], saved = null,
    browser = 'en-US', responseOk = true, manifest = [], files = {} } = {}) {
    const root = path.join(__dirname, '..', 'src');
    const document = createDocument('<div id="interface"><p data-localization-id="hello" data-localization-parameters=\'{"name":"Ada"}\'></p></div>');
    document.documentElement = { lang: '' };
    document.baseURI = 'http://localhost:5173/';
    const storage = new Map(saved ? [['great-name.language', saved]] : []);
    const requests = [], errors = [];
    const source = ['chaos\\DynamicValue.js', 'engine\\ObjectManager.js', 'engine\\ResourceManager.js',
        'engine\\LocalizationManager.js', 'engine\\Game.js']
        .map(file => readFileSync(path.join(root, file), 'utf8')).join('\n');
    const result = runInNewContext(source + '\n({Game, ObjectManager, ResourceManager, LocalizationManager});', {
        document, navigator: { language: browser }, URL, structuredClone,
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        SaveManager: class { LocalObjects = { initialize() {} }; },
        fetch: async url => {
            requests.push(String(url));
            return { ok: responseOk, status: 404, json: async () => String(url).includes('localization.json') ?
                rows : String(url).includes('DataContainers.json') ? manifest : files[String(url)] };
        },
        console: { warn() {}, error: (...args) => errors.push(args) }
    });
    return { ...result, document, storage, requests, errors };
}

test('Game.initialize shares its promise, waits for both managers and initializes global objects only once', async () => {
    const { Game, requests } = load();
    const calls = [];
    const actor = { identifier: 'global', active: true,
        onInitialize: () => calls.push('initialize'),
        onPostInitialize: () => calls.push('post'),
        onEnable: () => calls.push('enable') };
    Game.Instance.ObjectManager.push(actor);
    const first = Game.Instance.initialize();
    assert.equal(Game.Instance.initialize(), first);
    assert.equal(Game.Instance.initialized, false);
    await first;
    assert.equal(Game.Instance.initialized, true);
    assert.deepEqual(calls, ['initialize', 'post', 'enable']);
    await Game.Instance.initialize();
    assert.equal(requests.length, 2);
});

test('failed localization/resource load rejects Game initialization instead of reporting success', async () => {
    const { Game } = load({ responseOk: false });
    await assert.rejects(Game.Instance.initialize(), /Cannot load/);
    assert.equal(Game.Instance.initialized, false);
    const invalid = load({ manifest: 'not an array' });
    await assert.rejects(invalid.Game.Instance.initialize(), /manifest/);
});

test('localization respects saved/browser language, parameters and refreshes existing and newly created elements', async () => {
    const { LocalizationManager, document, storage, requests } = load({ saved: 'pl' });
    const manager = new LocalizationManager();
    assert.equal(manager.load(), manager.load());
    await manager.load();
    assert.equal(manager.language.value, 'pl');
    const label = document.querySelector('p');
    assert.equal(label.textContent, 'Czesc Ada');
    manager.setLanguage('en');
    assert.equal(label.textContent, 'Hello Ada');
    assert.equal(document.documentElement.lang, 'en');
    assert.equal(storage.get(LocalizationManager.STORAGE_KEY), 'en');
    const root = document.createElement('p');
    manager.localize(root, 'hello', { name: '<b>Ada</b>' });
    assert.equal(root.textContent, 'Hello <b>Ada</b>');
    root.textContent = '';
    manager.refresh(root);
    assert.equal(root.textContent, 'Hello <b>Ada</b>');
    manager.unlocalize(root);
    assert.equal(root.textContent, '');
    assert.equal(requests.length, 1);
    assert.equal(LocalizationManager.setParameters('@name @names @missing', { name: 'one', names: 'two' }),
        'one two @missing');
    const fallback = load({ saved: 'unknown', browser: 'en-GB' });
    await fallback.Game.Instance.initialize();
    assert.equal(fallback.Game.Instance.LocalizationManager.language.value, 'en');
});

test('invalid localization registration is atomic and missing IDs/unsupported languages report errors', async () => {
    const { LocalizationManager, errors } = load();
    const manager = new LocalizationManager();
    await manager.load();
    for (const rows of [[], [['id', 'en', 'en']], [['id', 'en'], ['bad', 123]],
        [['id', 'en'], ['hello', 'first'], ['hello', 'second']]])
        assert.throws(() => manager.register(rows), /localization/);
    assert.equal(manager.get('hello', { name: 'Ada' }), 'Hello Ada');
    assert.equal(manager.setLanguage('unknown'), false);
    assert.equal(manager.get('missing'), '!!!missing!!!');
    assert.equal(errors.length, 2);
});

test('resource manifest paths are relative, data is read-only and invalid registration is atomic', async () => {
    const { ResourceManager, requests } = load({
        manifest: ['items.json'], files: {
            'http://localhost:5173/src/game/resources/data/items.json': {
                flask: { type: 'item', details: { capacity: 3 } }
            }
        }
    });
    const manager = new ResourceManager();
    await manager.load();
    assert.ok(requests.includes('http://localhost:5173/src/game/resources/data/items.json'));
    assert.equal(manager.get('flask').id, 'flask');
    assert.ok(Object.isFrozen(manager.get('flask').details));
    assert.equal(manager.getAllByType('item').length, 1);
    assert.throws(() => manager.register({ good: { type: 'item' }, bad: {} }), /Invalid resources/);
    assert.equal(manager.has('good'), false);
    assert.equal(manager.get('missing'), null);
});

test('resource catalog loads directly and rejects missing metadata, injected SVG and duplicate item icons atomically', async () => {
    const catalog = JSON.parse(readFileSync(path.join(__dirname, '..', 'src', 'game', 'resources', 'data', 'DataContainers.json'), 'utf8'));
    const { ResourceManager } = load({ manifest: catalog });
    const manager = new ResourceManager();
    await manager.load();
    assert.equal(manager.getAllByType('inventoryItem').length, 14);
    const valid = catalog['item.resin'];
    for (const invalid of [
        { ...valid, nameId: '' }, { ...valid, descriptionId: null }, { ...valid, icon: '"><script>' },
        { ...valid, ownIcon: '<path>' }, { ...valid, category: 'invalid' },
        { ...valid, iconColor: 'red' }, { ...valid, iconColor: '#123456;display:none' },
        { ...valid, serverType: '' }
    ])
        assert.throws(() => manager.register({ 'item.rejected': invalid }), /Invalid inventory resource/);
    assert.throws(() => manager.register({ 'item.duplicate': valid }), /unique icons/);
    assert.equal(manager.has('item.duplicate'), false);
    assert.equal(manager.has('item.rejected'), false);
    assert.throws(() => manager.register({ 'item.first': valid, 'item.second': valid }), /unique SVG/);
    assert.equal(manager.has('item.first'), false);
    assert.equal(manager.has('item.second'), false);
    assert.throws(() => manager.register({ resin: valid }), /Invalid inventory resource/);
    assert.ok(Object.isFrozen(manager.get('item.resin')));
    manager.register({ 'item.resin': valid });
    assert.equal(manager.get('item.resin').nameId, valid.nameId);
});

test('ObjectManager preserves phased initialization, late actors, inactive state and unique IDs', () => {
    const { ObjectManager } = load();
    const manager = new ObjectManager();
    const calls = [];
    const actor = id => ({ identifier: id, active: true,
        onInitialize: () => calls.push(`${id}:init`),
        onPostInitialize: () => calls.push(`${id}:post`),
        onEnable: () => calls.push(`${id}:enable`),
        onDisable: () => calls.push(`${id}:disable`),
        onDestroy: () => calls.push(`${id}:destroy`) });
    const a = actor('a'), b = actor('b');
    b.active = false;
    manager.push(a);
    manager.push(b);
    assert.deepEqual(calls, []);
    manager.initialize();
    manager.initialize();
    assert.deepEqual(calls, ['a:init', 'b:init', 'a:post', 'b:post', 'a:enable']);
    const c = actor('c');
    manager.push(c);
    assert.deepEqual(calls.slice(-3), ['c:init', 'c:post', 'c:enable']);
    assert.throws(() => manager.push(actor('a')), /unique/);
    manager.actors.pop();
    assert.equal(manager.actors.length, 3);
    manager.remove(c);
    assert.deepEqual(calls.slice(-2), ['c:disable', 'c:destroy']);
    assert.throws(() => manager.remove(c), /not owned/);
});
