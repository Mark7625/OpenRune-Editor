#version 300 es

#define SCENE_BORDER_SIZE 6.0

const float TILE_X[6] = float[](0.0, 1.0, 0.0, 0.0, 1.0, 1.0);
const float TILE_Y[6] = float[](0.0, 1.0, 1.0, 0.0, 0.0, 1.0);

// Per frame
uniform SceneUniforms {
    mat4 u_viewProjMatrix;
    mat4 u_viewMatrix;
    mat4 u_projectionMatrix;
};

// Per draw
uniform float u_mapX;
uniform float u_mapY;
uniform float u_tileX;
uniform float u_tileY;
uniform float u_level;

uniform highp sampler2DArray u_heightMap;

/** 0 = full tile quad (6 verts); 1 = single overlay triangle (3 verts). */
uniform float u_highlightShapeMode;
uniform vec2 u_cornerA;
uniform vec2 u_cornerB;
uniform vec2 u_cornerC;

out vec3 v_bc;
out vec2 v_tileUv;
/** Overlay mesh UV (same space as highlight triangle corners); silhouette outline only. */
out vec2 v_overlayUv;

float getHeightInterp(vec2 pos, uint level) {
    vec2 uv = (pos + vec2(SCENE_BORDER_SIZE + 0.5)) / vec2(64.0 + SCENE_BORDER_SIZE * 2.0);

    return texture(u_heightMap, vec3(uv, level)).r * 8.0;
}

void main() {
    vec2 tilePos;

    if (u_highlightShapeMode < 0.5) {
        int vertexIndex = gl_VertexID % 6;
        tilePos = vec2(TILE_X[vertexIndex] + u_tileX, TILE_Y[vertexIndex] + u_tileY);
        v_tileUv = vec2(TILE_X[vertexIndex], TILE_Y[vertexIndex]);
        v_bc = vec3(0.0);
        v_overlayUv = vec2(0.0);
    } else {
        int vi = gl_VertexID % 3;
        vec2 base = vec2(u_tileX, u_tileY);
        v_tileUv = vec2(0.0);
        if (vi == 0) {
            tilePos = u_cornerA + base;
            v_bc = vec3(1.0, 0.0, 0.0);
            v_overlayUv = u_cornerA;
        } else if (vi == 1) {
            tilePos = u_cornerB + base;
            v_bc = vec3(0.0, 1.0, 0.0);
            v_overlayUv = u_cornerB;
        } else {
            tilePos = u_cornerC + base;
            v_bc = vec3(0.0, 0.0, 1.0);
            v_overlayUv = u_cornerC;
        }
    }

    float height = -getHeightInterp(tilePos, uint(u_level)) / 128.0;

    vec4 pos = vec4(tilePos.x, height - 0.01, tilePos.y, 1.0);

    pos += vec4(u_mapX, 0.0, u_mapY, 0.0) * 64.0;

    gl_Position = u_viewProjMatrix * pos;
}
