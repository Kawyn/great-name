attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec2 a_texcoord;
uniform mat4 u_worldViewProjection;
uniform mat4 u_worldInverseTranspose;
uniform mat4 u_world;
uniform mat4 u_view;
uniform mat4 u_textureMatrix;
uniform vec3 u_movementDirection;
uniform vec3 u_windDirection;
uniform float u_time;
uniform float u_airborne;
uniform float u_scarfVerticalMotion;
uniform float u_landingCrouch;
varying vec3 v_normal;
varying vec2 v_texcoord;
varying vec4 v_shadow;
varying vec3 v_position;
vec3 localDirection(vec3 direction) {
    return vec3(dot(direction, normalize(u_world[0].xyz)),
        dot(direction, normalize(u_world[1].xyz)), dot(direction, normalize(u_world[2].xyz)));
}
vec2 bend(vec2 point, float angle) {
    return vec2(cos(angle) * point.x - sin(angle) * point.y,
        sin(angle) * point.x + cos(angle) * point.y);
}
vec3 deform(vec3 point) {
    vec3 movement = localDirection(u_movementDirection);
    vec3 wind = localDirection(u_windDirection);
    float speed = length(movement.xz);
    float air = u_airborne * (0.65 + 0.35 * abs(movement.y));
    float part = a_texcoord.x;
    float leanWeight = smoothstep(0.0, 0.8, point.y);
    if (part < 0.25 || (part > 0.75 && part < 1.5)) {
        float weight = clamp((2.67 - point.y) / 2.58, 0.0, 1.0);
        float flutter = sin(u_time * 1.7 + point.y * 3.3 + point.x * 3.0 + point.z * 2.0);
        float ripple = sin(u_time * 2.3 - point.y * 4.0 + point.x * 5.0);
        vec2 force = wind.xz * (0.42 + flutter * 0.16) - movement.xz * (1.15 + air * 0.65);
        point.xz *= 1.0 + weight * (air * 0.2 + ripple * 0.045);
        point.xz += force * weight * weight;
        point.y += weight * weight * (air * 1.05 +
            (0.12 + 0.10 * flutter) * min(length(wind) + speed, 1.0));
    } else if (part > 1.5 && part < 3.5) {
        float crouch = u_airborne * (0.7 + 0.3 * abs(movement.y));
        float weight = clamp((1.65 - point.y) / 1.65, 0.0, 1.0);
        vec2 hip = vec2(1.65, 0.0), knee = vec2(0.83, 0.18);
        if (point.y >= knee.x)
            point.yz = hip + bend(point.yz - hip, -0.85 * crouch);
        else
            point.yz = hip + bend(knee - hip, -0.85 * crouch) +
                bend(point.yz - knee, 1.1 * crouch);
        float stride = sin(u_time + (part > 2.5 ? 3.14159265 : 0.0));
        point.xz += movement.xz * stride * weight * 0.38 * (1.0 - u_airborne);
        point.y += max(stride, 0.0) * speed * weight * 0.22 * (1.0 - u_airborne);
        float hipHeight = 1.65 - u_landingCrouch * 0.45;
        vec2 landingKnee = vec2(0.83 - u_landingCrouch * 0.225,
            0.18 + sqrt(max(0.0, 0.83 * 0.83 - hipHeight * hipHeight * 0.25)) -
            sqrt(0.83 * 0.83 - 1.65 * 1.65 * 0.25));
        float upper = clamp((a_position.y - 0.83) / 0.82, 0.0, 1.0);
        vec2 originalCenter = a_position.y >= 0.83 ? mix(knee, hip, upper) :
            mix(vec2(0.0, 0.04), knee, clamp(a_position.y / 0.83, 0.0, 1.0));
        vec2 landingCenter = a_position.y >= 0.83 ? mix(landingKnee, vec2(hipHeight, 0.0), upper) :
            mix(vec2(0.0, 0.04), landingKnee, clamp(a_position.y / 0.83, 0.0, 1.0));
        point.yz += landingCenter - originalCenter;
    } else if (part > 3.5 && part < 5.5) {
        float weight = clamp((0.252 - point.z) / 1.692, 0.0, 1.0);
        point.xz += (wind.xz * 0.2 - movement.xz * 0.25) * weight * weight;
        point.y += sin(u_time * 1.5 - weight * 3.0) * 0.12 * weight * weight + air * weight * 0.15;
    } else if (part > 6.5 && part < 8.5) {
        float tail = clamp((-point.z - 0.08) / 3.5, 0.0, 1.0);
        float freeTail = smoothstep(0.12, 0.45, tail);
        float width = point.y - 2.56;
        float flutterStrength = mix(1.0, 0.35, clamp(speed, 0.0, 1.0));
        vec2 flow = vec2(0.0, -0.65) - movement.xz * 1.8 + wind.xz * 0.85;
        vec2 direction = normalize(vec2(flow.x, min(flow.y, -0.35)));
        vec2 across = vec2(-direction.y, direction.x);
        float curve = smoothstep(0.12, 0.55, tail);
        vec2 trail = mix(vec2(0.0, -1.0), direction, curve);
        float wave = sin(u_time * 2.2 - tail * 10.0);
        float smallWave = sin(u_time * 3.1 - tail * 19.0);
        point.xz = vec2(0.36, -0.08) + trail * tail * 3.5 +
            across * (wave * 0.16 + smallWave * 0.04) * flutterStrength * tail * freeTail;
        point.y = 2.56 + width + freeTail * (-tail * 0.32 +
            (wave * 0.24 + smallWave * 0.06) * flutterStrength * tail +
            air * tail * 0.35 + wind.y * tail * 0.2 - u_scarfVerticalMotion * tail * 0.65);
    }
    if (part < 1.5 || part > 3.5)
        point.y -= u_landingCrouch * 0.45 * smoothstep(0.1, 1.65, a_position.y);
    vec3 leanAxis = vec3(movement.z, 0.0, -movement.x) / max(speed, 0.0001);
    float leanAngle = speed * 0.16 * leanWeight;
    point = point * cos(leanAngle) + cross(leanAxis, point) * sin(leanAngle) +
        leanAxis * dot(leanAxis, point) * (1.0 - cos(leanAngle));
    return point;
}
void main() {
    vec3 point = deform(a_position.xyz);
    vec3 tangent = normalize(cross(a_normal, abs(a_normal.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 bitangent = cross(a_normal, tangent);
    // Central differences keep normals defined at the clamped scarf endpoints.
    vec3 normal = normalize(cross(
        deform(a_position.xyz + tangent * 0.001) - deform(a_position.xyz - tangent * 0.001),
        deform(a_position.xyz + bitangent * 0.001) - deform(a_position.xyz - bitangent * 0.001)));
    gl_Position = u_worldViewProjection * vec4(point, 1.0);
    v_normal = mat3(u_worldInverseTranspose) * normal;
    v_texcoord = a_texcoord;
    vec4 worldPosition = u_world * vec4(point, 1.0);
    v_shadow = u_textureMatrix * worldPosition;
    v_position = (u_view * worldPosition).xyz;
}
