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
    const sun = { daylight: 1 };
    const terrain = { position: { value: [0, 0, 0] } };
    const avatar = { position: { value: [0, 0, 0] }, rotation: { value: [0, 0, 0] } };
    const connection = { world: null, state: null };
    const files = [
        'chaos\\EventManager\\EventManager.js', 'chaos\\DynamicValue.js', 'chaos\\math\\Matrix4.js',
        'engine\\ActorEvents.js', 'engine\\Actor.js', 'engine\\components\\base\\Component.js',
        'engine\\components\\base\\Transform.js', 'engine\\components\\renderer\\Material.js',
        'engine\\components\\renderer\\Mesh.js', 'engine\\components\\renderer\\Renderable.js',
        'engine\\components\\renderer\\ParticleSystem.js',
        'game\\WandererAnimation.js', 'game\\PlayerDust.js'
    ];
    const scene = {
        GetActorByIdentifier: identifier => {
            const transform = { sun, terrain, avatar }[identifier];
            return transform ? { GetCompnentByType: () => transform } : null;
        },
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
        '\n({ParticleSystem, ParticleMaterial, PlayerDust, Actor, Transform, Renderable, m4});', {
            Scene: { Instance: scene },
            Renderer: { REGISTER_RENDERABLE: 'register', UNREGISTER_RENDERABLE: 'unregister' },
            toRadians: value => value * Math.PI / 180,
            AbortController, fetch,
            CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
            window: { GameConnection: connection, dispatchEvent: event => events.push(event) },
            console: { error: (...args) => errors.push(args) }
        });
    return { ...classes, actors, scene, refreshers, events, errors, sun, terrain, avatar, connection };
}

test('burst pools start empty, exhaust without allocation, expire without respawning and can be shifted', () => {
    const ui = loadParticles();
    const system = new ui.ParticleSystem(definition, { continuous: false, worldSpace: true });
    ui.scene.PushActor(new ui.Actor('burst', [new ui.Transform(), system]));
    const renderable = ui.actors[1].GetCompnentByType(ui.Renderable), data = renderable.mesh.particleData;
    assert.equal(ui.actors[1].parent, undefined);
    assert.ok(Array.from(data).every((v, i) => i % 5 !== 4 || v === 0));
    assert.equal(system.emit(definition.count + 10, [2, 0, 0]), definition.count);
    assert.equal(system.emit(1, [0, 0, 0]), 0);
    system.onRefresh(0.1);
    const x = data[0];
    system.shift([-1, 0, 0]); system.onRefresh(0);
    assert.ok(Math.abs(data[0] - x + 1) < 1e-5);
    for (let i = 0; i < 1000; i++) system.onRefresh(0.1);
    assert.ok(Array.from(data).every((v, i) => i % 5 !== 4 || v === 0));
    assert.equal(renderable.mesh.particleData, data);
    assert.equal(system.emit(1, [0, 0, 0]), 1);
    system.clearParticles(); system.onRefresh(0);
    assert.ok(Array.from(data).every((v, i) => i % 5 !== 4 || v === 0));
    assert.throws(() => system.emit(-1, [0, 0, 0]), /bursts require/);
    assert.throws(() => system.emit(1, [NaN, 0, 0]), /bursts require/);
    system.onDisable();
    assert.equal(ui.actors.length, 1);
    assert.equal(ui.refreshers.size, 0);
});

function dustSetup() {
    const ui = loadParticles();
    const heights = Array.from({ length: 35 }, () => Array(35).fill(0));
    ui.connection.world = { revision: 1, step: 2, chunkSize: 64,
        chunks: [{ x: 0, z: 0, heightMap: heights }, { x: 0, z: -1, heightMap: heights }] };
    const dust = new ui.PlayerDust(), bursts = [];
    const emit = dust.emit.bind(dust);
    dust.emit = (count, position, scale = 1) => { bursts.push({ count, position, scale }); return emit(count, position, scale); };
    ui.scene.PushActor(new ui.Actor('player', [new ui.Transform(), dust]));
    return { ...ui, dust, bursts };
}

test('player dust follows actual grounded travel, alternating feet, but not standing or airborne movement', () => {
    const ui = dustSetup();
    for (let i = 0; i < 10; i++) ui.dust.onRefresh(0.1);
    assert.equal(ui.bursts.length, 0);
    ui.terrain.position.value[0] = -2; ui.dust.onRefresh(0.1);
    ui.terrain.position.value[0] = -4; ui.dust.onRefresh(0.1);
    assert.deepEqual(ui.bursts.map(burst => burst.count), [5, 5]);
    assert.ok(ui.bursts[0].position[0] * ui.bursts[1].position[0] < 0);
    assert.ok(ui.actors[1].GetCompnentByType(ui.Renderable).mesh.particleData
        .some((value, i) => i % 5 === 4 && value > 0));
    ui.terrain.position.value[1] = -0.5; ui.dust.onRefresh(0.1);
    assert.equal(ui.bursts.at(-1).count, 22, 'takeoff burst');
    ui.terrain.position.value = [-5, -1.5, 0]; ui.dust.onRefresh(0.1);
    ui.terrain.position.value = [-6, -0.5, 0]; ui.dust.onRefresh(0.1);
    assert.equal(ui.bursts.length, 3, 'no continuous trail in midair');
    ui.terrain.position.value[1] = 0; ui.dust.onRefresh(0.1);
    assert.equal(ui.bursts.at(-1).count, 47, 'landing burst scales with descent speed');
    const count = ui.bursts.length;
    for (let i = 0; i < 20; i++) ui.dust.onRefresh(0.1);
    assert.equal(ui.bursts.length, count);
    assert.ok(Array.from(ui.actors[1].GetCompnentByType(ui.Renderable).mesh.particleData)
        .every((v, i) => i % 5 !== 4 || v === 0), 'old dust fades while standing');
    ui.dust.onDisable();
    assert.equal(ui.refreshers.size, 0);
    assert.equal(ui.actors.length, 1);
});

test('player dust resets on chunk rebases, disconnects and teleports instead of creating false jumps or trails', () => {
    const ui = dustSetup();
    ui.terrain.position.value[0] = -2; ui.dust.onRefresh(0.1);
    const count = ui.bursts.length;
    ui.connection.world.revision++;
    ui.terrain.position.value = [62, 0, 0]; ui.dust.onRefresh(0.1);
    assert.equal(ui.bursts.length, count);
    ui.terrain.position.value = [-2, 0, 0]; ui.dust.onRefresh(0.1);
    assert.equal(ui.bursts.length, count);
    ui.connection.world = null; ui.dust.onRefresh(0.1);
    assert.equal(ui.bursts.length, count);
    assert.equal(ui.errors.length, 0);
    ui.dust.onDisable();
});

test('hard landings produce more and larger dust with authoritative speed despite smoothed visual descent', () => {
    const bursts = [];
    for (const speed of [4, 12, 24, 100]) {
        const ui = dustSetup();
        ui.connection.state = { motion: { landingId: 0, landingSpeed: 0 } };
        ui.dust.onRefresh(0.05);
        ui.terrain.position.value[1] = -1;
        ui.dust.onRefresh(0.05);
        ui.connection.state.motion = { landingId: 1, landingSpeed: speed };
        ui.terrain.position.value[1] = -0.5;
        ui.dust.onRefresh(0.05);
        const count = ui.bursts.length;
        ui.terrain.position.value[1] = 0;
        ui.dust.onRefresh(0.05);
        assert.equal(ui.bursts.length, count + 1);
        bursts.push(ui.bursts.at(-1));
        ui.dust.onRefresh(0.05);
        assert.equal(ui.bursts.length, count + 1, 'one landing emits once');
        ui.dust.onDisable();
    }
    assert.ok(bursts[0].count < bursts[1].count && bursts[1].count < bursts[2].count);
    assert.ok(bursts[0].scale < bursts[1].scale && bursts[1].scale < bursts[2].scale);
    assert.equal(bursts[2].count, bursts[3].count, 'extreme falls remain within the fixed pool budget');
    assert.equal(bursts[2].count, 96);
    assert.equal(bursts[2].scale, 2.4);
});

test('authoritative grounded movement cannot create false landing bursts from rendered slope sampling differences', () => {
    const ui = dustSetup();
    ui.connection.state = { motion: { airborne: false, landingId: 0, landingSpeed: 0 } };
    ui.dust.onRefresh(0.05);
    for (let frame = 0; frame < 20; frame++) {
        ui.terrain.position.value[1] = frame % 2 ? 0 : -0.3;
        ui.dust.onRefresh(0.05);
    }
    assert.equal(ui.bursts.length, 0, 'only genuine jumps and landing IDs can produce impact clouds');
    ui.dust.onDisable();
});

test('daylight-only wind fades at dusk, vanishes at night and returns at dawn without affecting other particles', () => {
    const { ParticleSystem, Actor, Transform, Renderable, scene, actors, sun } = loadParticles();
    const system = new ParticleSystem(definition, { daylightOnly: true });
    scene.PushActor(new Actor('wind', [new Transform(), system]));
    const data = actors[1].GetCompnentByType(Renderable).mesh.particleData;
    const alphas = () => Array.from(data).filter((value, index) => index % 5 === 4);
    const day = alphas();
    assert.ok(day.some(value => value > 0));
    sun.daylight = 0.5;
    system.onRefresh(0);
    assert.deepEqual(alphas(), day.map(value => value * 0.5));
    sun.daylight = 0;
    system.onRefresh(0);
    assert.ok(alphas().every(value => value === 0));
    sun.daylight = 1;
    system.onRefresh(0);
    assert.deepEqual(alphas(), day);
    system.onDisable();

    sun.daylight = 0;
    const ordinary = new ParticleSystem(definition);
    scene.PushActor(new Actor('ordinary', [new Transform(), ordinary]));
    assert.ok(actors.at(-1).GetCompnentByType(Renderable).mesh.particleData
        .some((value, index) => index % 5 === 4 && value > 0));
    ordinary.onDisable();
});

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
        ONE_MINUS_SRC_ALPHA: 'ONE_MINUS_SRC_ALPHA',
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
    assert.ok(calls.some(call => call[0] === 'blend' && call[2] === 'ONE'));
    assert.deepEqual(calls.filter(call => call[0] === 'draw'), [['draw', 'POINTS', 0, 240]]);
    assert.ok(calls.some(call => call[0] === 'depthMask' && call[1] === false));
    assert.deepEqual(calls.slice(-4), [
        ['depthMask', true], ['restoreBlend', 2, 3, 4, 5],
        ['restoreEquation', 6, 7], ['disable', 'BLEND']
    ]);
    new ParticleMaterial(definition.color, { additive: false }).render(gl, {}, renderable);
    assert.ok(calls.some(call => call[0] === 'blend' && call[2] === 'ONE_MINUS_SRC_ALPHA'));
    gl.drawArrays = () => { throw new Error('Draw failed'); };
    assert.throws(() => material.render(gl, {}, renderable), /Draw failed/);
    assert.deepEqual(calls.slice(-4), [
        ['depthMask', true], ['restoreBlend', 2, 3, 4, 5],
        ['restoreEquation', 6, 7], ['disable', 'BLEND']
    ]);
});

test('uploads one dynamic buffer once, reuses it and lights ordinary dust without affecting wind', () => {
    const { ParticleMaterial, m4, sun } = loadParticles();
    const uploads = [];
    let color;
    const gl = {
        canvas: { height: 768 }, ALIASED_POINT_SIZE_RANGE: 1,
        ARRAY_BUFFER: 2, DYNAMIC_DRAW: 3, FLOAT: 4,
        getAttribLocation: (program, name) => name === 'a_position' ? 0 : 1,
        getUniformLocation: (program, name) => name,
        createBuffer: () => ({}), getParameter: () => [1, 256],
        bindBuffer() {}, enableVertexAttribArray() {}, vertexAttribPointer() {},
        uniformMatrix4fv() {}, uniform1f() {}, uniform4fv: (location, value) => { color = Array.from(value); },
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
    assert.deepEqual(color, definition.color);
    const dust = new ParticleMaterial(definition.color, { additive: false, lit: true });
    dust._compileParams(gl);
    sun.daylight = 0;
    dust._setParmas(gl, renderer, renderable);
    assert.deepEqual(color, definition.color.map((v, i) => i < 3 ? v * 0.12 : v));
    sun.daylight = 1;
    dust._setParmas(gl, renderer, renderable);
    assert.deepEqual(color, definition.color);
});
