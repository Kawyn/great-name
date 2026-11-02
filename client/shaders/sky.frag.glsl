precision highp float;
uniform mat4 u_viewDirectionProjectionInverse;
uniform vec3 u_sunPosition;
uniform float u_daylight;
uniform float u_starPixelSize;
uniform float u_skyTime;
uniform vec3 u_originStar;
varying vec4 v_position;

vec3 starHash(vec3 cell) {
    return fract(sin(vec3(dot(cell, vec3(127.1, 311.7, 74.7)),
        dot(cell, vec3(269.5, 183.3, 246.1)),
        dot(cell, vec3(113.5, 271.9, 182.7)))) * 43758.5453);
}

vec3 starLayer(vec3 direction, float scale, float density, float brightness, float seed) {
    vec3 absolute = abs(direction);
    vec2 uv;
    float face;
    if (absolute.x > absolute.y && absolute.x > absolute.z) {
        uv = direction.yz / absolute.x;
        face = direction.x > 0.0 ? 1.0 : 2.0;
    } else if (absolute.y > absolute.z) {
        uv = direction.xz / absolute.y;
        face = direction.y > 0.0 ? 3.0 : 4.0;
    } else {
        uv = direction.xy / absolute.z;
        face = direction.z > 0.0 ? 5.0 : 6.0;
    }
    vec2 p = uv * scale;
    vec2 cell = floor(p);
    vec3 light = vec3(0.0);
    float pixelWidth = max(u_starPixelSize * scale * (1.0 + dot(uv, uv)), 0.001);
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 id = cell + vec2(float(x), float(y));
            vec3 random = starHash(vec3(id, face + seed));
            vec3 variation = starHash(vec3(id + 19.7, face + seed + 43.1));
            vec2 center = id + 0.15 + random.xy * 0.7;
            float radius = mix(0.025, 0.13, pow(variation.x, 3.0));
            float distance = length(p - center);
            float width = max(radius * 0.5, pixelWidth * 0.8);
            float core = exp(-0.5 * distance * distance / (width * width));
            float intensity = brightness * mix(0.25, 1.0, variation.y) *
                min(1.0, radius * radius / (2.0 * width * width));
            vec3 tint = mix(vec3(0.68, 0.79, 1.0), vec3(1.0, 0.88, 0.69), variation.z);
            float twinkle = 0.82 + 0.18 * sin(u_skyTime * mix(1.3, 3.2, variation.x) +
                random.x * 6.28318) * sin(u_skyTime * 0.73 + random.y * 6.28318);
            light += tint * core * intensity * twinkle * step(1.0 - density, random.z);
        }
    }
    return light;
}

vec3 shootingStar(vec3 direction) {
    float event = floor(u_skyTime / 45.0);
    vec3 random = starHash(vec3(event, 83.1, 21.7));
    float age = mod(u_skyTime, 45.0) - mix(6.0, 38.0, random.x);
    if (age < 0.0 || age > 1.3)
        return vec3(0.0);
    float azimuth = random.y * 6.28318;
    vec3 start = normalize(vec3(cos(azimuth), mix(0.5, 1.6, random.z), sin(azimuth)));
    vec3 tangent = normalize(cross(start, vec3(0.0, 1.0, 0.0)));
    vec3 head = normalize(start + tangent * (age / 1.3 - 0.5) * 0.65);
    vec3 travel = normalize(cross(cross(head, tangent), head));
    vec3 normal = normalize(cross(head, travel));
    float along = dot(direction - head, travel);
    float across = abs(dot(direction, normal));
    float width = max(0.0012, u_starPixelSize * 0.75);
    float tail = smoothstep(-0.15, 0.0, along) * (1.0 - smoothstep(0.0, width, along));
    float core = 1.0 - smoothstep(0.0, width, across);
    float fade = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.85, 1.3, age));
    return vec3(0.72, 0.84, 1.0) * tail * core * fade *
        step(0.9, dot(direction, head)) * 1.5;
}

void main() {
    vec4 projected = u_viewDirectionProjectionInverse * v_position;
    vec3 direction = normalize(projected.xyz / projected.w);
    vec3 sunDirection = normalize(u_sunPosition);
    float dusk = (1.0 - smoothstep(0.0, 0.32, abs(sunDirection.y))) * u_daylight;
    vec3 horizon = mix(vec3(0.035, 0.047, 0.075), vec3(0.91, 0.73, 0.49), u_daylight);
    horizon = mix(horizon, vec3(0.75, 0.31, 0.15), dusk * 0.65);
    vec3 zenith = mix(vec3(0.006, 0.012, 0.035), vec3(0.36, 0.48, 0.57), u_daylight);
    vec3 color = mix(horizon, zenith, smoothstep(0.0, 0.9, direction.y));
    float sun = max(dot(direction, sunDirection), 0.0);
    color += vec3(0.20, 0.13, 0.06) * pow(sun, 24.0) * u_daylight;
    color = mix(color, vec3(1.0, 0.94, 0.72), smoothstep(0.9990, 0.9995, sun) * u_daylight);
    float moon = max(dot(direction, -sunDirection), 0.0);
    color += vec3(0.10, 0.13, 0.20) * pow(moon, 80.0) * (1.0 - u_daylight);
    color = mix(color, vec3(0.71, 0.77, 0.83), smoothstep(0.9993, 0.99965, moon) * (1.0 - u_daylight));
    vec3 stars = starLayer(direction, 22.0, 0.08, 3.5, 0.0) +
        starLayer(direction, 48.0, 0.14, 2.0, 17.0) +
        starLayer(direction, 95.0, 0.08, 1.0, 59.0);
    float poleDistance = length(direction - u_originStar);
    float poleWidth = max(0.0065, u_starPixelSize);
    vec3 originLight = vec3(0.64, 0.86, 1.0) *
        (4.0 * (1.0 - smoothstep(0.0, poleWidth, poleDistance)) +
        0.24 * (1.0 - smoothstep(0.0, 0.030, poleDistance)));
    color += stars * (1.0 - u_daylight) *
        smoothstep(0.03, 0.16, direction.y) * (1.0 - smoothstep(0.9988, 0.9993, moon));
    color += (originLight + shootingStar(direction) * smoothstep(0.03, 0.16, direction.y)) *
        (1.0 - u_daylight);
    gl_FragColor = vec4(color, 1.0);
}
