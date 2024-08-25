class Skybox extends Material {

    constructor(vert, frag) {
        super(`
            attribute vec4 a_position;
varying vec4 v_position;
void main() {
  v_position = a_position;
  gl_Position = a_position;
  gl_Position.z = 1.;
}
            `,
            `precision mediump float;

uniform mat4 u_viewDirectionProjectionInverse;
uniform mat4 u_viewProjectionMatrix;
vec4 sun = vec4(0., 1., 0., 1.);
varying vec4 v_position;
vec3 v_direction;
// Prosta funkcja szumu (hash) do generowania gwiazd

float random (in vec2 st) {
    return fract(sin(dot(st.xy,
                         vec2(12.9898,78.233)))*
        43758.5453123);
}

// Based on Morgan McGuire @morgan3d
// https://www.shadertoy.com/view/4dS3Wd
float noise2D (in vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    // Four corners in 2D of a tile
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
            (c - a)* u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
}

float cellularNoise(vec2 uv) {
    vec2 gv = fract(uv) - 0.5;
    vec2 id = floor(uv);
    float d = 1.0;

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 point = vec2(float(x) + fract(sin(dot(id + neighbor, vec2(127.1, 311.7))) * 43758.5453),
                              float(y) + fract(sin(dot(id + neighbor, vec2(269.5, 183.3))) * 43758.5453));
            d = min(d, length(gv - point));
        }
    }

    return d;
}


float cellularNoise3D(vec3 p) {
    vec3 ip = floor(p);
    vec3 fp = fract(p);
    float d = 1.0;

    for (int z = -1; z <= 1; z++) {
        for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
                vec3 neighbor = vec3(float(x), float(y), float(z));
                vec3 point = neighbor + vec3(
                    fract(sin(dot(ip + neighbor, vec3(127.1, 311.7, 74.7))) * 43758.5453),
                    fract(sin(dot(ip + neighbor, vec3(269.5, 183.3, 246.1))) * 43758.5453),
                    fract(sin(dot(ip + neighbor, vec3(113.5, 271.9, 182.7))) * 43758.5453)
                );
                d = min(d, length(fp - point));
            }
        }
    }

    return d;
}
    #define OCTAVES 6
float fbm (in vec2 st) {
    // Initial values
    float value = 0.0;
    float amplitude = .5;
    float frequency = 0.;
    //
    // Loop of octaves
    for (int i = 0; i < OCTAVES; i++) {
        value += amplitude * noise2D(st);
        st *= 2.;
        amplitude *= .5;
    }
    return value;
}

uniform float u_time;      // Czas używany do animacji
void main() {
  vec4 pos = u_viewDirectionProjectionInverse * v_position;
   v_direction = pos.xyz / pos.w;
  vec4 x = u_viewProjectionMatrix * sun;
  x = u_viewDirectionProjectionInverse * x;
  // Normalizacja kierunku widzenia
     vec3 dir = normalize(v_direction);
    // Cykl dnia: u_time wpływa na kąt słońca
    float cycle = mod(u_time, 24.0); // Czas cyklu, 24h odpowiada pełnemu cyklowi dzień-noc
    float angle =  (cycle / 24.0) * 2.0 * 3.14159; // Kąt słońca w radianach

    // Ustalanie pozycji słońca na podstawie czasu
    vec3 sunDirection = normalize(vec3(cos(angle), sin(angle), .4));

    // Ustalanie koloru nieba (gradient)
    float t = 0.5 * (dir.y + 1.0);
    vec3 daySkyColor = mix(vec3(0.2, 0.3, 0.6), vec3(0.7, 0.8, 1.0), t /2.);
    vec3 sunsetSkyColor = mix(vec3(0.8, 0.3, 0.1), vec3(0.9, 0.5, 0.3), t);
    vec3 nightSkyColor = mix(vec3(0.02, 0.05, 0.2), vec3(0.01, 0.01, 0.1), t); // Ciemnoniebieski gradient

    // Ustalanie intensywności słońca
    float sunIntensity = max(dot(dir, sunDirection), 0.0);
    float timexxx = max(dot(vec3(0., 1., 0.) * 1., sunDirection), 0.0);
    float xtimexxx = max(dot(vec3(0., -1., 0.) * 1., sunDirection), 0.0);
    float horizontAngle = max(dot(vec3(0., 1., 0.), dir), 0.0);

    // Kolor słońca - zmienia się na bardziej czerwony w pobliżu horyzontu
    vec3 sunColor = mix(vec3(1.0, 0.9, 0.7), vec3(1.0, 0.5, 0.2), 1.0 - sunIntensity);
    float sunGlow = pow(sunIntensity, 100.0 + (400. * pow(max(0., sunDirection.y), 2.0)));

    vec3 morningColor = mix(sunsetSkyColor, daySkyColor , min(1., max( pow(timexxx, 0.5), 0.3) +pow(horizontAngle, 0.9)));// pow(horizontAngle, timexxx * 0.5));// ;
    morningColor = mix(morningColor, daySkyColor, min( 1.- sunIntensity, 0.3));

    vec3 xxxcolor = mix(morningColor, nightSkyColor, pow(xtimexxx, 0.7));
    // Przejście między dniem, zachodem/wschodem i nocą
    vec3 skyColor = xxxcolor;// mix(xxxcolor, daySkyColor, pow(sunIntensity * timexxx, 100.));//mix(xxxcolor,), timexxx); //mix( morningColor, daySkyColor,   max(0., horizontAngle)); // mix( mix(morningColor, daySkyColor, horizontAngle) * (1.0 - sunIntensity)                    , mix(morningColor, daySkyColor, sunIntensity),0.);
    // Generowanie gwiazd na nocnym niebie
 // Generowanie gwiazd na nocnym niebie przy użyciu 3D szumu komórkowego
    float noise = cellularNoise3D(dir * 30.0); // Skalowanie współrzędnych dla większej gęstości gwiazd
    float starIntensity = pow(1.-noise, 20.)  *3.;//smoothstep(0.0, 0.01, 0.15 - noise) ; // Rzadkie, jasne gwiazdy
    vec3 starColor = vec3(1.0) * starIntensity  * pow(xtimexxx, 7.5) * pow( (sin(u_time * 5.*cellularNoise(floor(dir.xy * 30.)) + 3.14 *cellularNoise(floor(dir.xy * 30.))) / 4. + 0.5), 2.) ;

/*
       // Księżyc
    float s = 0.5;

    float moonAngle = 0.9 * angle;
        vec3 moonlightColor = vec3(0.91, 0.98, 0.92);
    vec3 shadowDirection  = normalize(vec3(-cos(moonAngle) * sin(s), -sin(moonAngle)*sin(s),cos(s)));
    float moonCycle = mod(u_time , 24.0 * 28.0);

    s = 0.6;
    float phase = sin(moonCycle * 3.14159 * 2. ); // 28 dniowy cykl faz księżyca
    //    vec3 moonDirection  = normalize(vec3(-cos(moonAngle + phase * 0.25066 * 2.   ), -sin(moonAngle),0.));
    vec3 moonDirection  = normalize(vec3(-cos(moonAngle) * sin(s), -sin(moonAngle)*sin(s),cos(s)));
//cos(t)*sin(s),sin(t)*sin(s),cos(s)
        
    float moonIntensity = pow(smoothstep(0.10, 0.05, distance(moonDirection, dir)), 100.);
            float moonGlow = pow(max(dot(dir, moonDirection), 0.0), 1000.0);

    vec3 finalColor = skyColor + sunColor * sunGlow  +moonlightColor * moonGlow  * (1. -smoothstep(0.15, 0.1, distance(shadowDirection, dir)));
     finalColor += starColor  * (1.-moonIntensity);

    float moonNoise = max(moonIntensity * 1., .0) * max(0.1, fbm((dir.xy - moonDirection.xy) * 20.));
    vec3 moonColor = mix(vec3(0.91, 0.98, 0.92), vec3(0.06, 0.1, 0.23), moonNoise);
     moonColor = mix(moonColor, nightSkyColor,1.-sin( distance(shadowDirection, dir) * 10.));

        vec4 col  =mix(vec4(moonColor, 1.), vec4(finalColor , 1.), (1. - moonIntensity));
        */
    vec3 finalColor = skyColor + sunColor * sunGlow + starColor ;

       gl_FragColor = vec4(finalColor, 1.);
  }`)
    }

    postprocess() { this.isMeshDirty = false }
    _compileParams(gl) {
        this.#compilePosition(gl)
        this.#compileProjection(gl);
        this.#compileTime(gl);
    }

    _setParmas(gl, renderer, renderable) {
        this.#setProjection(gl, renderer, renderable);
        this.#setTime(gl, renderer, renderable);
        this.#setPosition(gl, renderer, renderable);
    }

    render(gl, renderer, renderable) {
        gl.depthFunc(gl.LEQUAL);
        gl.drawArrays(WebGLRenderingContext.TRIANGLES, 0, renderable.mesh.vertices.length / 2);
        gl.depthFunc(gl.LESS);
    }
    #compileProjection(gl) {

        this._locations['u_viewDirectionProjectionInverse'] = gl.getUniformLocation(this._program, 'u_viewDirectionProjectionInverse');
        this._locations['u_viewProjectionMatrix'] = gl.getUniformLocation(this._program, 'u_viewProjectionMatrix');


    }
    #compileTime(gl) {

        this.startTime = new Date().getTime();
        this._locations['u_time'] = gl.getUniformLocation(this._program, 'u_time');
    }

    #setTime(gl, renderer, renderable) {

        gl.uniform1f(this._locations['u_time'], (this.startTime - new Date().getTime()) / 1000);
    }
    #setProjection(gl, renderer, renderable) {

        const projectionMatrix = renderer.projectionMatrix;
        const viewMatrix = [...renderer.viewMatrix];
        viewMatrix[12] = 0;
        viewMatrix[13] = 0;
        viewMatrix[14] = 0;
        var viewDirectionProjectionMatrix =
            m4.multiply(projectionMatrix, viewMatrix);
        var viewDirectionProjectionInverseMatrix =
            m4.inverse(viewDirectionProjectionMatrix);


        gl.uniformMatrix4fv(
            this._locations['u_viewDirectionProjectionInverse'], false, viewDirectionProjectionInverseMatrix);


        gl.uniformMatrix4fv(
            this._locations['u_viewProjectionMatrix'], false,
            renderer.viewProjectionMatrix);


    }
    #compilePosition(gl) {

        this._locations['a_position'] = gl.getAttribLocation(this._program, 'a_position');
        this._buffers['a_position'] = gl.createBuffer();
    }

    #setPosition(gl, renderer, renderable) {

        gl.bindBuffer(WebGLRenderingContext.ARRAY_BUFFER, this._buffers['a_position']);
        gl.bufferData(WebGLRenderingContext.ARRAY_BUFFER, renderable.mesh.vertices, WebGLRenderingContext.STATIC_DRAW);

        gl.enableVertexAttribArray(this._locations['a_position']);

        gl.vertexAttribPointer(this._locations['a_position'], 2, WebGLRenderingContext.FLOAT, false, 0, 0);
    }
}