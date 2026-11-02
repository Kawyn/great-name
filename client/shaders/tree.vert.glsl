attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec2 a_texcoord;
uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_world;
uniform mat4 u_textureMatrix;
varying vec3 v_normal;
varying vec3 v_position;
varying vec2 v_color;
varying vec4 v_shadow;
varying vec3 v_wood;
void main() {
    vec4 worldPosition = u_world * a_position;
    gl_Position = u_projection * u_view * worldPosition;
    v_position = (u_view * worldPosition).xyz;
    v_normal = normalize(mat3(u_world) * a_normal);
    v_color = a_texcoord;
    v_shadow = u_textureMatrix * worldPosition;
    v_wood = a_position.xyz;
}
