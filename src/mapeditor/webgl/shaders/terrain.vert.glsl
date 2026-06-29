#version 300 es

#include "./includes/multi-draw.glsl";

#define SCENE_BORDER_SIZE 6.0
const int TILE_MAX_FACES = 6;
const int TILE_MAX_VERTICES = 6;

const int TOTAL_TILE_VERTICES = TILE_MAX_FACES * TILE_MAX_VERTICES;

const int LEVEL_TILE_VERTICES =
    64 * 64 * TOTAL_TILE_VERTICES;

// Per frame
uniform SceneUniforms {
    mat4 u_viewProjMatrix;
    mat4 u_viewMatrix;
    mat4 u_projectionMatrix;
};

// Per draw
uniform float u_mapX;
uniform float u_mapY;

uniform highp isampler2D u_materials;
uniform highp sampler2DArray u_heightMap;

uniform float u_viewPlaneMax;
uniform float u_hideBelowViewPlane;
uniform float u_planeClipEnabled;

in uvec4 a_vert;

out vec4 v_color;
out vec2 v_texCoord;
flat out uint v_texId;

#include "./includes/hsl-to-rgb.glsl";
#include "./includes/material.glsl";
#include "../../../mapviewer/webgl/shaders/includes/plane-visibility.glsl";

float getHeightInterp(vec2 pos, uint level) {
    vec2 uv = (pos + vec2(SCENE_BORDER_SIZE + 0.5)) / vec2(64.0 + SCENE_BORDER_SIZE * 2.0);

    return texture(u_heightMap, vec3(uv, level)).r * 8.0;
}

void main() {
    uint level = uint(gl_VertexID / LEVEL_TILE_VERTICES);

    vec2 tilePos = vec2(a_vert.xy);
    vec2 tilePosNorm = tilePos / 128.0;
    float height = -getHeightInterp(tilePosNorm, uint(level)) / 128.0;

    v_color = vec4(hslToRgb(int(a_vert.z), 1.0), 1.0);

    Material material = getMaterial(a_vert.w);
    vec2 textureAnimation = vec2(material.animU, material.animV);

    v_texCoord = tilePosNorm;
    v_texId = a_vert.w;

    vec4 pos = vec4(tilePosNorm.x, height, tilePosNorm.y, 1.0);
    pos += vec4(u_mapX, 0.0, u_mapY, 0.0) * 64.0;

    if (u_planeClipEnabled > 0.5) {
        if (!isScenePlaneVisible(int(level), tilePos, u_viewPlaneMax, u_hideBelowViewPlane)) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
        }
    }

    gl_Position = u_viewProjMatrix * pos;
}
