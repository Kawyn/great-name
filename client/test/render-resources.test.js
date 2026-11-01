const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

const root = path.join(__dirname, '..', 'src');

function mockGL() {
    const calls = [];
    let id = 0;
    const gl = {
        calls,
        VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
        ARRAY_BUFFER: 5, ELEMENT_ARRAY_BUFFER: 6, STATIC_DRAW: 7,
        TRIANGLES: 8, UNSIGNED_SHORT: 9, TEXTURE0: 100,
        createProgram: () => { calls.push(['createProgram']); return { id: ++id }; },
        createShader: () => ({ id: ++id }),
        createBuffer: () => ({ id: ++id }),
        createTexture: () => { calls.push(['createTexture']); return { id: ++id }; },
        createFramebuffer: () => ({ id: ++id }),
        getShaderParameter: () => true,
        getProgramParameter: () => true,
        getAttribLocation: (program, name) => name === 'a_position' ? 0 : -1,
        getUniformLocation: () => null
    };
    for (const name of ['shaderSource', 'compileShader', 'attachShader', 'linkProgram',
        'useProgram', 'disableVertexAttribArray', 'enableVertexAttribArray',
        'bindBuffer', 'bufferData', 'vertexAttribPointer', 'uniformMatrix4fv',
        'drawArrays', 'drawElements', 'deleteBuffer', 'deleteProgram',
        'bindTexture', 'activeTexture', 'bindFramebuffer', 'viewport',
        'texImage2D', 'texParameteri', 'framebufferTexture2D']) {
        gl[name] = (...args) => calls.push([name, ...args]);
    }
    return gl;
}

test('shares linked programs within one context and retains them until the last material is released', () => {
    const gl = mockGL();
    const source = readFileSync(path.join(root, 'chaos', 'math', 'Matrix4.js'), 'utf8') +
        readFileSync(path.join(root, 'engine', 'components', 'renderer', 'Material.js'), 'utf8');
    const Material = runInNewContext(source + '\nMaterial;', { WebGLRenderingContext: gl });
    const first = new Material('vertex', 'fragment');
    const second = first.clone();
    const renderer = { viewProjectionMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
    const renderable = {
        transform: { sceneMatrix: renderer.viewProjectionMatrix },
        mesh: { vertices: new Float32Array(9), normals: new Float32Array(9), uv: new Float32Array(6),
            indices: new Uint16Array([0, 1, 2]) }
    };
    first.preprocess(gl, renderer, renderable);
    first.render(gl, renderer, renderable);
    first.isMeshDirty = false;
    const uploads = gl.calls.filter(call => call[0] === 'bufferData').length;
    first.preprocess(gl, renderer, renderable);
    first.render(gl, renderer, renderable);
    assert.equal(gl.calls.filter(call => call[0] === 'bufferData').length, uploads);
    assert.equal(gl.calls.filter(call => call[0] === 'drawElements').length, 2);
    assert.equal(gl.calls.some(call => call[0] === 'enableVertexAttribArray' && call[1] === -1), false);
    second.preprocess(gl, renderer, renderable);
    assert.equal(first._program, second._program);
    assert.equal(gl.calls.filter(call => call[0] === 'linkProgram').length, 1);
    first.clear();
    assert.equal(gl.calls.filter(call => call[0] === 'deleteProgram').length, 0);
    second.clear();
    assert.equal(gl.calls.filter(call => call[0] === 'deleteProgram').length, 1);
    const third = new Material('vertex', 'fragment');
    third.preprocess(gl, renderer, renderable);
    assert.equal(gl.calls.filter(call => call[0] === 'linkProgram').length, 2);
    const anotherContext = mockGL();
    const fourth = new Material('vertex', 'fragment');
    fourth.preprocess(anotherContext, renderer, renderable);
    assert.notEqual(third._program, fourth._program);
    assert.equal(anotherContext.calls.filter(call => call[0] === 'linkProgram').length, 1);
});

test('shadow attachment is allocated only once and detached from all samplers before rendering', () => {
    const gl = mockGL();
    const source = readFileSync(path.join(root, 'engine', 'components', 'renderer', 'RenderTexture.js'), 'utf8') +
        readFileSync(path.join(root, 'engine', 'components', 'renderer', 'ShadowMaterial.js'), 'utf8');
    const ShadowTexture = runInNewContext(source + '\nShadowTexture;', {
        Texture: class { compile() {} },
        WebGL2RenderingContext: gl
    });
    const texture = new ShadowTexture(2048, 2048);
    texture.compile(gl);
    const firstTexture = texture.texture;
    for (let i = 0; i < 169; i++)
        texture.compile(gl);
    assert.equal(texture.texture, firstTexture);
    assert.equal(gl.calls.filter(call => call[0] === 'createTexture').length, 2);
    assert.equal(gl.calls.filter(call => call[0] === 'texImage2D').length, 2);
    texture.bindForSampling(gl, 0);
    texture.bindForSampling(gl, 4);
    gl.calls.length = 0;
    texture.setAsRendererTarget(gl);
    const target = gl.calls.findIndex(call => call[0] === 'bindFramebuffer');
    const before = gl.calls.slice(0, target);
    assert.deepEqual(before.filter(call => call[0] === 'activeTexture').map(call => call[1]), [100, 104, 100]);
    assert.equal(before.filter(call => call[0] === 'bindTexture' && call[2] === null).length, 2);
    texture.clearAsRenderTarget(gl);
    assert.equal(gl.calls.at(-1)[2], null);
});

test('reports program link failures instead of caching an invalid program', () => {
    const gl = mockGL();
    gl.getProgramParameter = () => false;
    gl.getProgramInfoLog = () => 'link error';
    const Material = runInNewContext(
        readFileSync(path.join(root, 'engine', 'components', 'renderer', 'Material.js'), 'utf8') +
        '\nMaterial;', { WebGLRenderingContext: gl }
    );
    assert.throws(() => new Material('v', 'f').preprocess(gl, {}, {}), /link error/);
    assert.equal(gl.calls.filter(call => call[0] === 'deleteProgram').length, 1);
});
