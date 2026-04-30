#version 300 es

precision highp float;

uniform vec4 u_fillColor;
uniform vec4 u_outlineColor;
uniform float u_outlineThickness;
/** (left, right, bottom, top) — 1 = draw outline on that side (neighbor not in selection). */
uniform vec4 u_edgeMask;
uniform float u_highlightShapeMode;
/** 0 = mesh fill only; 1 = mesh outer boundary lines (see u_boundarySeg*). */
uniform float u_footprintPass;

const int BOUND_MAX = 48;
uniform int u_boundarySegCount;
uniform vec4 u_boundarySeg[BOUND_MAX];

in vec3 v_bc;
in vec2 v_tileUv;
in vec2 v_overlayUv;

out vec4 fragColor;

float segmentDist(vec2 p, vec4 s) {
    vec2 a = s.xy;
    vec2 b = s.zw;
    vec2 pa = p - a;
    vec2 ba = b - a;
    float den = dot(ba, ba);
    float h = den > 1e-20 ? clamp(dot(pa, ba) / den, 0.0, 1.0) : 0.0;
    return length(pa - ba * h);
}

void main() {
    if (u_highlightShapeMode < 0.5) {
        if (u_edgeMask.x + u_edgeMask.y + u_edgeMask.z + u_edgeMask.w < 0.01) {
            fragColor = u_fillColor;
            return;
        }
        float dLeft = v_tileUv.x;
        float dRight = 1.0 - v_tileUv.x;
        float dBottom = v_tileUv.y;
        float dTop = 1.0 - v_tileUv.y;
        float d = 1e9;
        if (u_edgeMask.x > 0.5) {
            d = min(d, dLeft);
        }
        if (u_edgeMask.y > 0.5) {
            d = min(d, dRight);
        }
        if (u_edgeMask.z > 0.5) {
            d = min(d, dBottom);
        }
        if (u_edgeMask.w > 0.5) {
            d = min(d, dTop);
        }
        float wUv = max(length(fwidth(v_tileUv)), 1e-6);
        float band = max(u_outlineThickness * wUv * 48.0, u_outlineThickness * 0.04 + 1e-4);
        float edge = 1.0 - smoothstep(0.0, band, d);
        fragColor = mix(u_fillColor, u_outlineColor, edge);
        return;
    }

    if (u_footprintPass < 0.5) {
        fragColor = u_fillColor;
        return;
    }

    vec2 p = v_overlayUv;
    float m = 1e9;
    for (int i = 0; i < BOUND_MAX; i++) {
        if (i >= u_boundarySegCount) {
            break;
        }
        m = min(m, segmentDist(p, u_boundarySeg[i]));
    }
    float np = max(length(fwidth(p)), 1e-6);
    float lineW = max(u_outlineThickness * np * 52.0, u_outlineThickness * 0.04 + np * 2.0);
    float edgeO = 1.0 - smoothstep(lineW * 0.2, lineW * 1.1, m);
    fragColor = vec4(u_outlineColor.rgb, u_outlineColor.a * edgeO);
}
