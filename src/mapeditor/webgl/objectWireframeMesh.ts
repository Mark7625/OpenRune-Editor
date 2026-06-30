import { Model } from "../../rs/model/Model";
import { ModelData } from "../../rs/model/ModelData";

export type WireframeModel = Model | ModelData;

/** Half-width of wireframe quads in scene fine units (128 = one tile). */
export const WIREFRAME_LINE_HALF_WIDTH = 2;

/** Max line segments drawn for a single model mesh. */
export const WIREFRAME_MAX_SEGMENTS = 720;

/** Only hide edges shared by faces meeting at less than this angle (degrees). */
const WIREFRAME_CREASE_DEGREES = 32;
const WIREFRAME_CREASE_COS = Math.cos((WIREFRAME_CREASE_DEGREES * Math.PI) / 180);

type EdgeCandidate = {
    i0: number;
    i1: number;
    sharpness: number;
};

function edgeSharpness(normals: number[]): number {
    if (normals.length < 6) {
        return 1;
    }
    let minDot = 1;
    for (let i = 0; i < normals.length - 3; i += 3) {
        for (let j = i + 3; j < normals.length; j += 3) {
            minDot = Math.min(minDot, dot3(normals, normals, j));
        }
    }
    return 1 - minDot;
}

function edgeKey(a: number, b: number): string {
    return a < b ? `${a},${b}` : `${b},${a}`;
}

function parseEdgeKey(key: string): [number, number] {
    const comma = key.indexOf(",");
    return [Number(key.slice(0, comma)), Number(key.slice(comma + 1))];
}

function faceNormal(
    i0: number,
    i1: number,
    i2: number,
    vx: Int32Array,
    vy: Int32Array,
    vz: Int32Array,
): [number, number, number] | undefined {
    const ax = vx[i1] - vx[i0];
    const ay = vy[i1] - vy[i0];
    const az = vz[i1] - vz[i0];
    const bx = vx[i2] - vx[i0];
    const by = vy[i2] - vy[i0];
    const bz = vz[i2] - vz[i0];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-6) {
        return undefined;
    }
    nx /= len;
    ny /= len;
    nz /= len;
    return [nx, ny, nz];
}

function dot3(a: number[], b: number[], offsetB: number): number {
    return a[0] * b[offsetB] + a[1] * b[offsetB + 1] + a[2] * b[offsetB + 2];
}

export function buildModelWireframeLines(model: WireframeModel): Float32Array {
    const facesA = model.indices1;
    const facesB = model.indices2;
    const facesC = model.indices3;
    const vx = model.verticesX;
    const vy = model.verticesY;
    const vz = model.verticesZ;
    const hiddenFaces = "faceColors3" in model ? model.faceColors3 : undefined;

    const edgeNormals = new Map<string, number[]>();

    for (let i = 0; i < model.faceCount; i++) {
        if (hiddenFaces && hiddenFaces[i] === -2) {
            continue;
        }

        const a = facesA[i];
        const b = facesB[i];
        const cIdx = facesC[i];
        const normal = faceNormal(a, b, cIdx, vx, vy, vz);
        if (!normal) {
            continue;
        }

        const edges: [number, number][] = [
            [a, b],
            [b, cIdx],
            [cIdx, a],
        ];
        for (const [i0, i1] of edges) {
            const key = edgeKey(i0, i1);
            let bucket = edgeNormals.get(key);
            if (!bucket) {
                bucket = [];
                edgeNormals.set(key, bucket);
            }
            bucket.push(normal[0], normal[1], normal[2]);
        }
    }

    const candidates: EdgeCandidate[] = [];
    for (const [key, normals] of edgeNormals) {
        let visible = true;
        if (normals.length >= 6) {
            visible = false;
            for (let i = 0; i < normals.length - 3; i += 3) {
                for (let j = i + 3; j < normals.length; j += 3) {
                    if (dot3(normals, normals, j) < WIREFRAME_CREASE_COS) {
                        visible = true;
                        break;
                    }
                }
                if (visible) {
                    break;
                }
            }
        }

        if (!visible) {
            continue;
        }

        const [i0, i1] = parseEdgeKey(key);
        candidates.push({ i0, i1, sharpness: edgeSharpness(normals) });
    }

    if (candidates.length === 0) {
        return new Float32Array(0);
    }

    if (candidates.length > WIREFRAME_MAX_SEGMENTS) {
        candidates.sort((a, b) => b.sharpness - a.sharpness);
        candidates.length = WIREFRAME_MAX_SEGMENTS;
    }

    const lines: number[] = [];
    for (const { i0, i1 } of candidates) {
        lines.push(vx[i0], vy[i0], vz[i0], vx[i1], vy[i1], vz[i1]);
    }

    return new Float32Array(lines);
}

/** Axis-aligned loc footprint box in model-local units (128 = one tile). */
export function buildFootprintWireframeLines(width: number, depth: number, height = 128): Float32Array {
    const w = Math.max(128, width);
    const d = Math.max(128, depth);
    const h = Math.max(64, height);
    return new Float32Array([
        0, 0, 0, w, 0, 0,
        w, 0, 0, w, 0, d,
        w, 0, d, 0, 0, d,
        0, 0, d, 0, 0, 0,
        0, -h, 0, w, -h, 0,
        w, -h, 0, w, -h, d,
        w, -h, d, 0, -h, d,
        0, -h, d, 0, -h, 0,
        0, 0, 0, 0, -h, 0,
        w, 0, 0, w, -h, 0,
        w, 0, d, w, -h, d,
        0, 0, d, 0, -h, d,
    ]);
}

export function offsetWireframeLines(lines: Float32Array, ox: number, oy: number, oz: number): Float32Array {
    const out = new Float32Array(lines.length);
    for (let i = 0; i < lines.length; i += 3) {
        out[i] = lines[i] + ox;
        out[i + 1] = lines[i + 1] + oy;
        out[i + 2] = lines[i + 2] + oz;
    }
    return out;
}

/** Expand line segments into anti-aliased quads: interleaved xyz + side (-1..1). */
export function expandWireframeLinesToTriangleMesh(
    lines: Float32Array,
    halfWidth = WIREFRAME_LINE_HALF_WIDTH,
): Float32Array {
    if (lines.length < 6 || halfWidth <= 0) {
        return new Float32Array(0);
    }

    const segmentCount = lines.length / 6;
    const out = new Float32Array(segmentCount * 48);
    let o = 0;

    const push = (x: number, y: number, z: number, side: number) => {
        out[o++] = x;
        out[o++] = y;
        out[o++] = z;
        out[o++] = side;
    };

    for (let seg = 0; seg < segmentCount; seg++) {
        const i = seg * 6;
        const ax = lines[i];
        const ay = lines[i + 1];
        const az = lines[i + 2];
        const bx = lines[i + 3];
        const by = lines[i + 4];
        const bz = lines[i + 5];

        let dx = bx - ax;
        let dy = by - ay;
        let dz = bz - az;
        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-4) {
            continue;
        }
        dx /= len;
        dy /= len;
        dz /= len;

        let px = -dz;
        let py = 0;
        let pz = dx;
        let plen = Math.hypot(px, py, pz);
        if (plen < 1e-4) {
            px = dy;
            py = -dx;
            pz = 0;
            plen = Math.hypot(px, py, pz);
        }
        if (plen < 1e-4) {
            continue;
        }
        px = (px / plen) * halfWidth;
        py = (py / plen) * halfWidth;
        pz = (pz / plen) * halfWidth;

        push(ax - px, ay - py, az - pz, -1);
        push(ax + px, ay + py, az + pz, 1);
        push(bx + px, by + py, bz + pz, 1);

        push(ax - px, ay - py, az - pz, -1);
        push(bx + px, by + py, bz + pz, 1);
        push(bx - px, by - py, bz - pz, -1);
    }

    return o === out.length ? out : out.subarray(0, o);
}
