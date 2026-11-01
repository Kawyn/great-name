attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec4 a_biome;
uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_world;
uniform mat4 u_textureMatrix;
uniform vec3 u_surfaceOrigin;
varying vec4 v_projectedTexcoord;
varying vec4 v_biome;
varying vec3 v_normal;
varying vec3 v_position;
varying vec3 v_surface;
void main() {
    vec4 worldPosition = u_world * a_position;
    gl_Position = u_projection * u_view * worldPosition;
    v_position = (u_view * worldPosition).xyz;
    v_surface = a_position.xyz + u_surfaceOrigin;
    v_biome = a_biome;
    v_projectedTexcoord = u_textureMatrix * worldPosition;
    v_normal = normalize(mat3(u_world) * a_normal);
}
