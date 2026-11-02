precision highp float;
varying vec3 v_normal;
varying vec2 v_texcoord;
varying vec4 v_shadow;
varying vec3 v_position;
uniform float u_emeraldStage;
uniform float u_charred;
void main() {
    vec3 color = vec3(0.53, 0.18, 0.12);
    if (v_texcoord.x > 0.25 && v_texcoord.x < 0.75)
        color = vec3(0.008, 0.006, 0.005);
    else if (v_texcoord.x > 1.5 && v_texcoord.x < 3.5)
        color = vec3(0.045, 0.035, 0.03);
    else if (v_texcoord.x > 5.5 && v_texcoord.x < 7.5)
        color = vec3(0.85, 0.36, 0.09);
    else if ((v_texcoord.x > 0.75 && v_texcoord.x < 1.5) ||
        (v_texcoord.x > 4.5 && v_texcoord.x < 5.5) || v_texcoord.x > 7.5)
        color = vec3(0.98, 0.76, 0.36);
    if (v_texcoord.x < 0.25 || (v_texcoord.x > 0.75 && v_texcoord.x < 1.5) || v_texcoord.x > 3.5) {
        float trim = (v_texcoord.x > 0.75 && v_texcoord.x < 1.5) ||
            (v_texcoord.x > 4.5 && v_texcoord.x < 5.5) || v_texcoord.x > 7.5 ? 1.0 : 0.0;
        if (u_charred > 0.5)
            color = mix(color, mix(vec3(0.025, 0.028, 0.03), vec3(0.12, 0.105, 0.08), trim), mix(0.45, 0.30, trim));
        else if (u_emeraldStage > 0.5)
            color = mix(color, vec3(0.10, 0.44, 0.29), mix(0.42, 0.25, trim));
    }
    color *= surfaceLighting(v_normal, v_shadow);
    float fog = smoothstep(100.0, 360.0, length(v_position));
    gl_FragColor = vec4(mix(color, worldFogColor(), fog), 1.0);
}
