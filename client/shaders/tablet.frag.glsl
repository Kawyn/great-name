precision highp float;
varying vec3 v_normal;
varying vec2 v_texcoord;
varying vec4 v_shadow;
varying vec3 v_position;
void main() {
    vec2 uv = v_texcoord;
    float grain = sin(uv.x * 91.0 + sin(uv.y * 43.0)) * 0.02;
    float rows = step(0.82, fract(uv.y * 12.0)) * step(0.17, uv.x) * step(uv.x, 0.83);
    float writing = rows * step(0.22, uv.y) * step(uv.y, 0.79);
    float edge = 1.0 - smoothstep(0.025, 0.065, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    vec3 color = mix(vec3(0.055, 0.29, 0.18) + grain, vec3(0.46, 0.55, 0.32), max(writing * 0.7, edge * 0.55));
    color *= surfaceLighting(v_normal, v_shadow);
    color += vec3(0.025, 0.065, 0.04);
    float fog = smoothstep(100.0, 360.0, length(v_position));
    gl_FragColor = vec4(mix(color, worldFogColor(), fog), 1.0);
}
