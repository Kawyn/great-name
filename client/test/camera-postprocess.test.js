const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

function setup(count = 1) {
    let next = 0;
    let framebuffer = null;
    let texture = null;
    let mask = true;
    let status = 'complete';
    const enabled = new Set(['depth', 'cull']);
    const deleted = [];
    const attachments = new Map();
    const draws = [];
    let input;
    const gl = {
        canvas: { width: 1280, height: 720 },
        DEPTH_TEST: 'depth', CULL_FACE: 'cull', BLEND: 'blend',
        DEPTH_WRITEMASK: 'mask', FRAMEBUFFER_COMPLETE: 'complete',
        createTexture: () => ++next, createRenderbuffer: () => ++next, createFramebuffer: () => ++next,
        bindTexture(_, value) { texture = value; },
        bindFramebuffer(_, value) { framebuffer = value; },
        framebufferTexture2D(_, __, ___, value) { attachments.set(framebuffer, value); },
        bindRenderbuffer() {}, renderbufferStorage() {}, framebufferRenderbuffer() {},
        texImage2D() {}, texParameteri() {}, activeTexture() {}, viewport() {},
        checkFramebufferStatus: () => status,
        deleteTexture: value => deleted.push(value),
        deleteRenderbuffer: value => deleted.push(value),
        deleteFramebuffer: value => deleted.push(value),
        isEnabled: cap => enabled.has(cap),
        enable: cap => enabled.add(cap), disable: cap => enabled.delete(cap),
        getParameter: () => mask, depthMask: value => { mask = value; },
        drawArrays(_, __, count) { assert.equal(count, 6); draws.push({ framebuffer, input }); }
    };
    class Renderer {}
    class Material {
        clear() { this.cleared = true; }
        preprocess(_, __, quad) {
            texture = this.input.texture;
            input = this.input;
            assert.ok(quad.mesh);
            assert.equal(enabled.size, 0);
            assert.equal(mask, false);
            assert.notEqual(attachments.get(framebuffer), texture, 'no sampling from the active attachment');
        }
        render() { draws.push({ framebuffer, input: this.input }); }
    }
    const root = path.join(__dirname, '..', 'src', 'engine', 'components');
    const { CameraPostProcesses, PostProcessMaterial } = runInNewContext(
        readFileSync(path.join(root, 'base', 'Component.js'), 'utf8') + '\n' +
        readFileSync(path.join(root, 'renderer', 'CameraPostProcesses.js'), 'utf8') +
        '\n({CameraPostProcesses, PostProcessMaterial});',
        { Material, Renderer, Mesh: { QUAD: {} } }
    );
    const renderer = new Renderer();
    renderer.canvas = gl;
    const effects = Array.from({ length: count }, () => {
        const effect = new PostProcessMaterial();
        effect._setParmas = () => {};
        return effect;
    });
    const pipeline = new CameraPostProcesses({ effects });
    pipeline.onInitialize({ GetCompnentByType: () => renderer });
    pipeline.onPostInitialize();
    pipeline.onEnable();
    return { pipeline, renderer, gl, effects, draws, deleted, CameraPostProcesses,
        state: () => ({ framebuffer, texture, mask, enabled: [...enabled] }),
        fail: () => { status = 'incomplete'; } };
}

test('camera effects ping-pong without feedback, preserve depth and clean resources on resize/disable', () => {
    const { pipeline, renderer, gl, draws, effects, deleted, state } = setup(3);
    assert.equal(renderer.postProcesses, pipeline);
    pipeline.begin(gl);
    pipeline.finish(gl);
    assert.equal(draws.length, 3);
    assert.deepEqual([draws[0].input.width, draws[0].input.height], [640, 360]);
    assert.equal(draws[0].input, draws[2].input);
    assert.notEqual(draws[0].input, draws[1].input);
    assert.equal(draws[2].framebuffer, null);
    assert.deepEqual(state(), { framebuffer: null, texture: null, mask: true, enabled: ['depth', 'cull'] });
    pipeline.begin(gl);
    pipeline.finish(gl);
    assert.equal(deleted.length, 0, 'same-sized targets are reused');
    gl.canvas.width = 600;
    gl.canvas.height = 900;
    pipeline.begin(gl);
    pipeline.finish(gl);
    assert.equal(deleted.length, 6);
    assert.ok(draws.at(-1).input.width * draws.at(-1).input.height <= 640 * 360);
    pipeline.onDisable();
    assert.equal(deleted.length, 12);
    assert.equal(renderer.postProcesses, null);
    assert.ok(effects.every(e => e.cleared && e.input === null && e.isMeshDirty));
});

test('one effect uses one target, reports framebuffer failures and restores state if an effect throws', () => {
    const { pipeline, gl, effects, deleted, state } = setup();
    pipeline.begin(gl);
    effects[0].render = () => { throw new Error('effect failed'); };
    assert.throws(() => pipeline.finish(gl), /effect failed/);
    assert.equal(state().framebuffer, null);
    assert.equal(state().mask, true);
    assert.deepEqual(state().enabled, ['depth', 'cull']);
    pipeline.onDisable();
    assert.equal(deleted.length, 3);
    const broken = setup();
    broken.fail();
    assert.throws(() => broken.pipeline.begin(broken.gl), /incomplete/);
    assert.equal(broken.deleted.length, 3);
    assert.equal(broken.state().framebuffer, null);
});

test('adding a second effect allocates ping-pong targets even without a size change', () => {
    const { pipeline, gl, effects, draws, deleted } = setup();
    pipeline.begin(gl);
    pipeline.finish(gl);
    const extra = new effects[0].constructor();
    pipeline.effects.push(extra);
    pipeline.begin(gl);
    pipeline.finish(gl);
    assert.equal(deleted.length, 3);
    assert.equal(draws.length, 3);
    assert.notEqual(draws[1].input, draws[2].input);
    assert.equal(draws[2].framebuffer, null);
});

test('pixel budget preserves aspect and does not upscale small views; effect lists are validated', () => {
    const { CameraPostProcesses } = setup();
    for (const [width, height] of [[1920, 1080], [600, 900], [3840, 2160], [320, 180]]) {
        const dimensions = CameraPostProcesses.dimensions(width, height, 640 * 360);
        assert.ok(dimensions[0] * dimensions[1] <= 640 * 360);
        assert.ok(dimensions[0] <= width && dimensions[1] <= height);
        assert.ok(Math.abs(dimensions[0] / dimensions[1] - width / height) < 0.004);
    }
    assert.throws(() => new CameraPostProcesses({ effects: [] }), /requires effects/);
});
