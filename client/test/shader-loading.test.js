const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

const root = path.join(__dirname, '..');
const source = readFileSync(path.join(root, 'src', 'engine', 'components', 'renderer', 'Material.js'), 'utf8');

test('fetches shader pairs concurrently, caches sources and preserves derived material types', async () => {
    const calls = [];
    const Material = runInNewContext(source + '\nMaterial;', {
        fetch: async url => {
            calls.push(url);
            return { ok: true, text: async () => `shader: ${url}` };
        }
    });
    class DerivedMaterial extends Material {
        constructor(vertex, fragment, textures) {
            super(vertex, fragment);
            this.textures = textures;
        }
    }
    const textures = [{}];
    const [first, second] = await Promise.all([
        DerivedMaterial.fromFiles('vertex.glsl', 'fragment.glsl', textures),
        Material.fromFiles('vertex.glsl', 'fragment.glsl')
    ]);
    assert.deepEqual(calls, ['vertex.glsl', 'fragment.glsl']);
    assert.ok(first instanceof DerivedMaterial);
    assert.equal(first.textures, textures);
    assert.equal(first.vertexShaderCode, 'shader: vertex.glsl');
    assert.equal(second.fragmentShaderCode, 'shader: fragment.glsl');
    assert.notEqual(first, second);
    assert.equal(first.clone().vertexShaderCode, first.vertexShaderCode);
});

test('reports HTTP and empty shader errors and allows retry after a failed fetch', async () => {
    let attempts = 0;
    const Material = runInNewContext(source + '\nMaterial;', {
        fetch: async url => {
            if (url === 'empty')
                return { ok: true, text: async () => '  ' };
            attempts++;
            return attempts === 1 ? { ok: false, status: 404 } :
                { ok: true, text: async () => 'valid shader' };
        }
    });
    await assert.rejects(Material.loadShader('missing'), /404.*missing/);
    assert.equal(await Material.loadShader('missing'), 'valid shader');
    await assert.rejects(Material.loadShader('empty'), /empty/);
});

test('terrain color shader uses only the shadow sampler and stable coordinates across streamed borders', () => {
    const fragment = readFileSync(path.join(root, 'shaders', 'terrain.frag.glsl'), 'utf8');
    const lighting = readFileSync(path.join(root, 'shaders', 'lighting.glsl'), 'utf8');
    assert.deepEqual((lighting + fragment).match(/uniform sampler2D \w+/g), ['uniform sampler2D u_texture0']);
    assert.match(fragment, /noise\(v_surface\.xz/);
    assert.match(fragment, /smoothstep\(-30\.0, 80\.0, v_surface\.y\)/);
    const scene = readFileSync(path.join(root, 'src', 'game', 'PlayableScene.js'), 'utf8');
    assert.doesNotMatch(scene, /new Texture|attribute vec|precision mediump/);
    assert.match(scene, /litMaterial\(BiomeMaterial, 'terrain'\)/);
    assert.match(scene, /Material\.loadShader\('\.\/shaders\/lighting\.glsl'\)/);
    assert.doesNotMatch(scene, /new CopyPositionFromOtherObject/);
    for (const name of ['terrain', 'stone', 'wanderer']) {
        const shader = readFileSync(path.join(root, 'shaders', `${name}.frag.glsl`), 'utf8');
        assert.match(shader, /surfaceLighting\(/);
        assert.doesNotMatch(shader, /0\.005/);
    }
    assert.match(lighting, /visibility \* 0\.25/);
    assert.match(lighting, /u_shadowParams\.z/);
    assert.match(lighting, /dFdx\(projected\)/);
    assert.match(lighting, /dot\(depthGradient, uv - projected\.xy\)/);
    assert.match(scene, /#version 300 es/);
});

test('receiver plane depth correction removes self-shadow differences on sloping triangle interiors', () => {
    const gradient = [0.3, -0.5];
    const fragment = [0.41, 0.62, 0.5];
    const bias = 0.00008;
    const dx = [0.002, 0.001, gradient[0] * 0.002 + gradient[1] * 0.001];
    const dy = [-0.001, 0.003, gradient[0] * -0.001 + gradient[1] * 0.003];
    const determinant = dx[0] * dy[1] - dx[1] * dy[0];
    const solved = [(dy[1] * dx[2] - dx[1] * dy[2]) / determinant,
        (dx[0] * dy[2] - dy[0] * dx[2]) / determinant];
    let uncorrectedAcne = 0;
    for (const [x, y] of [[-1, -1], [0, 0], [1, 1], [1, -1]]) {
        const offset = [x / 2048, y / 2048];
        const sampleDepth = fragment[2] + gradient[0] * offset[0] + gradient[1] * offset[1];
        const corrected = fragment[2] + solved[0] * offset[0] + solved[1] * offset[1];
        if (fragment[2] - bias > sampleDepth)
            uncorrectedAcne++;
        assert.ok(corrected - bias <= sampleDepth);
        assert.ok(corrected - bias > sampleDepth - 0.001, 'real occluders remain shadowed');
    }
    assert.ok(uncorrectedAcne > 0, 'the same plane fails without receiver correction');
});
