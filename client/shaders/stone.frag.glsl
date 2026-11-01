precision highp float;
varying vec3 v_normal;
varying vec3 v_position;
varying vec2 v_color;
varying vec4 v_shadow;
varying vec3 v_stone;
float stoneHash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float stoneNoise(vec3 p) {
    vec3 cell = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(stoneHash(cell), stoneHash(cell + vec3(1,0,0)), f.x),
        mix(stoneHash(cell + vec3(0,1,0)), stoneHash(cell + vec3(1,1,0)), f.x), f.y),
        mix(mix(stoneHash(cell + vec3(0,0,1)), stoneHash(cell + vec3(1,0,1)), f.x),
        mix(stoneHash(cell + vec3(0,1,1)), stoneHash(cell + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
    float mineral = stoneNoise(v_stone * 0.32 + v_color.x * 17.0);
    float band = sin(v_stone.y * 1.15 + v_stone.x * 0.34 + mineral * 4.0);
    float vein = 1.0 - smoothstep(0.03, 0.14, abs(band));
    vec3 color = mix(vec3(0.30, 0.25, 0.24), vec3(0.55, 0.39, 0.29), v_color.x);
    color *= 0.83 + mineral * 0.35;
    color = mix(color, vec3(0.70, 0.57, 0.40), vein * 0.32);
    color *= 0.94 + 0.12 * stoneNoise(v_stone * 3.0);
    float sand = (1.0 - smoothstep(0.0, 0.22, v_color.y)) *
        smoothstep(-0.2, 0.65, normalize(v_normal).y) * 0.5;
    color = mix(color, vec3(0.76, 0.55, 0.33), sand);
    color *= surfaceLighting(v_normal, v_shadow);
    float fog = smoothstep(100.0, 360.0, length(v_position));
    gl_FragColor = vec4(mix(color, vec3(0.91, 0.73, 0.49), fog), 1.0);
}
