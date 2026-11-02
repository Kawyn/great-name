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
        assert.doesNotMatch(shader, /\bbias\s*=\s*-?0\.005/);
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

test('wanderer retains a dominant brown base under emerald and charred tints and preserves gold trim', () => {
    const vertex = readFileSync(path.join(root, 'shaders', 'wanderer.vert.glsl'), 'utf8');
    const fragment = readFileSync(path.join(root, 'shaders', 'wanderer.frag.glsl'), 'utf8');
    assert.match(fragment, /vec3 color = vec3\(0\.53, 0\.18, 0\.12\)/);
    assert.match(fragment, /uniform float u_emeraldStage/);
    assert.match(fragment, /mix\(color, vec3\(0\.10, 0\.44, 0\.29\), mix\(0\.42, 0\.25, trim\)\)/);
    assert.match(fragment, /uniform float u_charred/);
    assert.match(fragment, /vec3\(0\.025, 0\.028, 0\.03\)/);
    assert.match(fragment, /vec3\(0\.12, 0\.105, 0\.08\), trim\), mix\(0\.45, 0\.30, trim\)\)/);
    assert.ok(fragment.indexOf('if (u_charred') < fragment.indexOf('else if (u_emeraldStage'),
        'charred appearance takes priority over legacy emerald stages');
    assert.doesNotMatch(fragment, /step\(1\.5, u_emeraldStage\)/);
    assert.match(vertex, /u_landingCrouch \* 0\.45/);
    assert.match(fragment, /color = vec3\(0\.008, 0\.006, 0\.005\)/);
    assert.match(fragment, /color = vec3\(0\.98, 0\.76, 0\.36\)/);
    assert.doesNotMatch(fragment + vertex, /u_clothColor|v_fabric|embroidery|threadX|diamond|emblem/);
    assert.match(fragment, /v_texcoord\.x > 0\.75 && v_texcoord\.x < 1\.5/);
    assert.match(vertex, /cross\(leanAxis, point\)/);
    assert.match(vertex, /u_scarfVerticalMotion \* tail \* 0\.65/);
    assert.match(vertex, /float freeTail = smoothstep\(0\.12, 0\.45, tail\)/);
    assert.match(vertex, /point\.y = 2\.56 \+ width \+ freeTail \*/);
    assert.match(vertex, /float width = point\.y - 2\.56/);
    assert.match(vertex, /float flutterStrength = mix\(1\.0, 0\.35, clamp\(speed, 0\.0, 1\.0\)\)/);
    assert.match(vertex, /\(wave \* 0\.24 \+ smallWave \* 0\.06\) \* flutterStrength \* tail/);
    assert.match(vertex, /across \* .* \* tail \* freeTail/);
    assert.ok(fragment.indexOf('color = mix(color') > fragment.indexOf('color = vec3(0.98'),
        'emerald tint must also apply after scarf and trim colors are chosen');
});
