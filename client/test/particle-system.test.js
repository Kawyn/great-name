const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

const root = path.join(__dirname, '..');
const definition = JSON.parse(readFileSync(path.join(root, 'particles', 'wind.json'), 'utf8'));

function loadParticles(fetch) {
    const actors = [];
    const refreshers = new Map();
    const events = [];
    const errors = [];
    const files = [
        'chaos\\EventManager\\EventManager.js', 'chaos\\DynamicValue.js', 'chaos\\math\\Matrix4.js',
        'engine\\ActorEvents.js', 'engine\\Actor.js', 'engine\\components\\base\\Component.js',
        'engine\\components\\base\\Transform.js', 'engine\\components\\renderer\\Material.js',
        'engine\\components\\renderer\\Mesh.js', 'engine\\components\\renderer\\Renderable.js',
        'engine\\components\\renderer\\ParticleSystem.js'
    ];
    const scene = {
        EventManager: { riseEvent: (...args) => events.push(args) },
        TimeManager: {
            addObjectToRefresh: (object, priority) => refreshers.set(object, priority),
            removeObjectToRefresh: object => refreshers.delete(object)
        },
        PushActor(actor) {
            actors.push(actor);
            actor.onInitialize();
            actor.onPostInitialize();
            actor.onEnable();
        },
        RemoveActor(actor) {
            actor.onDisable();
            actor.onDestroy();
            actors.splice(actors.indexOf(actor), 1);
        }
    };
    const classes = runInNewContext(
        files.map(file => readFileSync(path.join(root, 'src', file), 'utf8')).join('\n') +
        '\n({ParticleSystem, ParticleMaterial, Actor, Transform, Renderable, m4});', {
            Scene: { Instance: scene },
            Renderer: { REGISTER_RENDERABLE: 'register', UNREGISTER_RENDERABLE: 'unregister' },
            toRadians: value => value * Math.PI / 180,
            AbortController, fetch,
            CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
            window: { dispatchEvent: event => events.push(event) },
            console: { error: (...args) => errors.push(args) }
        });
    return { ...classes, actors, scene, refreshers, events, errors };
}

test('validates JSON definitions and rejects malformed or unbounded particle pools', () => {
    const { ParticleSystem } = loadParticles();
    ParticleSystem.validate(definition);
    for (const config of [
        null, {}, { ...definition, count: 2049 }, { ...definition, count: 2.5 },
        { ...definition, lifetime: [0, 1] }, { ...definition, size: [2, 1] },
        { ...definition, acceleration: [0, NaN, 0] }, { ...definition, color: [1, 2, 0, 1] },
        { ...definition, turbulence: -1 },
        { ...definition, spawn: { min: [1, 0, 0], max: [0, 0, 0] } }
    ])
        assert.throws(() => ParticleSystem.validate(config), /Invalid particle definition/);
});

test('simulates a prewarmed fixed pool in one renderable and releases it on disable/re-enable', () => {
    const { ParticleSystem, Actor, Transform, Renderable, scene, actors, refreshers, events } = loadParticles();
    const system = new ParticleSystem(definition);
    const emitter = new Actor('wind', [new Transform(), system]);
    scene.PushActor(emitter);
    assert.equal(actors.length, 2);
    assert.equal(refreshers.get(system), 160);
    const renderable = actors[1].GetCompnentByType(Renderable);
    assert.equal(renderable.material.transparent, true);
    const data = renderable.mesh.particleData;
    assert.equal(data.length, definition.count * 5);
    assert.ok(data.every(Number.isFinite));
    assert.ok(data.some((value, index) => index % 5 === 4 && value > 0));
    const before = Array.from(data);
    system.onRefresh(0.05);
    assert.notDeepEqual(Array.from(data), before);
    assert.equal(renderable.mesh.particleData, data, 'reuse typed arrays between frames');
    for (let frame = 0; frame < 1000; frame++)
        system.onRefresh(0.1);
    assert.equal(actors.length, 2);
    for (let index = 0; index < definition.count; index++) {
        assert.ok(data[index * 5 + 4] >= 0 && data[index * 5 + 4] <= 1);
        assert.ok(data[index * 5 + 3] >= definition.size[0] &&
            data[index * 5 + 3] <= definition.size[1]);
    }
    let cleared = 0;
    renderable.material.clear = () => { cleared++; };
    system.onDisable();
    assert.equal(cleared, 1);
    assert.equal(actors.length, 1);
    assert.equal(refreshers.size, 0);
    assert.ok(events.some(event => event[0] === 'unregister'));
    system.onEnable();
    assert.equal(actors.length, 2);
    system.onDisable();
    assert.equal(actors.length, 1);
});

test('loads JSON on the client, reports HTTP failures, and ignores responses after disable', async () => {
    const success = loadParticles(async () => ({ ok: true, json: async () => definition }));
    const system = new success.ParticleSystem('./particles/wind.json');
    success.scene.PushActor(new success.Actor('wind', [new success.Transform(), system]));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(success.actors.length, 2);
    system.onDisable();

    const failure = loadParticles(async () => ({ ok: false, status: 404 }));
    const failed = new failure.ParticleSystem('missing.json');
    failure.scene.PushActor(new failure.Actor('wind', [new failure.Transform(), failed]));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(failure.actors.length, 1);
    assert.match(String(failure.errors[0][1]), /404/);
    assert.equal(failure.events.at(-1).type, 'particleserror');
    failed.onDisable();

    let respond;
    let signal;
    const delayed = loadParticles((url, options) => {
        signal = options.signal;
        return new Promise(resolve => { respond = resolve; });
    });
    const pending = new delayed.ParticleSystem('wind.json');
    delayed.scene.PushActor(new delayed.Actor('wind', [new delayed.Transform(), pending]));
    pending.onDisable();
    assert.equal(signal.aborted, true);
    respond({ ok: true, json: async () => definition });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(delayed.actors.length, 1);
    assert.equal(delayed.errors.length, 0);
});

test('particle draw is batched, respects depth and restores blending even on failure', () => {
    const { ParticleMaterial } = loadParticles();
    const parameters = new Map([
        ['DEPTH_WRITEMASK', true], ['BLEND_SRC_RGB', 2], ['BLEND_DST_RGB', 3],
        ['BLEND_SRC_ALPHA', 4], ['BLEND_DST_ALPHA', 5],
        ['BLEND_EQUATION_RGB', 6], ['BLEND_EQUATION_ALPHA', 7]
    ]);
    const calls = [];
    const gl = {
        BLEND: 'BLEND', DEPTH_WRITEMASK: 'DEPTH_WRITEMASK',
        BLEND_SRC_RGB: 'BLEND_SRC_RGB', BLEND_DST_RGB: 'BLEND_DST_RGB',
        BLEND_SRC_ALPHA: 'BLEND_SRC_ALPHA', BLEND_DST_ALPHA: 'BLEND_DST_ALPHA',
        BLEND_EQUATION_RGB: 'BLEND_EQUATION_RGB', BLEND_EQUATION_ALPHA: 'BLEND_EQUATION_ALPHA',
        POINTS: 'POINTS', FUNC_ADD: 'FUNC_ADD', SRC_ALPHA: 'SRC_ALPHA', ONE: 'ONE',
        isEnabled: () => false, getParameter: key => parameters.get(key),
        enable: flag => calls.push(['enable', flag]),
        disable: flag => calls.push(['disable', flag]),
        depthMask: value => calls.push(['depthMask', value]),
        blendEquation: value => calls.push(['equation', value]),
        blendFunc: (...values) => calls.push(['blend', ...values]),
        blendFuncSeparate: (...values) => calls.push(['restoreBlend', ...values]),
        blendEquationSeparate: (...values) => calls.push(['restoreEquation', ...values]),
        drawArrays: (...values) => calls.push(['draw', ...values])
    };
    const material = new ParticleMaterial(definition.color);
    const renderable = { mesh: { particleData: new Float32Array(definition.count * 5) } };
    material.render(gl, {}, renderable);
    assert.deepEqual(calls.filter(call => call[0] === 'draw'), [['draw', 'POINTS', 0, 240]]);
    assert.ok(calls.some(call => call[0] === 'depthMask' && call[1] === false));
    assert.deepEqual(calls.slice(-4), [
        ['depthMask', true], ['restoreBlend', 2, 3, 4, 5],
        ['restoreEquation', 6, 7], ['disable', 'BLEND']
    ]);
    gl.drawArrays = () => { throw new Error('Draw failed'); };
    assert.throws(() => material.render(gl, {}, renderable), /Draw failed/);
    assert.deepEqual(calls.slice(-4), [
        ['depthMask', true], ['restoreBlend', 2, 3, 4, 5],
        ['restoreEquation', 6, 7], ['disable', 'BLEND']
    ]);
});

test('uploads one dynamic buffer once and updates it without reallocating', () => {
    const { ParticleMaterial, m4 } = loadParticles();
    const uploads = [];
    const gl = {
        canvas: { height: 768 }, ALIASED_POINT_SIZE_RANGE: 1,
        ARRAY_BUFFER: 2, DYNAMIC_DRAW: 3, FLOAT: 4,
        getAttribLocation: (program, name) => name === 'a_position' ? 0 : 1,
        getUniformLocation: (program, name) => name,
        createBuffer: () => ({}), getParameter: () => [1, 256],
        bindBuffer() {}, enableVertexAttribArray() {}, vertexAttribPointer() {},
        uniformMatrix4fv() {}, uniform1f() {}, uniform4fv() {},
        bufferData: (...args) => uploads.push(['allocate', ...args]),
        bufferSubData: (...args) => uploads.push(['update', ...args])
    };
    const material = new ParticleMaterial(definition.color);
    const renderable = {
        mesh: { particleData: new Float32Array(1200) },
        transform: { sceneMatrix: m4.identity() }
    };
    const renderer = { viewMatrix: m4.identity(), projectionMatrix: m4.identity() };
    material._compileParams(gl);
    material._setParmas(gl, renderer, renderable);
    material._setParmas(gl, renderer, renderable);
    material.isMeshDirty = true;
    material._setParmas(gl, renderer, renderable);
    assert.equal(uploads.length, 2);
    assert.equal(uploads[0][0], 'allocate');
    assert.equal(uploads[1][0], 'update');
});
