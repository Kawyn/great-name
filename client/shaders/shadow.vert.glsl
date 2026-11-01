attribute vec4 a_position;
uniform mat4 u_worldViewProjection;
void main() {
    gl_Position = u_worldViewProjection * a_position;
}
