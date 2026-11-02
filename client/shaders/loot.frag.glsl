precision highp float;
varying vec3 v_normal;
varying vec2 v_texcoord;
varying vec4 v_shadow;
varying vec3 v_position;
void main() {
    vec3 color = vec3(0.53, 0.18, 0.12);
    if (v_texcoord.x > 0.25 && v_texcoord.x < 0.75)
        color = vec3(0.10, 0.08, 0.07);
    else if (v_texcoord.x >= 1.5)
        color = vec3(0.85, 0.36, 0.09);
    else if (v_texcoord.x >= 0.75)
        color = vec3(0.98, 0.76, 0.36);
    color *= surfaceLighting(v_normal, v_shadow);
    float fog = smoothstep(100.0, 360.0, length(v_position));
    gl_FragColor = vec4(mix(color, worldFogColor(), fog), 1.0);
}
