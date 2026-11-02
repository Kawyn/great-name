precision highp float;
varying vec4 v_projectedTexcoord;
varying vec4 v_biome;
varying vec3 v_normal;
varying vec3 v_position;
varying vec3 v_surface;
float hash(vec2 point) {
    return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
}
float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 f = fract(point);
    vec2 blend = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), blend.x),
        mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), blend.x), blend.y);
}
void main() {
    vec3 normal = normalize(v_normal);
    float slope = 1.0 - smoothstep(0.45, 0.9, normal.y);
    float variation = noise(v_surface.xz * 0.045);
    float altitude = smoothstep(-30.0, 80.0, v_surface.y);
    vec3 sand = mix(vec3(0.76, 0.48, 0.25), vec3(0.96, 0.79, 0.52),
        0.45 + 0.30 * altitude + 0.15 * variation);
    sand = mix(sand, vec3(0.90, 0.71, 0.51), v_biome.x * 0.20);
    vec3 rock = mix(vec3(0.56, 0.33, 0.23), vec3(0.69, 0.46, 0.31), variation);
    vec3 color = mix(sand, rock, slope * 0.65);
    color *= 0.98 + 0.04 * noise(v_surface.xz * 0.8);
    color *= surfaceLighting(normal, v_projectedTexcoord);
    float fog = smoothstep(100.0, 360.0, length(v_position));
    gl_FragColor = vec4(mix(color, worldFogColor(), fog), 1.0);
}
