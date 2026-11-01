uniform sampler2D u_texture0;
uniform vec3 u_reverseLightDirection;
uniform vec3 u_shadowParams;

float shadowVisibility(vec4 shadowPosition, float light) {
    vec3 projected = shadowPosition.xyz / shadowPosition.w;
    vec3 dx = dFdx(projected);
    vec3 dy = dFdy(projected);
    float determinant = dx.x * dy.y - dx.y * dy.x;
    vec2 depthGradient = vec2(0.0);
    if (abs(determinant) > 0.000000000001)
        depthGradient = vec2(dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z) / determinant;
    if (projected.z <= 0.0 || projected.z >= 1.0 ||
        projected.x <= 0.0 || projected.x >= 1.0 || projected.y <= 0.0 || projected.y >= 1.0)
        return 1.0;
    float bias = (0.08 + 0.24 * (1.0 - light)) * u_shadowParams.z;
    vec2 pixel = projected.xy / u_shadowParams.xy - 0.5;
    vec2 base = floor(pixel);
    vec2 f = fract(pixel);
    float visibility = 0.0;
    // A texel-aligned tent filter interpolates comparisons, not raw depth values.
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            float wx = x == -1 ? 1.0 - f.x : x == 0 ? 1.0 : f.x;
            float wy = y == -1 ? 1.0 - f.y : y == 0 ? 1.0 : f.y;
            vec2 uv = (base + vec2(float(x), float(y)) + 0.5) * u_shadowParams.xy;
            float depth = texture2D(u_texture0, uv).r;
            // Compare on the receiver plane at the sampled texel, not at the fragment center.
            float receiverDepth = projected.z + dot(depthGradient, uv - projected.xy);
            visibility += wx * wy * step(receiverDepth - bias, depth);
        }
    }
    float edge = min(min(projected.x, 1.0 - projected.x), min(projected.y, 1.0 - projected.y));
    return mix(1.0, visibility * 0.25, smoothstep(0.0, 0.08, edge));
}

vec3 surfaceLighting(vec3 normal, vec4 shadowPosition) {
    normal = normalize(normal);
    float light = max(dot(normal, normalize(u_reverseLightDirection)), 0.0);
    vec3 ambient = mix(vec3(0.24, 0.17, 0.12), vec3(0.42, 0.43, 0.43), normal.y * 0.5 + 0.5);
    vec3 sunlight = vec3(0.68, 0.57, 0.40) * light * shadowVisibility(shadowPosition, light);
    return ambient + sunlight;
}
