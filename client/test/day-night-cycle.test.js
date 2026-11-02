const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');
const test = require('node:test');

function setup() {
    let time = 0;
    const listeners = new Map();
    const refreshed = new Map();
    const transform = { position: { value: [300, 500, 240] } };
    const scene = { TimeManager: {
        addObjectToRefresh(component, priority) { refreshed.set(component, priority); },
        removeObjectToRefresh(component) { refreshed.delete(component); }
    } };
    const context = {
        Component: class {},
        Transform: class {},
        performance: { now: () => time },
        Scene: { Instance: scene },
        window: {
            GameConnection: { state: null },
            addEventListener(name, callback) { listeners.set(name, callback); },
            removeEventListener(name) { listeners.delete(name); }
        }
    };
    const source = readFileSync(path.join(__dirname, '..', 'src', 'network', 'DayNightCycle.js'), 'utf8');
    const Cycle = runInNewContext(`${source}\nDayNightCycle;`, context);
    const cycle = new Cycle();
    cycle.actor = { GetCompnentByType: () => transform };
    cycle.onEnable();
    return { cycle, Cycle, transform, listeners, refreshed,
        advance(ms) { time += ms; },
        receive(phase, duration = 1800) { listeners.get('networkstate')({ detail: { dayCycle: { phase, duration } } }); }
    };
}

test('server cycle controls sun, night lighting and monotonic interpolation without the local wall clock', () => {
    const ui = setup();
    assert.equal(ui.refreshed.get(ui.cycle), 190);
    ui.receive(0.25);
    assert.equal(ui.transform.daylight, 1);
    assert.ok(ui.transform.sunDirection[1] > 0.8);
    ui.advance(900000);
    ui.cycle.onRefresh();
    assert.equal(ui.transform.daylight, 0);
    assert.ok(ui.transform.sunDirection[1] < -0.8);
    assert.ok(ui.transform.position.value[1] > 500, 'night shadows come from the moon, not an underground sun');
    ui.receive(0.99);
    ui.advance(36000);
    ui.cycle.onRefresh();
    const expected = ui.Cycle.lighting(0.01);
    expected.sunDirection.forEach((value, axis) => assert.ok(Math.abs(value - ui.transform.sunDirection[axis]) < 1e-10));
    ui.listeners.get('worldcleared')();
    const last = [...ui.transform.position.value];
    ui.advance(60000);
    ui.cycle.onRefresh();
    assert.deepEqual([...ui.transform.position.value], last);
    ui.cycle.onDisable();
    assert.equal(ui.listeners.size, 0);
    assert.equal(ui.refreshed.size, 0);
});

test('clients receiving the same phase agree and resynchronize after suspension or reconnect', () => {
    const first = setup(), second = setup();
    second.advance(500000);
    first.receive(0.7);
    second.receive(0.7);
    first.advance(1200);
    second.advance(1200);
    first.cycle.onRefresh();
    second.cycle.onRefresh();
    assert.deepEqual([...first.transform.sunDirection], [...second.transform.sunDirection]);
    first.advance(900000);
    first.receive(0.2);
    second.receive(0.2);
    assert.deepEqual([...first.transform.sunDirection], [...second.transform.sunDirection]);
    assert.equal(first.transform.daylight, second.transform.daylight);
    for (const phase of [0, 0.25, 0.5, 0.75]) {
        const lighting = first.Cycle.lighting(phase);
        assert.ok(Math.abs(Math.hypot(...lighting.sunDirection) - 1) < 1e-10);
        assert.ok(lighting.daylight >= 0 && lighting.daylight <= 1);
    }
});

test('sun and moon follow the same 35-degree tilted arc without crossing the zenith', () => {
    const { Cycle, cycle, transform, receive } = setup();
    const tilt = 35 * Math.PI / 180;
    for (let step = 0; step <= 100; step++) {
        const phase = step / 100;
        const direction = Cycle.lighting(phase).sunDirection;
        assert.ok(Math.abs(Math.hypot(...direction) - 1) < 1e-10);
        assert.ok(Math.abs(direction[2] - direction[1] * Math.tan(tilt)) < 1e-10);
        assert.ok(Math.abs(direction[1]) <= Math.cos(tilt) + 1e-10);
        const opposite = Cycle.lighting(phase + 0.5).sunDirection;
        direction.forEach((value, axis) => assert.ok(Math.abs(value + opposite[axis]) < 1e-10));
    }
    for (const phase of [0, 0.5])
        assert.ok(Math.abs(Cycle.lighting(phase).sunDirection[1]) < 1e-10, 'horizon crossing times are unchanged');
    receive(0.25);
    const noon = [...transform.position.value];
    receive(0.75);
    transform.position.value.forEach((value, axis) => assert.ok(Math.abs(value - noon[axis]) < 1e-10,
        'shadow light follows the visible sun by day and moon by night'));
    cycle.onDisable();
});

test('natural navigation star field has varied layers and no explicit geometric guide stars or time rotation', () => {
    const shader = readFileSync(path.join(__dirname, '..', 'shaders', 'sky.frag.glsl'), 'utf8');
    const layers = [...shader.matchAll(/starLayer\(direction, ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/g)]
        .map(match => match.slice(1).map(Number));
    assert.equal(layers.length, 3);
    assert.equal(new Set(layers.map(layer => layer[0])).size, 3);
    assert.equal(new Set(layers.map(layer => layer[2])).size, 3);
    assert.equal(new Set(layers.map(layer => layer[3])).size, 3);
    assert.ok(layers.every(([scale, density, brightness]) => scale > 0 &&
        density > 0 && density < 1 && brightness > 0));
    assert.equal(layers.find(([scale]) => scale === 95)[1], 0.08, 'smallest stars are reduced by 75 percent');
    assert.match(shader, /poleDistance = length\(direction - u_originStar\)/);
    assert.match(shader, /poleWidth = max\(0\.0065, u_starPixelSize\)/);
    assert.match(shader, /radius = mix\(0\.025, 0\.13, pow\(variation\.x, 3\.0\)\)/);
    assert.match(shader, /u_starPixelSize \* scale/);
    assert.doesNotMatch(shader, /constellations\(|star\(d, vec3/);
    assert.doesNotMatch(shader, /u_time|Date|rotate/);
    assert.match(shader, /\(1\.0 - u_daylight\)/);
    assert.match(shader, /twinkle = 0\.82 \+ 0\.18/);
    assert.match(shader, /core = exp\(-0\.5 \* distance \* distance \/ \(width \* width\)\)/);
    assert.match(shader, /width = max\(radius \* 0\.5, pixelWidth \* 0\.8\)/);
    assert.match(shader, /intensity \* twinkle/);
    assert.match(shader, /floor\(u_skyTime \/ 45\.0\)/);
    assert.match(shader, /age > 1\.3/);
    assert.match(shader, /originLight \+ shootingStar\(direction\)/);
});
