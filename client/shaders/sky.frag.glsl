precision mediump float;
uniform mat4 u_viewDirectionProjectionInverse;
uniform vec3 u_sunPosition;
varying vec4 v_position;
void main() {
    vec4 projected = u_viewDirectionProjectionInverse * v_position;
    vec3 direction = normalize(projected.xyz / projected.w);
    vec3 horizon = vec3(0.91, 0.73, 0.49);
    vec3 zenith = vec3(0.36, 0.48, 0.57);
    vec3 color = mix(horizon, zenith, smoothstep(0.0, 0.9, direction.y));
    float sun = max(dot(direction, normalize(u_sunPosition)), 0.0);
    color += vec3(0.20, 0.13, 0.06) * pow(sun, 24.0);
    color = mix(color, vec3(1.0, 0.94, 0.72), smoothstep(0.9990, 0.9995, sun));
    gl_FragColor = vec4(color, 1.0);
}
