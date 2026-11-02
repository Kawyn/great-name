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
    float inscribed = step(1.5, v_color.y);
    float height = v_color.y - inscribed * 2.0;
    float mineral = stoneNoise(v_stone * 0.32 + v_color.x * 17.0);
    vec3 warped = v_stone * 2.7 + vec3(mineral * 2.8, mineral * 1.7, mineral * 2.3);
    float fracture = stoneNoise(warped) * 0.7 + stoneNoise(warped * 2.1 + 11.0) * 0.3;
    float vein = (1.0 - smoothstep(0.004, 0.018, abs(fracture - 0.49))) *
        smoothstep(0.48, 0.67, stoneNoise(v_stone * 0.85 + 31.0));
    vec3 color = mix(vec3(0.30, 0.25, 0.24), vec3(0.55, 0.39, 0.29), v_color.x);
    color *= 0.83 + mineral * 0.35;
    color = mix(color, vec3(0.56, 0.47, 0.36), vein * 0.16);
    color *= 0.94 + 0.12 * stoneNoise(v_stone * 3.0);
    float sand = (1.0 - smoothstep(0.0, 0.22, height)) *
        smoothstep(-0.2, 0.65, normalize(v_normal).y) * 0.5;
    color = mix(color, vec3(0.76, 0.55, 0.33), sand);
    float emerald = inscribed * vein * smoothstep(0.03, 0.18, height);
    color = mix(color, vec3(0.17, 0.28, 0.21), emerald * 0.4);
    color *= surfaceLighting(v_normal, v_shadow);
    color += vec3(0.012, 0.055, 0.03) * emerald;
    float fog = smoothstep(100.0, 360.0, length(v_position));
    gl_FragColor = vec4(mix(color, worldFogColor(), fog), 1.0);
}
