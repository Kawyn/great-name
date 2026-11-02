precision highp float;
varying vec3 v_normal;
varying vec3 v_position;
varying vec2 v_color;
varying vec4 v_shadow;
varying vec3 v_wood;
void main() {
    float grain = sin(v_wood.x * 36.0 + sin(v_wood.z * 27.0) + v_wood.y * 1.7);
    vec3 color = mix(vec3(0.20, 0.16, 0.12), vec3(0.42, 0.34, 0.25), v_color.x);
    color *= 0.92 + grain * 0.08;
    color = mix(color, vec3(0.51, 0.39, 0.26), (1.0 - smoothstep(0.0, 0.08, v_color.y)) * 0.4);
    color *= surfaceLighting(v_normal, v_shadow);
    float fog = smoothstep(100.0, 360.0, length(v_position));
    gl_FragColor = vec4(mix(color, worldFogColor(), fog), 1.0);
}
