const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

test('wanderer material applies independent local and remote emerald stages without flashing during terrain revisions', () => {
    class MaterialWithShadow {
        _locations = {};
        _setParmas() {}
        _compileParams() {}
    }
    const connection = { playerId: 'first', state: { emeraldStage: 1 } }, uniforms = {};
    const Material = runInNewContext(readFileSync(path.join(__dirname, '..', 'src', 'game', 'WandererMaterial.js'), 'utf8') +
        '\nWandererMaterial;', { MaterialWithShadow, WandererAnimation: class {}, window: { GameConnection: connection } });
    const gl = { getUniformLocation: (program, name) => name,
        uniform3fv() {}, uniform1f: (name, value) => { uniforms[name] = value; } };
    const animation = { movementDirection: [0, 0, 0], windDirection: [1, 0, 0], time: 0, airborne: 0,
        scarfVerticalMotion: 0, landingCrouch: 0 };
    const local = new Material(), remote = new Material();
    local._compileParams(gl); remote._compileParams(gl);
    const render = (material, identifier) => {
        material._setParmas(gl, {}, { actor: { identifier, GetCompnentByType: () => animation } });
        return uniforms.u_emeraldStage;
    };
    assert.equal(render(local, 'avatar'), 1);
    connection.state = { emeraldStage: 2 };
    assert.equal(render(local, 'avatar'), 2);
    remote.emeraldStage = 1;
    assert.equal(render(remote, 'player_other'), 1);
    assert.equal(render(local, 'avatar'), 2);
    connection.state = null;
    assert.equal(render(local, 'avatar'), 2, 'terrain revision gaps preserve the committed color');
    connection.state = { charred: true };
    render(local, 'avatar');
    assert.equal(uniforms.u_charred, 1);
    connection.state = null;
    render(local, 'avatar');
    assert.equal(uniforms.u_charred, 1, 'black appearance survives terrain revision gaps');
    remote.charred = true;
    render(remote, 'player_other');
    assert.equal(uniforms.u_charred, 1);
    connection.playerId = 'replacement';
    assert.equal(render(local, 'avatar'), 0, 'new alchemist does not inherit the previous identity color');
    assert.equal(uniforms.u_charred, 0);
});

function load(context = {}) {
    const root = path.join(__dirname, '..', 'src');
    return runInNewContext([
        'engine\\components\\base\\Component.js',
        'game\\WandererAnimation.js'
    ].map(file => readFileSync(path.join(root, file), 'utf8')).join('\n') +
        '\nWandererAnimation;', context);
}

test('landing bends knees proportionally to authoritative impact, settles smoothly and ignores old landing snapshots', () => {
    const Animation = load(), crouches = [];
    for (const speed of [4, 12, 24]) {
        const animation = new Animation();
        const motion = { airborne: true, verticalVelocity: -speed, landingId: 0, landingSpeed: 0 };
        animation.updateMotion(0.05, [0, 0.8, 0], 0, motion);
        animation.updateMotion(0.05, [0, 0.5, 0], 0, motion);
        animation.updateMotion(0.05, [0, 0.1, 0], 0, { ...motion, airborne: false, landingId: 1, landingSpeed: speed });
        crouches.push(animation.landingCrouch);
        assert.ok(Math.abs(animation.landingCrouch - speed / 24) < 1e-8);
        for (let frame = 0; frame < 60; frame++)
            animation.updateMotion(1 / 60, [0, 0, 0], 0, { ...motion, airborne: false, landingId: 1, landingSpeed: speed });
        assert.ok(animation.landingCrouch < 0.002, 'one event, not repeated crouching from the same snapshot');
        animation.updateMotion(0.1, [100, 0, 100], 0, { ...motion, landingId: 2, landingSpeed: 24 });
        assert.equal(animation.landingCrouch, 0, 'teleports never create an impact');
    }
    assert.ok(crouches[0] < crouches[1] && crouches[1] < crouches[2]);
});

test('impact is buffered until visual ground contact and inferred landings ignore ordinary slopes', () => {
    const Animation = load(), animation = new Animation();
    const motion = { landingId: 0, landingSpeed: 0 };
    animation.updateMotion(0.1, [0, 2, 0], 0, motion);
    animation.updateMotion(0.1, [0, 1, 0], 0, { landingId: 1, landingSpeed: 18 });
    assert.equal(animation.landingCrouch, 0);
    animation.updateMotion(0.1, [0, 0.1, 0], 0, { landingId: 1, landingSpeed: 18 });
    assert.equal(animation.landingCrouch, 0.75);
    const walker = new Animation();
    for (let i = 0; i < 50; i++)
        walker.updateMotion(0.05, [0, -i, i], -i);
    assert.equal(walker.landingCrouch, 0, 'downhill walking does not bend as if repeatedly falling');
});

test('exposes independent world-space movement and wind vectors without cloth or IK state', () => {
    const Animation = load();
    const first = new Animation(), second = new Animation();
    assert.deepEqual(Array.from(first.movementDirection), [0, 0, 0]);
    assert.ok(Math.hypot(...first.windDirection) > 0);
    first.windDirection[0] = -1;
    assert.notEqual(first.windDirection[0], second.windDirection[0]);
    assert.equal(first.cloth, undefined);
    assert.equal(first.legs, undefined);
    first.updateMotion(1 / 30, [0, 0, 0]);
    for (let frame = 1; frame <= 90; frame++)
        first.updateMotion(1 / 30, [frame * 13 / 30, frame * 0.1, 0]);
    assert.ok(first.movementDirection[0] > 0.99);
    assert.ok(Math.abs(first.movementDirection[1] - 3 / 13) < 1e-6);
    assert.equal(first.movementDirection[2], 0);
    assert.ok(first.time > 0);
    assert.deepEqual(Array.from(second.movementDirection), [0, 0, 0]);
});

test('jump and fall retain signed vertical motion and crouch at the apex, then settle after landing', () => {
    const Animation = load();
    const animation = new Animation();
    animation.updateMotion(0, [0, 0, 0], 0);
    for (let frame = 1; frame <= 10; frame++)
        animation.updateMotion(1 / 30, [0, frame * 0.15, 0], 0);
    assert.ok(animation.movementDirection[1] > 0.3);
    assert.ok(animation.airborne > 0.9);
    for (let frame = 0; frame < 30; frame++)
        animation.updateMotion(1 / 30, [0, 1.5, 0], 0);
    assert.ok(animation.airborne > 0.99, 'apex remains airborne even with zero vertical speed');
    for (let frame = 1; frame <= 7; frame++)
        animation.updateMotion(1 / 30, [0, 1.5 - frame * 0.1, 0], 0);
    assert.ok(animation.movementDirection[1] < -0.2);
    assert.ok(animation.airborne > 0.95);
    for (let frame = 0; frame < 60; frame++)
        animation.updateMotion(1 / 30, [0, 0, 0], 0);
    assert.ok(animation.airborne < 1e-8);
    animation.updateMotion(1 / 30, [100, 8, 100], 8);
    assert.deepEqual(Array.from(animation.movementDirection), [0, 0, 0]);
    assert.equal(animation.airborne, 0, 'teleport resets airborne pose immediately');
    animation.updateMotion(1 / 30, [100, 9, 100], null);
    assert.equal(animation.airborne, 0, 'missing terrain is not interpreted as a jump');
});

test('ascending terrain does not crouch the legs and terrain sampling matches both rendered triangles', () => {
    const Animation = load();
    const heights = Array.from({ length: 5 }, () => Array(5).fill(0));
    heights[2][1] = 2;
    heights[1][2] = 4;
    heights[2][2] = 12;
    const world = { chunkSize: 2, step: 1, chunks: [{ x: -1, z: 0, heightMap: heights }] };
    assert.equal(Animation.groundAt(-1.75, 0.25, world), 1.5);
    assert.equal(Animation.groundAt(-1.25, 0.75, world), 7.5);
    assert.equal(Animation.groundAt(20, 20, world), null);
    const animation = new Animation();
    for (let frame = 0; frame < 60; frame++)
        animation.updateMotion(1 / 30, [frame * 0.1, frame * 0.1, 0], frame * 0.1);
    assert.ok(animation.movementDirection[1] > 0.2);
    assert.equal(animation.airborne, 0, 'slopes are grounded despite a positive vertical velocity');
});

test('smooths movement independently of frame rate, caps sprint strength and resets teleports', () => {
    const Animation = load();
    const directions = [];
    for (const fps of [30, 60, 120]) {
        const animation = new Animation();
        animation.updateMotion(0, [0, 0, 0]);
        for (let frame = 1; frame <= fps; frame++)
            animation.updateMotion(1 / fps, [0, 0, frame * 20 / fps]);
        assert.ok(Math.hypot(...animation.movementDirection) <= 1);
        directions.push(animation.movementDirection[2]);
        animation.updateMotion(1 / fps, [100, 0, 100]);
        assert.deepEqual(Array.from(animation.movementDirection), [0, 0, 0]);
        animation.updateMotion(0, [100, 0, 100]);
        animation.updateMotion(-1, [100, 0, 100]);
        assert.ok([...animation.movementDirection, animation.time].every(Number.isFinite));
    }
    assert.ok(Math.max(...directions) - Math.min(...directions) < 1e-10);
});

test('movement decays to rest without overwriting externally supplied wind', () => {
    const Animation = load();
    const animation = new Animation();
    animation.windDirection = [-0.4, 0, 0.7];
    animation.updateMotion(0, [0, 0, 0]);
    animation.updateMotion(0.1, [0, 0, 1]);
    assert.ok(animation.movementDirection[2] > 0.5);
    for (let frame = 0; frame < 60; frame++)
        animation.updateMotion(1 / 30, [0, 0, 1]);
    assert.ok(Math.hypot(...animation.movementDirection) < 1e-8);
    assert.deepEqual(Array.from(animation.windDirection), [-0.4, 0, 0.7]);
});

test('lifecycle measures against moving terrain, resets on rebases and releases its timer', () => {
    class Transform {}
    const terrain = { position: { value: [0, 0, 0] } };
    const transform = { position: { value: [0, 0, 0] } };
    const refreshed = new Set();
    const world = { revision: 1 };
    const Animation = load({
        Transform,
        window: { GameConnection: { world } },
        Scene: { Instance: {
            GetActorByIdentifier: () => ({ GetCompnentByType: () => terrain }),
            TimeManager: { addObjectToRefresh: object => refreshed.add(object),
                removeObjectToRefresh: object => refreshed.delete(object) }
        } }
    });
    const animation = new Animation();
    animation.onInitialize({ GetCompnentByType: () => transform });
    animation.onPostInitialize();
    animation.onEnable();
    assert.ok(refreshed.has(animation));
    animation.onRefresh(1 / 30);
    terrain.position.value = [0, 0, -0.1];
    animation.onRefresh(1 / 30);
    assert.ok(animation.movementDirection[2] > 0,
        'stationary local avatar moves relative to its terrain anchor');
    transform.position.value = [0, 0, 0.2];
    terrain.position.value = [0, 0, 0.1];
    const previous = animation.movementDirection[2];
    animation.onRefresh(1 / 30);
    assert.ok(animation.movementDirection[2] < previous,
        'equal avatar and terrain offsets must not count as locomotion');
    world.revision++;
    animation.onRefresh(1 / 30);
    assert.deepEqual(Array.from(animation.movementDirection), [0, 0, 0]);
    animation.onDisable();
    assert.equal(refreshed.size, 0);
});

test('visible and shadow material clones upload each actor vectors without dirtying mesh buffers', () => {
    const root = path.join(__dirname, '..');
    const uploads = [];
    class MaterialWithShadow {
        _locations = {};
        constructor(vertex, fragment, textures) {
            this.vertexShaderCode = vertex;
            this.fragmentShaderCode = fragment;
            this.textures = textures;
        }
        _compileParams() {}
        _setParmas() {}
    }
    class WandererAnimation {}
    const Material = runInNewContext(readFileSync(path.join(root, 'src', 'game', 'WandererMaterial.js'), 'utf8') +
        '\nWandererMaterial;', { MaterialWithShadow, WandererAnimation });
    const gl = {
        getUniformLocation: (_, name) => name,
        uniform3fv: (name, value) => uploads.push([name, value]),
        uniform1f: (name, value) => uploads.push([name, value])
    };
    const first = { movementDirection: [1, 0.5, 0], windDirection: [0, 0, -1], time: 12, airborne: 1,
        scarfVerticalMotion: 0.4, landingCrouch: 0.3 };
    const second = { movementDirection: [0, 0, 0], windDirection: [-1, 0, 0], time: 4, airborne: 0,
        scarfVerticalMotion: -0.3, landingCrouch: 0 };
    const material = new Material('vertex', 'fragment', []);
    const clone = material.clone();
    assert.ok(clone instanceof Material);
    assert.equal(clone.isAnimated, true);
    assert.equal(clone.vertexShaderCode, material.vertexShaderCode);
    assert.equal(clone.textures, material.textures);
    for (const [image, state] of [[material, first], [clone, second]]) {
        image.isMeshDirty = false;
        image._compileParams(gl);
        image._setParmas(gl, {}, { actor: { GetCompnentByType: type => {
            assert.equal(type, WandererAnimation);
            return state;
        } } });
        assert.equal(image.isMeshDirty, false);
    }
    assert.deepEqual(uploads, [
        ['u_movementDirection', first.movementDirection], ['u_windDirection', first.windDirection],
        ['u_time', first.time], ['u_airborne', first.airborne], ['u_scarfVerticalMotion', first.scarfVerticalMotion],
        ['u_landingCrouch', first.landingCrouch],
        ['u_emeraldStage', 0],
        ['u_charred', 0],
        ['u_movementDirection', second.movementDirection], ['u_windDirection', second.windDirection],
        ['u_time', second.time], ['u_airborne', second.airborne], ['u_scarfVerticalMotion', second.scarfVerticalMotion],
        ['u_landingCrouch', second.landingCrouch],
        ['u_emeraldStage', 0], ['u_charred', 0]
    ]);
    const scene = readFileSync(path.join(root, 'src', 'game', 'PlayableScene.js'), 'utf8');
    assert.match(scene, /litMaterial\(WandererMaterial, 'wanderer'\)/);
    assert.match(scene, /WandererMaterial\.fromFiles\(\s*'\.\/shaders\/wanderer\.vert\.glsl', '\.\/shaders\/shadow\.frag\.glsl'/);
    assert.match(scene, /new LootDrops\(lootMaterial\)/);
});

test('scarf vertical follow lags ascent and descent, settles at rest and resets on teleports', () => {
    const Animation = load();
    const results = [];
    for (const fps of [30, 60, 120]) {
        const animation = new Animation();
        animation.updateMotion(0, [0, 0, 0], 0);
        for (let frame = 1; frame <= fps; frame++)
            animation.updateMotion(1 / fps, [0, 6 * frame / fps, 0], 0);
        assert.ok(animation.scarfVerticalMotion > 0.4);
        assert.ok(animation.scarfVerticalMotion < animation.movementDirection[1],
            'tail follows more slowly than the body');
        results.push(animation.scarfVerticalMotion);
        for (let frame = 1; frame <= fps; frame++)
            animation.updateMotion(1 / fps, [0, 6 - 6 * frame / fps, 0], 0);
        assert.ok(animation.scarfVerticalMotion < -0.4);
        for (let frame = 0; frame < fps * 4; frame++)
            animation.updateMotion(1 / fps, [0, 0, 0], 0);
        assert.ok(Math.abs(animation.scarfVerticalMotion) < 1e-8);
        animation.updateMotion(1 / fps, [0, 1, 0], 0);
        animation.updateMotion(1 / fps, [100, 10, 100], 10);
        assert.equal(animation.scarfVerticalMotion, 0);
    }
    assert.ok(Math.max(...results) - Math.min(...results) < 1e-10);
});

test('local terrain-relative jumps and remote actor jumps feed the same airborne pose', () => {
    class Transform {}
    const terrain = { position: { value: [0, 0, 0] } };
    const local = { position: { value: [0, 0, 0] } };
    const remote = { position: { value: [0.5, 0, 0.5] } };
    const world = { revision: 1, chunkSize: 2, step: 1,
        chunks: [{ x: 0, z: 0, heightMap: Array.from({ length: 5 }, () => Array(5).fill(0)) }] };
    const Animation = load({
        Transform, window: { GameConnection: { world } },
        Scene: { Instance: { GetActorByIdentifier: () => ({ GetCompnentByType: () => terrain }) } }
    });
    const animations = [local, remote].map(transform => {
        const animation = new Animation();
        animation.onInitialize({ GetCompnentByType: () => transform });
        animation.onPostInitialize();
        animation.onRefresh(1 / 30);
        return animation;
    });
    for (let frame = 1; frame <= 10; frame++) {
        terrain.position.value = [0, -frame * 0.15, 0];
        remote.position.value = [0.5, 0, 0.5];
        for (const animation of animations)
            animation.onRefresh(1 / 30);
    }
    for (const animation of animations) {
        assert.ok(animation.airborne > 0.9);
        assert.ok(animation.movementDirection[1] > 0.3);
    }
    remote.position.value = [0.5, -1.5, 0.5];
    for (let frame = 0; frame < 60; frame++)
        animations[1].onRefresh(1 / 30);
    assert.ok(animations[1].airborne < 1e-8, 'remote landing does not end the local jump');
    assert.ok(animations[0].airborne > 0.9);
});
