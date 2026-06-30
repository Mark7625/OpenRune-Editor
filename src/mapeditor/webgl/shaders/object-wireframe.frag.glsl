#version 300 es

precision highp float;

in vec4 v_color;
in float v_side;

out vec4 fragColor;

void main() {
    float dist = abs(v_side);
    float aa = max(fwidth(dist), 0.002);
    float alpha = v_color.a * (1.0 - smoothstep(0.82 - aa, 1.0 + aa, dist));
    if (alpha < 0.01) {
        discard;
    }
    fragColor = vec4(v_color.rgb, alpha);
}
