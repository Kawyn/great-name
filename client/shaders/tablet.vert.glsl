attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec2 a_texcoord;
uniform mat4 u_worldViewProjection;
uniform mat4 u_worldInverseTranspose;
uniform mat4 u_world;
uniform mat4 u_view;
uniform mat4 u_textureMatrix;
varying vec3 v_normal;
varying vec2 v_texcoord;
varying vec4 v_shadow;
varying vec3 v_position;
void main() {
    gl_Position = u_worldViewProjection * a_position;
    v_position = (u_view * u_world * a_position).xyz;
    v_normal = mat3(u_worldInverseTranspose) * a_normal;
    v_texcoord = a_texcoord;
    v_shadow = u_textureMatrix * u_world * a_position;
}
