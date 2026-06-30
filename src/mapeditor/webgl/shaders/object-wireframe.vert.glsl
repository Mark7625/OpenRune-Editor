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
in float a_side;

out vec4 v_color;
out float v_side;

void main() {
    vec3 world;
    world.x = (a_pos.x + u_modelOffset.x) / 128.0 + u_mapPos.x * 64.0;
    world.y = (a_pos.y + u_modelOffset.y) / 128.0;
    world.z = (a_pos.z + u_modelOffset.z) / 128.0 + u_mapPos.y * 64.0;

    v_color = u_color;
    v_side = a_side;
    gl_Position = u_viewProjMatrix * vec4(world, 1.0);
}
