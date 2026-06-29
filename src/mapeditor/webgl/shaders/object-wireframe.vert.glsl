#version 300 es

uniform SceneUniforms {
    mat4 u_viewProjMatrix;
    mat4 u_viewMatrix;
    mat4 u_projectionMatrix;
};

uniform vec3 u_modelOffset;
uniform vec2 u_mapPos;
uniform vec4 u_color;

in vec3 a_pos;

out vec4 v_color;

void main() {
    vec3 local = a_pos + u_modelOffset;
    local /= 128.0;
    local += vec3(u_mapPos.x, 0.0, u_mapPos.y) * 64.0;

    v_color = u_color;
    gl_Position = u_viewProjMatrix * vec4(local, 1.0);
}
