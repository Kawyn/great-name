
class Material {
    static shaderSources = new Map();

    static loadShader(url) {
        if (!Material.shaderSources.has(url)) {
            const request = fetch(url).then(async response => {
                if (!response.ok)
                    throw new Error(`Shader request failed (${response.status}): ${url}`);
                const source = await response.text();
                if (!source.trim())
                    throw new Error(`Shader source is empty: ${url}`);
                return source;
            }).catch(error => {
                Material.shaderSources.delete(url);
                throw error;
            });
            Material.shaderSources.set(url, request);
        }
        return Material.shaderSources.get(url);
    }

    static async fromFiles(vertexUrl, fragmentUrl, ...args) {
        const [vertex, fragment] = await Promise.all([
            Material.loadShader(vertexUrl), Material.loadShader(fragmentUrl)
        ]);
        return new this(vertex, fragment, ...args);
    }

    vertexShaderCode;
    fragmentShaderCode;

    vertexShader;
    fragmentShader;

    _locations = {};
    _buffers = {}

    isMeshDirty = true;

    /** @type {WebGLProgram} */ _program;
    #programEntry;

    constructor(vertexShader, fragmentShader) {

        this.vertexShaderCode = vertexShader;
        this.fragmentShaderCode = fragmentShader;
    }

    preprocess(gl, renderer, renderable) {

        this.gl = gl;
        if (!this._program) {

            this.#compileShaders(gl);
            this._compileParams(gl);
        }

        gl.useProgram(this._program);
        const attributes = new Set(Object.entries(this._locations)
            .filter(([name, location]) => name.startsWith('a_') && location >= 0)
            .map(([, location]) => location));
        const previousAttributes = Material.attributes.get(gl) ?? new Set();
        for (const location of previousAttributes) {
            if (!attributes.has(location))
                gl.disableVertexAttribArray(location);
        }
        Material.attributes.set(gl, attributes);
        this._setParmas(gl, renderer, renderable);
    }

    render(gl, renderer, renderable) {
        if (renderable.mesh.indices) {
            if (!this._buffers.indices)
                this._buffers.indices = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._buffers.indices);
            if (this.isMeshDirty)
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, renderable.mesh.indices, gl.STATIC_DRAW);
            gl.drawElements(gl.TRIANGLES, renderable.mesh.indices.length, gl.UNSIGNED_SHORT, 0);
        }
        else {
            gl.drawArrays(WebGLRenderingContext.TRIANGLES, 0, renderable.mesh.vertices.length / 3);
        }
    }

    postprocess(gl, renderer, renderable) { }

    _compileParams(gl) {

        this.#compileProjection(gl);

        this.#compilePosition(gl);

        this.#compileNormals(gl);
        this.#compileUVs(gl);
    }

    _setParmas(gl, renderer, renderable) {

        this.#setProjection(gl, renderer, renderable);

        this.#setPosition(gl, renderer, renderable);

        this.#setNormals(gl, renderer, renderable);
        this.#setUVs(gl, renderer, renderable);
    }


    static cache = new WeakMap();
    static attributes = new WeakMap();
    /**
     * @param {WebGLRenderingContext} gl 
     */
    #compileShaders(gl) {

        let cache = Material.cache.get(gl);
        if (!cache) {
            cache = { shaders: new Map(), programs: new Map() };
            Material.cache.set(gl, cache);
        }
        const key = JSON.stringify([this.vertexShaderCode, this.fragmentShaderCode]);
        let entry = cache.programs.get(key);
        if (!entry) {
            for (const [type, code] of [
                [WebGLRenderingContext.VERTEX_SHADER, this.vertexShaderCode],
                [WebGLRenderingContext.FRAGMENT_SHADER, this.fragmentShaderCode]
            ]) {
                const shaderKey = JSON.stringify([type, code]);
                if (!cache.shaders.has(shaderKey))
                    cache.shaders.set(shaderKey, this.#createShader(gl, type, code));
            }
            const program = gl.createProgram();
            gl.attachShader(program, cache.shaders.get(JSON.stringify([WebGLRenderingContext.VERTEX_SHADER, this.vertexShaderCode])));
            gl.attachShader(program, cache.shaders.get(JSON.stringify([WebGLRenderingContext.FRAGMENT_SHADER, this.fragmentShaderCode])));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, WebGLRenderingContext.LINK_STATUS)) {
                const message = gl.getProgramInfoLog(program);
                gl.deleteProgram(program);
                throw new Error(`Shader program link failed: ${message}`);
            }
            entry = { program, users: 0, key };
            cache.programs.set(key, entry);
        }
        entry.users++;
        this.#programEntry = entry;
        this._program = entry.program;
    }

    /**
     * @param {WebGLRenderingContext} gl 
     * @param {WebGLRenderingContext.VERTEX_SHADER|WebGLRenderingContext.FRAGMENT_SHADER} type 
     * @param {string} code 
     */
    #createShader(gl, type, code) {

        const shader = gl.createShader(type);

        gl.shaderSource(shader, code);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, WebGLRenderingContext.COMPILE_STATUS))
            throw gl.getShaderInfoLog(shader);

        return shader;
    }

    #compileProjection(gl) {

        this._locations['u_worldViewProjectionsasda'] = gl.getUniformLocation(this._program, 'u_worldViewProjection');
        this._locations['u_worldViewProjection'] = gl.getUniformLocation(this._program, 'u_worldViewProjection');

        this._locations['u_worldInverseTranspose'] = gl.getUniformLocation(this._program, 'u_worldInverseTranspose');
    }

    #setProjection(gl, renderer, renderable) {

        const viewProjectionMatrix = renderer.viewProjectionMatrix;
        const sceneMatrix = renderable.transform.sceneMatrix;

        if (this._locations['u_worldViewProjection'] !== null) {
            const objectViewProjectionMatrix = m4.multiply(viewProjectionMatrix, sceneMatrix);
            gl.uniformMatrix4fv(this._locations['u_worldViewProjection'], false, objectViewProjectionMatrix);
        }
        if (this._locations['u_worldInverseTranspose'] !== null) {
            const worldInverseMatrix = m4.inverse(sceneMatrix);
            const worldInverseTransposeMatrix = m4.transpose(worldInverseMatrix);
            gl.uniformMatrix4fv(this._locations['u_worldInverseTranspose'], false, worldInverseTransposeMatrix);
        }
    }

    #compilePosition(gl) {

        this._locations['a_position'] = gl.getAttribLocation(this._program, 'a_position');
        this._buffers['a_position'] = gl.createBuffer();
    }

    #setPosition(gl, renderer, renderable) {


        gl.bindBuffer(WebGLRenderingContext.ARRAY_BUFFER, this._buffers['a_position']);
        if (this.isMeshDirty) gl.bufferData(WebGLRenderingContext.ARRAY_BUFFER, renderable.mesh.vertices, WebGLRenderingContext.STATIC_DRAW);

        gl.enableVertexAttribArray(this._locations['a_position']);

        gl.vertexAttribPointer(this._locations['a_position'], 3, WebGLRenderingContext.FLOAT, false, 0, 0);
    }

    #compileNormals(gl) {

        this._locations['a_normal'] = gl.getAttribLocation(this._program, 'a_normal');
        this._buffers['a_normal'] = gl.createBuffer();
    }

    #setNormals(gl, renderer, renderable) {
        if (this._locations['a_normal'] < 0)
            return;

        gl.bindBuffer(WebGLRenderingContext.ARRAY_BUFFER, this._buffers['a_normal']);
        if (this.isMeshDirty) {
            gl.bufferData(WebGLRenderingContext.ARRAY_BUFFER, renderable.mesh.normals, WebGLRenderingContext.STATIC_DRAW);
        }
        gl.enableVertexAttribArray(this._locations['a_normal']);

        gl.vertexAttribPointer(this._locations['a_normal'], 3, WebGLRenderingContext.FLOAT, false, 0, 0);
    }

    #compileUVs(gl) {

        this._locations['a_texcoord'] = gl.getAttribLocation(this._program, 'a_texcoord');
        this._buffers['a_texcoord'] = gl.createBuffer();
    }

    #setUVs(gl, renderer, renderable) {
        if (this._locations['a_texcoord'] < 0)
            return;
        gl.bindBuffer(WebGLRenderingContext.ARRAY_BUFFER, this._buffers['a_texcoord']);
        if (this.isMeshDirty)
            gl.bufferData(WebGLRenderingContext.ARRAY_BUFFER, renderable.mesh.uv, WebGLRenderingContext.STATIC_DRAW);

        gl.enableVertexAttribArray(this._locations['a_texcoord']);

        gl.vertexAttribPointer(this._locations['a_texcoord'], 2, WebGLRenderingContext.FLOAT, false, 0, 0);
    }

    clear(gl) {

        if (this.gl) {
            for (const [name, location] of Object.entries(this._locations)) {
                if (name.startsWith('a_') && location >= 0)
                    this.gl.disableVertexAttribArray(location);
            }
            for (const buffer of Object.values(this._buffers))
                this.gl.deleteBuffer(buffer);
            if (this.#programEntry) {
                this.#programEntry.users--;
                if (this.#programEntry.users === 0) {
                    this.gl.deleteProgram(this._program);
                    Material.cache.get(this.gl).programs.delete(this.#programEntry.key);
                }
                this.#programEntry = null;
            }
            else {
                this.gl.deleteProgram(this._program);
            }
        }
        this._buffers = {};
        this._program = null;

        delete this;
    }

    clone() {

        let material = new Material(this.vertexShaderCode, this.fragmentShaderCode);
        material.local = true;
        return material;
    }
}

class Materialee extends Material {
    _compileParams(gl) {

        this.#cx(gl);
    }

    _setParmas(gl, renderer, renderable) {


        this.#cxx(gl, renderer, renderable);
    }
    #cx(gl) {

        this._locations['u_projection'] = gl.getUniformLocation(this._program, 'u_projection');
        this._locations['u_view'] = gl.getUniformLocation(this._program, 'u_view');
        this._locations['u_world'] = gl.getUniformLocation(this._program, 'u_world');
    }

    #cxx(gl, renderer, renderable) {

        const sceneMatrix = renderable.transform.sceneMatrix;
        gl.uniformMatrix4fv(this._locations['u_projection'], false, renderer.projectionMatrix);

        gl.uniformMatrix4fv(this._locations['u_view'], false, renderer.viewMatrix);
        gl.uniformMatrix4fv(this._locations['u_world'], false, sceneMatrix);

    }
}

class MaterialWithTexture extends Material {

    textures;

    constructor(vertexShader, fragmentShader, textures) {
        super(vertexShader, fragmentShader);

        if (!textures)
            this.textures = [new Texture('./textures/konata.jpg'), new Texture('./textures/bocchi.png'), new Texture('./textures/frieren.png')]
        else {
            this.textures = textures;
        }
    }

    _compileParams(gl) {
        super._compileParams(gl);

        this.#compileTexture(gl);
    }

    _setParmas(gl, renderer, renderable) {
        super._setParmas(gl, renderer, renderable);

        this.#setTexture(gl, renderer, renderable);
    }

    #compileTexture(gl, renderer, renderable) {

        if (this.textures.length === 1) {

            this._locations['u_texture'] = gl.getUniformLocation(this._program, 'u_texture');
        }
        for (let i = 0; i < this.textures.length; i++) {
            this._locations['u_texture' + i] = gl.getUniformLocation(this._program, 'u_texture' + i);
            this.textures[i].compile(gl);

        }
    }


    #setTexture(gl, renderer, renderable) {

        if (this.textures.length === 1) {
            gl.uniform1i(this._locations['u_texture'], 0);


            gl.activeTexture(gl.TEXTURE0);

            if (this.textures[0].preventRendering) {
                gl.bindTexture(gl.TEXTURE_2D, null);
            }
            else
                this.bindTexture(gl, this.textures[0], 0);
        }
        else {
            for (let i = 0; i < this.textures.length; i++) {

                gl.uniform1i(this._locations['u_texture' + i], i);

                gl.activeTexture(gl.TEXTURE0 + i);
                this.bindTexture(gl, this.textures[i], i);
            }

        }
    }

    bindTexture(gl, texture, unit) {
        if (texture instanceof RenderTexture)
            texture.bindForSampling(gl, unit);
        else
            gl.bindTexture(gl.TEXTURE_2D, texture.texture);
    }
}

class MaterialWithShadow extends MaterialWithTexture {

    constructor(v = `
attribute vec4 a_position;
attribute vec2 a_texcoord;
attribute vec3 a_normal;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_world;
uniform mat4 u_textureMatrix;

varying vec2 v_texcoord;
varying vec4 v_projectedTexcoord;
varying vec3 v_normal;
varying vec3 v_position;
void main() {
    vec4 worldPosition = u_world * a_position;
    gl_Position = u_projection * u_view * worldPosition;
  v_position = (u_view * u_world * a_position).xyz;
    v_texcoord = a_texcoord;
    v_projectedTexcoord = u_textureMatrix * worldPosition;
    v_normal = normalize(mat3(u_world) * a_normal);
}
  `,

        f = `precision mediump float;
varying vec2 v_texcoord;
varying vec4 v_projectedTexcoord;
varying vec3 v_normal;
varying vec3 v_position;

uniform sampler2D u_texture0; // Tekstura koloru
uniform sampler2D u_texture1; // Tekstura głębokości (cienia)
uniform vec3 u_reverseLightDirection; // Kierunek światła (odwrotny)

float bias = -0.005; // Bias dla uniknięcia efektu "shadow acne"
float softness = 0.005; // Dodatkowy parametr dla miękkich cieni
 float u_fogDensity = 0.5;
 uniform sampler2D u_texture;
 vec4 u_fogColor = vec4(0.7, 0.8, 1.0, 1.);
  float u_fogNear = 100.;
 float u_fogFar = 300.;
void main() {
    // Normalizacja wektora normalnych
    vec3 normal = normalize(v_normal);

    // Obliczanie intensywności światła na podstawie kąta padania
    float light = max(dot(normal, u_reverseLightDirection), 0.2);

    // Przekształcanie współrzędnych tekstury projekcji
    vec3 projectedTexcoord = v_projectedTexcoord.xyz / v_projectedTexcoord.w;
    float currentDepth = projectedTexcoord.z + bias;

    // Sprawdzanie, czy projekcja mieści się w zakresie
    bool inRange = 
        projectedTexcoord.x >= 0.0 && projectedTexcoord.x <= 1.0 &&
        projectedTexcoord.y >= 0.0 && projectedTexcoord.y <= 1.0;

    // Pobieranie głębokości z tekstury głębokości
    float projectedDepth = texture2D(u_texture0, projectedTexcoord.xy).r;

    // Obliczanie stopnia oświetlenia cienia, z uwzględnieniem miękkich krawędzi
    float shadowLight = inRange && projectedDepth + softness < currentDepth ? 0.1 : 1.0;

    // Pobieranie koloru z tekstury koloru
    vec4 texColor = texture2D(u_texture1, v_texcoord);

    // Kombinowanie światła, cienia i koloru tekstury
    vec3 shadedColor = texColor.rgb * light * shadowLight;

    // Ustawienie końcowego koloru fragmentu

      float fogDistance = length(v_position);
  float fogAmount = smoothstep(u_fogNear, u_fogFar, fogDistance);

  gl_FragColor = mix(vec4(shadedColor, texColor.a), u_fogColor, fogAmount);
}
        `, text) {

        if (text instanceof Array === false)
            console.error('sadasda');

        super(v, f, text);
    }

    postprocess() { this.isMeshDirty = false; }
    _compileParams(gl) {
        super._compileParams(gl);

        this.#cx(gl);
    }

    _setParmas(gl, renderer, renderable) {

        super._setParmas(gl, renderer, renderable);

        this.#cxx(gl, renderer, renderable);
    }
    #cx(gl) {

        this._locations['u_projection'] = gl.getUniformLocation(this._program, 'u_projection');
        this._locations['u_view'] = gl.getUniformLocation(this._program, 'u_view');
        this._locations['u_world'] = gl.getUniformLocation(this._program, 'u_world');
        this._locations['u_textureMatrix'] = gl.getUniformLocation(this._program, 'u_textureMatrix');
        this._locations['u_projectedTexture'] = gl.getUniformLocation(this._program, 'u_projectedTexture');
        this._locations['u_reverseLightDirection'] = gl.getUniformLocation(this._program, 'u_reverseLightDirection');
        this._locations.u_shadowParams = gl.getUniformLocation(this._program, 'u_shadowParams');
    }

    #cxx(gl, renderer, renderable) {

        const sunRenderer = Scene.Instance.GetActorByIdentifier("sun").GetCompnentByType(Renderer);
        const sceneMatrix = renderable.transform.sceneMatrix;
        gl.uniformMatrix4fv(this._locations['u_projection'], false, renderer.projectionMatrix);

        let textureMatrix = m4.identity();
        textureMatrix = m4.translate(textureMatrix, 0.5, 0.5, 0.5);
        textureMatrix = m4.scale(textureMatrix, 0.5, 0.5, 0.5);
        textureMatrix = m4.multiply(textureMatrix, sunRenderer.projectionMatrix);

        textureMatrix = m4.multiply(
            textureMatrix,
            sunRenderer.viewMatrix);
        gl.uniformMatrix4fv(this._locations['u_view'], false, renderer.viewMatrix);
        gl.uniformMatrix4fv(this._locations['u_textureMatrix'], false, textureMatrix);
        gl.uniformMatrix4fv(this._locations['u_world'], false, sceneMatrix);
        gl.uniform3fv(this._locations['u_reverseLightDirection'], m4.inverse(sunRenderer.viewMatrix).slice(8, 11));
        gl.uniform3fv(this._locations.u_shadowParams, [
            1 / sunRenderer.renderTexture.width, 1 / sunRenderer.renderTexture.height,
            1 / (sunRenderer.shadowDepth - 1)
        ]);

    }


    clone() {
        let material = new MaterialWithShadow(this.vertexShaderCode, this.fragmentShaderCode, this.textures);
        material.local = true;
        return material;
    }
}