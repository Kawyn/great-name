precision highp float;
uniform sampler2D u_scene;
uniform vec2 u_resolution;
varying vec2 v_uv;
float bayer2(vec2 p) {
    p = mod(floor(p), 2.0);
    return p.y < 1.0 ? (p.x < 1.0 ? 0.0 : 2.0) : (p.x < 1.0 ? 3.0 : 1.0);
}
void main() {
    vec2 pixel = floor(v_uv * u_resolution);
    vec3 color = texture2D(u_scene, (pixel + 0.5) / u_resolution).rgb;
    float threshold = (4.0 * bayer2(pixel) + bayer2(floor(pixel / 2.0)) + 0.5) / 16.0 - 0.5;
    color = clamp(color + threshold * 0.65 / 31.0, 0.0, 1.0);
    color = floor(color * 31.0 + 0.5) / 31.0;
    gl_FragColor = vec4(color, 1.0);
}
