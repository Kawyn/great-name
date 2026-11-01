const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

function createRenderer({ orthographic = false, renderTexture = null, cacheStatic = false } = {}) {
    const canvas = { width: 300, height: 150, clientWidth: 1280, clientHeight: 720 };
    const viewports = [];
    const depthOffsets = [];
    const gl = {
        canvas,
        POLYGON_OFFSET_FILL: 'depth-offset',
        enable(value) { if (value === this.POLYGON_OFFSET_FILL) depthOffsets.push('enable'); },
        disable(value) { if (value === this.POLYGON_OFFSET_FILL) depthOffsets.push('disable'); },
        polygonOffset: (...args) => depthOffsets.push(args),
        bindFramebuffer() {},
        viewport: (...args) => viewports.push(args),
        clearColor() {},
        clear() {}
    };
    canvas.getContext = () => gl;
    const window = { devicePixelRatio: 1 };
    const root = path.join(__dirname, '..', 'src');
    const Renderer = runInNewContext(
        readFileSync(path.join(root, 'engine', 'components', 'base', 'Component.js'), 'utf8') +
        readFileSync(path.join(root, 'chaos', 'math', 'Matrix4.js'), 'utf8') +
        readFileSync(path.join(root, 'engine', 'components', 'renderer', 'Renderer.js'), 'utf8') +
        '\nRenderer;',
        {
            window,
            toRadians: (value) => value * Math.PI / 180,
            WebGLRenderingContext: {},
            WebGL2RenderingContext: {},
            Scene: { Instance: { EventManager: { addEventListener() {} } } }
        }
    );
    const renderer = new Renderer(canvas, ['main'], { orthographic, cacheStatic });
    renderer.renderTexture = renderTexture;
    let viewUpdates = 0;
    renderer.recalculateViewMatrix = () => { viewUpdates++; };
    renderer.onInitialize({});
    return { renderer, canvas, window, viewports, depthOffsets, viewUpdates: () => viewUpdates };
}

test('preserves native resolution below the pixel budget and camera aspect when scaling larger views', () => {
    const { renderer, canvas, window, viewports, viewUpdates } = createRenderer();
    assert.equal(canvas.width, 1280);
    assert.equal(canvas.height, 720);
    assert.ok(Math.abs(renderer.projectionMatrix[5] / renderer.projectionMatrix[0] - 1280 / 720) < 1e-6);

    canvas.clientWidth = 600;
    canvas.clientHeight = 900;
    window.devicePixelRatio = 2;
    renderer.draw();
    const scale = Math.sqrt((1366 * 768) / (1200 * 1800));
    assert.equal(canvas.width, Math.floor(1200 * scale));
    assert.equal(canvas.height, Math.floor(1800 * scale));
    assert.ok(canvas.width * canvas.height <= 1366 * 768);
    assert.deepEqual(viewports.at(-1), [0, 0, canvas.width, canvas.height]);
    assert.ok(Math.abs(renderer.projectionMatrix[5] / renderer.projectionMatrix[0] - 600 / 900) < 1e-6);
    assert.equal(viewUpdates(), 1);

    const projection = renderer.projectionMatrix;
    renderer.draw();
    assert.equal(renderer.projectionMatrix, projection);
    assert.equal(viewUpdates(), 1);

    window.devicePixelRatio = 1;
    renderer.draw();
    assert.equal(canvas.width, 600);
    assert.equal(canvas.height, 900);
    assert.equal(renderer.projectionMatrix, projection);
});

test('enforces the pixel budget on 1080p, 4K, and high-DPI monitors without upscaling small views', () => {
    const { renderer, canvas, window } = createRenderer();
    for (const [width, height, dpr] of [
        [1920, 1080, 1], [3840, 2160, 1], [1920, 1080, 2],
        [800, 600, 1], [360, 640, 3], [1366, 768, 1]
    ]) {
        canvas.clientWidth = width;
        canvas.clientHeight = height;
        window.devicePixelRatio = dpr;
        renderer.draw();
        assert.ok(canvas.width * canvas.height <= 1366 * 768);
        assert.ok(canvas.width <= width * dpr);
        assert.ok(canvas.height <= height * dpr);
        assert.ok(Math.abs(canvas.width / canvas.height - width / height) < 0.004);
        if (width * height * dpr * dpr <= 1366 * 768) {
            assert.equal(canvas.width, width * dpr);
            assert.equal(canvas.height, height * dpr);
        }
    }
});

test('does not resize the shared canvas or change the orthographic shadow projection', () => {
    let targeted = 0;
    const { renderer, canvas, viewUpdates } = createRenderer({
        orthographic: true,
        renderTexture: {
            setAsRendererTarget() { targeted++; },
            clearAsRenderTarget() {}
        }
    });

    const projection = renderer.projectionMatrix;
    assert.ok(Math.abs(projection[0] - 1 / 140) < 1e-6);
    assert.ok(Math.abs(projection[10] + 2 / 1399) < 1e-6);
    canvas.clientWidth = 600;
    renderer.draw();
    assert.equal(canvas.width, 300);
    assert.equal(canvas.height, 150);
    assert.equal(renderer.projectionMatrix, projection);
    assert.equal(viewUpdates(), 0);
    assert.equal(targeted, 1);
});

test('renders transparent effects after all opaque geometry including the sky', () => {
    const { renderer } = createRenderer();
    const drawn = [];
    renderer.renderables = [
        { mesh: {}, material: { transparent: true }, render: () => drawn.push('particles') },
        { mesh: {}, material: {}, render: () => drawn.push('terrain') },
        { mesh: {}, material: {}, render: () => drawn.push('sky') }
    ];
    renderer.draw();
    assert.deepEqual(drawn, ['terrain', 'sky', 'particles']);
});

test('camera postprocessing encloses the opaque and transparent scene, but not the shadow pass', () => {
    const { renderer } = createRenderer();
    const drawn = [];
    renderer.postProcesses = { begin: () => drawn.push('begin'), finish: () => drawn.push('finish') };
    renderer.renderables = [
        { mesh: {}, material: { transparent: true }, render: () => drawn.push('particles') },
        { mesh: {}, material: {}, render: () => drawn.push('terrain') }
    ];
    renderer.draw();
    assert.deepEqual(drawn, ['begin', 'terrain', 'particles', 'finish']);
    const shadow = createRenderer({
        orthographic: true,
        renderTexture: { setAsRendererTarget() {}, clearAsRenderTarget() {} }
    }).renderer;
    shadow.postProcesses = { begin() { assert.fail('shadow is not postprocessed'); },
        finish() { assert.fail('shadow is not postprocessed'); } };
    shadow.draw();
});

test('applies polygon depth offset only to the shadow pass and restores it before color rendering', () => {
    const { renderer, depthOffsets } = createRenderer({
        orthographic: true, cacheStatic: true,
        renderTexture: { setAsRendererTarget() {}, clearAsRenderTarget() {} }
    });
    renderer.draw();
    assert.deepEqual(depthOffsets, ['enable', [2, 2], 'disable']);
    renderer.draw();
    assert.equal(depthOffsets.length, 3, 'cached shadows do not leak or change depth offset');
    const main = createRenderer();
    main.renderer.draw();
    assert.deepEqual(main.depthOffsets, []);
});

test('culls only bounded meshes outside the frustum, preserving intersecting chunks and sky', () => {
    const { renderer } = createRenderer();
    const planes = [[1, 0, 0, 1], [-1, 0, 0, 1], [0, 1, 0, 1],
        [0, -1, 0, 1], [0, 0, 1, 1], [0, 0, -1, 1]];
    const renderable = {
        mesh: { bounds: { center: [0, 0, 0], radius: 0.5 } },
        transform: { sceneMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }
    };
    assert.equal(renderer.isVisible(renderable, planes), true);
    renderable.transform.sceneMatrix[12] = 1.4;
    assert.equal(renderer.isVisible(renderable, planes), true);
    renderable.transform.sceneMatrix[12] = 1.6;
    assert.equal(renderer.isVisible(renderable, planes), false);
    renderable.transform.sceneMatrix[0] = 2;
    assert.equal(renderer.isVisible(renderable, planes), true);
    assert.equal(renderer.isVisible({ mesh: {} }, planes), true);
});

test('reuses static shadows and redraws for mesh, transform, dirty geometry, and removal changes', () => {
    let passes = 0;
    const { renderer } = createRenderer({
        orthographic: true,
        cacheStatic: true,
        renderTexture: { setAsRendererTarget() { passes++; }, clearAsRenderTarget() {} }
    });
    const object = {
        mesh: {},
        material: { isMeshDirty: true },
        transform: { sceneMatrix: [] },
        render() { this.material.isMeshDirty = false; }
    };
    renderer.renderables.push(object);
    renderer.draw();
    renderer.draw();
    assert.equal(passes, 1);
    object.transform.sceneMatrix = [];
    renderer.draw();
    assert.equal(passes, 2);
    object.mesh = {};
    renderer.draw();
    assert.equal(passes, 3);
    object.material.isMeshDirty = true;
    renderer.draw();
    assert.equal(passes, 4);
    renderer.renderables.pop();
    renderer.draw();
    assert.equal(passes, 5);
    renderer.draw();
    assert.equal(passes, 5);
});
