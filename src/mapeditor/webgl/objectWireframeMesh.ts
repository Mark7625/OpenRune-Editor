import { Model } from "../../rs/model/Model";
import { ModelData } from "../../rs/model/ModelData";

export type WireframeModel = Model | ModelData;

function edgeKey(a: number, b: number): string {
    return a < b ? `${a},${b}` : `${b},${a}`;
}

export function buildModelWireframeLines(model: WireframeModel): Float32Array {
    const facesA = model.indices1;
    const facesB = model.indices2;
    const facesC = model.indices3;
    const vx = model.verticesX;
    const vy = model.verticesY;
    const vz = model.verticesZ;
    const faceColors3 = model instanceof Model ? model.faceColors3 : undefined;

    const edges = new Set<string>();
    const lines: number[] = [];

    const addEdge = (i0: number, i1: number) => {
        const key = edgeKey(i0, i1);
        if (edges.has(key)) {
            return;
        }
        edges.add(key);
        lines.push(vx[i0], -vy[i0], vz[i0], vx[i1], -vy[i1], vz[i1]);
    };

    for (let i = 0; i < model.faceCount; i++) {
        if (faceColors3 && faceColors3[i] === -2) {
            continue;
        }
        const a = facesA[i];
        const b = facesB[i];
        const cIdx = facesC[i];
        addEdge(a, b);
        addEdge(b, cIdx);
        addEdge(cIdx, a);
    }

    return new Float32Array(lines);
}
