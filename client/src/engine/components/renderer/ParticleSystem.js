class ParticleMaterial extends Material {
    transparent = true;

    constructor(color, { additive = true, lit = false } = {}) {
        super(`attribute vec3 a_position;
            attribute vec2 a_particle;
            uniform mat4 u_worldView;
            uniform mat4 u_projection;
            uniform float u_projectionScale;
            uniform float u_maxPointSize;
            varying float v_alpha;
            void main() {
                vec4 position = u_worldView * vec4(a_position, 1.0);
                gl_Position = u_projection * position;
                gl_PointSize = clamp(a_particle.x * u_projectionScale /
                    max(0.1, -position.z), 1.0, u_maxPointSize);
                v_alpha = a_particle.y;
            }`, `precision mediump float;
            uniform vec4 u_color;
            varying float v_alpha;
            void main() {
                float radius = length(gl_PointCoord * 2.0 - 1.0);
                float alpha = (1.0 - smoothstep(0.2, 1.0, radius)) * v_alpha * u_color.a;
                gl_FragColor = vec4(u_color.rgb, alpha);
            }`);
        this.color = color;
        this.additive = additive;
        this.lit = lit;
    }

    _compileParams(gl) {
        for (const name of ['a_position', 'a_particle'])
            this._locations[name] = gl.getAttribLocation(this._program, name);
        for (const name of ['u_worldView', 'u_projection', 'u_projectionScale', 'u_maxPointSize', 'u_color'])
            this._locations[name] = gl.getUniformLocation(this._program, name);
        this._buffers.particles = gl.createBuffer();
        this.maxPointSize = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
    }

    _setParmas(gl, renderer, renderable) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.particles);
        if (!this.allocated) {
            gl.bufferData(gl.ARRAY_BUFFER, renderable.mesh.particleData, gl.DYNAMIC_DRAW);
            this.allocated = true;
        }
        else if (this.isMeshDirty) {
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, renderable.mesh.particleData);
        }
        for (const [name, size, offset] of [['a_position', 3, 0], ['a_particle', 2, 12]]) {
            gl.enableVertexAttribArray(this._locations[name]);
            gl.vertexAttribPointer(this._locations[name], size, gl.FLOAT, false, 20, offset);
        }
        gl.uniformMatrix4fv(this._locations.u_worldView, false,
            m4.multiply(renderer.viewMatrix, renderable.transform.sceneMatrix));
        gl.uniformMatrix4fv(this._locations.u_projection, false, renderer.projectionMatrix);
        gl.uniform1f(this._locations.u_projectionScale, gl.canvas.height * renderer.projectionMatrix[5] / 2);
        gl.uniform1f(this._locations.u_maxPointSize, this.maxPointSize);
        const daylight = this.lit
            ? Scene.Instance.GetActorByIdentifier('sun').GetCompnentByType(Transform).daylight ?? 1 : 1;
        const light = this.lit ? 0.12 + 0.88 * daylight : 1;
        gl.uniform4fv(this._locations.u_color, this.color.map((value, axis) => axis < 3 ? value * light : value));
        this.isMeshDirty = false;
    }

    render(gl, renderer, renderable) {
        const blending = gl.isEnabled(gl.BLEND);
        const depthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
        const sourceRGB = gl.getParameter(gl.BLEND_SRC_RGB);
        const destinationRGB = gl.getParameter(gl.BLEND_DST_RGB);
        const sourceAlpha = gl.getParameter(gl.BLEND_SRC_ALPHA);
        const destinationAlpha = gl.getParameter(gl.BLEND_DST_ALPHA);
        const equationRGB = gl.getParameter(gl.BLEND_EQUATION_RGB);
        const equationAlpha = gl.getParameter(gl.BLEND_EQUATION_ALPHA);
        try {
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFunc(gl.SRC_ALPHA, this.additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            gl.drawArrays(gl.POINTS, 0, renderable.mesh.particleData.length / 5);
        }
        finally {
            gl.depthMask(depthMask);
            gl.blendFuncSeparate(sourceRGB, destinationRGB, sourceAlpha, destinationAlpha);
            gl.blendEquationSeparate(equationRGB, equationAlpha);
            if (!blending)
                gl.disable(gl.BLEND);
        }
    }
}

class ParticleSystem extends Component {
    #config;
    #particles = [];
    #renderActor;
    #material;
    #data;
    #request;
    #generation = 0;

    constructor(definition, { daylightOnly = false, continuous = true, worldSpace = false,
        additive = true, lit = false } = {}) {
        super();
        this.definition = definition;
        this.daylightOnly = daylightOnly;
        this.continuous = continuous;
        this.worldSpace = worldSpace;
        this.additive = additive;
        this.lit = lit;
    }

    static validate(config) {
        const range = value => Array.isArray(value) && value.length === 2 &&
            value.every(Number.isFinite) && value[0] > 0 && value[1] >= value[0];
        const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
        const box = value => value && vector(value.min) && vector(value.max) &&
            value.min.every((entry, index) => entry <= value.max[index]);
        if (!config || !Number.isInteger(config.count) || config.count < 1 || config.count > 2048 ||
            !range(config.lifetime) || !range(config.size) || !box(config.spawn) || !box(config.velocity) ||
            !vector(config.acceleration) || !Number.isFinite(config.turbulence) || config.turbulence < 0 ||
            !Array.isArray(config.color) || config.color.length !== 4 ||
            !config.color.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
            throw new Error('Invalid particle definition: expected count 1..2048, positive lifetime/size ranges, spawn/velocity boxes, acceleration, turbulence and RGBA color.');
        }
    }

    onEnable() {
        Scene.Instance.TimeManager.addObjectToRefresh(this, 160);
        this.load();
    }

    async load() {
        const generation = ++this.#generation;
        const request = new AbortController();
        this.#request = request;
        try {
            let config = this.definition;
            if (typeof config === 'string') {
                const response = await fetch(config, { signal: request.signal });
                if (!response.ok)
                    throw new Error(`Particle definition request failed (${response.status}): ${config}`);
                config = await response.json();
            }
            ParticleSystem.validate(config);
            if (generation !== this.#generation)
                return;
            this.#config = JSON.parse(JSON.stringify(config));
            this.#data = new Float32Array(config.count * 5);
            this.#particles = Array.from({ length: config.count }, () => ({}));
            for (const particle of this.#particles) {
                this.spawn(particle);
                if (this.continuous)
                    this.advance(particle, Math.random() * particle.lifetime);
                else
                    particle.age = particle.lifetime;
            }
            this.#material = new ParticleMaterial(config.color, { additive: this.additive, lit: this.lit });
            const mesh = new Mesh([], [], []);
            mesh.particleData = this.#data;
            this.#renderActor = new Actor(`${this.actor.identifier}_particles`, [
                new Transform(), new Renderable(mesh, this.#material)
            ]);
            if (!this.worldSpace)
                this.#renderActor.parent = this.actor;
            Scene.Instance.PushActor(this.#renderActor);
            this.onRefresh(0);
        }
        catch (error) {
            if (request.signal.aborted)
                return;
            console.error('ParticleSystem failed:', error);
            window.dispatchEvent(new CustomEvent('particleserror', { detail: { definition: this.definition, error } }));
        }
    }

    spawn(particle) {
        const config = this.#config;
        const random = (min, max) => min + Math.random() * (max - min);
        particle.position = config.spawn.min.map((value, index) => random(value, config.spawn.max[index]));
        particle.velocity = config.velocity.min.map((value, index) => random(value, config.velocity.max[index]));
        particle.lifetime = random(...config.lifetime);
        particle.size = random(...config.size);
        particle.age = 0;
        particle.phase = random(0, Math.PI * 2);
    }

    advance(particle, deltaTime) {
        particle.age += deltaTime;
        for (let axis = 0; axis < 3; axis++) {
            const acceleration = this.#config.acceleration[axis];
            particle.position[axis] += particle.velocity[axis] * deltaTime + acceleration * deltaTime * deltaTime / 2;
            particle.velocity[axis] += acceleration * deltaTime;
        }
    }

    emit(count, position, scale = 1) {
        if (!Number.isInteger(count) || count < 0 ||
            !Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite) ||
            !Number.isFinite(scale) || scale <= 0 || scale > 3)
            throw new Error('Particle bursts require a nonnegative count, a finite position and a scale in (0, 3].');
        let emitted = 0;
        for (const particle of this.#particles) {
            if (emitted >= count)
                break;
            if (particle.age < particle.lifetime)
                continue;
            this.spawn(particle);
            particle.position = particle.position.map((value, axis) => value * scale + position[axis]);
            particle.size *= scale;
            particle.velocity = particle.velocity.map(value => value * scale);
            emitted++;
        }
        return emitted;
    }

    shift(offset) {
        if (!Array.isArray(offset) || offset.length !== 3 || !offset.every(Number.isFinite))
            throw new Error('Particle shifts require a finite offset.');
        for (const particle of this.#particles)
            for (let axis = 0; axis < 3; axis++)
                particle.position[axis] += offset[axis];
    }

    clearParticles() {
        for (const particle of this.#particles)
            particle.age = particle.lifetime;
        this.#data?.fill(0);
    }

    onRefresh(deltaTime) {
        if (!this.#material)
            return;
        const daylight = this.daylightOnly
            ? Scene.Instance.GetActorByIdentifier('sun').GetCompnentByType(Transform).daylight ?? 1
            : 1;
        const dt = Math.min(0.1, Math.max(0, deltaTime));
        for (let index = 0; index < this.#particles.length; index++) {
            const particle = this.#particles[index];
            this.advance(particle, dt);
            if (particle.age >= particle.lifetime) {
                if (this.continuous)
                    this.spawn(particle);
                else {
                    this.#data[index * 5 + 4] = 0;
                    continue;
                }
            }
            const progress = particle.age / particle.lifetime;
            const turbulence = Math.sin(particle.age * 2 + particle.phase) * this.#config.turbulence;
            this.#data.set([
                particle.position[0], particle.position[1] + turbulence, particle.position[2],
                particle.size, Math.min(1, progress * 5, (1 - progress) * 5) * daylight
            ], index * 5);
        }
        this.#material.isMeshDirty = true;
    }

    onDisable() {
        Scene.Instance.TimeManager.removeObjectToRefresh(this);
        this.#generation++;
        this.#request?.abort();
        if (this.#renderActor) {
            this.#renderActor.destroy();
            this.#material.clear();
        }
        this.#renderActor = null;
        this.#material = null;
        this.#particles = [];
        this.#data = null;
        this.#config = null;
    }
}
