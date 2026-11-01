const assert = require('node:assert/strict');
const test = require('node:test');
const { loadUi } = require('./helpers/ui-context');

test('windows are built once inside #interface and toggle the is-visible attribute', () => {
    const { WindowBase, WindowContextBase, WindowManager, document } = loadUi();
    class TestWindow extends WindowBase { _template() { return '<section><p class="body">hello</p></section>'; } }
    class OtherWindow extends WindowBase { }
    const manager = new WindowManager();
    const window = new TestWindow('Test', 'test-window');
    const other = new OtherWindow('Other', 'other-window', true);
    manager.push(window);
    manager.initialize('owner');
    manager.initialize('owner');

    const root = document.querySelector('#interface');
    assert.equal(root.querySelectorAll('#test-window').length, 1);
    assert.ok(window.element.classList.contains('window'));
    assert.equal(window.element.getAttribute('is-visible'), 'false');
    assert.equal(window.element.querySelector('.body').textContent, 'hello');
    assert.equal(window.manager, manager);
    assert.equal(manager.owner, 'owner');

    manager.push(other);
    assert.equal(document.querySelector('#other-window').getAttribute('is-visible'), 'true', 'late windows initialize immediately');
    assert.equal(manager.windowByName('Test'), window);
    assert.equal(manager.windowByType(OtherWindow), other);
    assert.equal(manager.windowByType(class Missing {}), null);

    const context = new WindowContextBase();
    window.show(context);
    assert.equal(window.visible, true);
    assert.equal(window._context, context);
    assert.equal(window.element.getAttribute('is-visible'), 'true');
    window.hide();
    assert.equal(window.visible, false);
    assert.equal(window._context, null);
    assert.equal(window.element.getAttribute('is-visible'), 'false');

    manager.clear();
    assert.equal(root.querySelector('#test-window'), null);
    assert.equal(root.querySelector('#other-window'), null);
});

test('attaching without an interface root fails clearly', () => {
    const { MyInterfaceFunctions } = loadUi({ bodyMarkup: '<canvas></canvas>' });
    assert.throws(() => MyInterfaceFunctions.attach(MyInterfaceFunctions.create('<div></div>')), /Interface root '#interface'/);
});

test('displayers follow initialize, enable, disable and clear without double subscription', () => {
    const { DisplayerBase, DisplayerManager, document } = loadUi();
    const calls = [];
    class TestDisplayer extends DisplayerBase {
        enable() { calls.push(`enable:${this.name}`); }
        disable() { calls.push(`disable:${this.name}`); }
    }
    const manager = new DisplayerManager();
    const shown = new TestDisplayer('shown', 'shown-displayer', true);
    const hidden = new TestDisplayer('hidden', 'hidden-displayer', false);
    manager.push(shown);
    manager.initialize('owner');
    assert.equal(shown.manager, manager);
    assert.equal(shown.element.getAttribute('is-visible'), 'true');
    assert.ok(shown.element.classList.contains('displayer'));

    manager.enable();
    manager.enable();
    manager.push(hidden);
    assert.equal(hidden.element.getAttribute('is-visible'), 'false');
    assert.deepEqual(calls, ['enable:shown', 'enable:hidden']);
    assert.equal(manager.displayerByType(TestDisplayer), shown);

    manager.clear();
    manager.disable();
    assert.deepEqual(calls.slice(2), ['disable:shown', 'disable:hidden']);
    assert.equal(document.querySelector('#shown-displayer'), null);
    assert.equal(document.querySelector('#hidden-displayer'), null);
});

test('UserInterface maps Component lifecycle onto the managers', () => {
    const { UserInterface, WindowBase, DisplayerBase, Component, document } = loadUi();
    const calls = [];
    class TestDisplayer extends DisplayerBase {
        enable() { calls.push('enable'); }
        disable() { calls.push('disable'); }
    }
    const ui = new UserInterface({ windows: [new WindowBase('W', 'w')], displayers: [new TestDisplayer('D', 'd')] });
    assert.ok(ui instanceof Component);

    ui.initializeWindows();
    assert.ok(document.querySelector('#w'), 'windows can exist before the scene starts');
    assert.equal(document.querySelector('#d'), null, 'displayers wait for scene actors');

    ui.onInitialize({});
    ui.onPostInitialize();
    assert.equal(document.querySelectorAll('#w').length, 1);
    assert.ok(document.querySelector('#d'));
    ui.onEnable();
    ui.active = false;
    ui.active = true;
    ui.onDisable();
    ui.onDestroy();
    assert.deepEqual(calls, ['enable', 'disable', 'enable', 'disable']);
    assert.equal(document.querySelector('#w'), null);
    assert.equal(document.querySelector('#d'), null);
});