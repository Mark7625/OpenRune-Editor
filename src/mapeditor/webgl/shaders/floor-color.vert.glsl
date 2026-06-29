#version 300 es

#define SCENE_BORDER_SIZE 6.0

uniform SceneUniforms {
    mat4 u_viewProjMatrix;
    mat4 u_viewMatrix;
    mat4 u_projectionMatrix;
};

uniform float u_mapX;
uniform float u_mapY;

in vec2 a_corner;
out vec2 v_uv;

void main() {
    vec2 local = a_corner * 64.0;
    v_uv = vec2(a_corner.x, 1.0 - a_corner.y);
    vec4 pos = vec4(local.x, 0.0, local.y, 1.0);
    pos += vec4(u_mapX, 0.0, u_mapY, 0.0) * 64.0;
    gl_Position = u_viewProjMatrix * pos;
}
