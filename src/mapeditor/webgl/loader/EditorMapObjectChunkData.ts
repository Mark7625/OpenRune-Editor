import { DrawRange } from "../../../mapviewer/webgl/DrawRange";
import { LocAnimatedData } from "../../../mapviewer/webgl/loc/LocAnimatedData";
import type { SceneData } from "./EditorMapData";
import type { SceneLocData } from "../sceneLocData";

export interface EditorMapObjectChunkData {
    chunkId: number;
    objectVertices: Uint8Array;
    objectIndices: Int32Array;
    objectModelTextureData: Uint16Array;
    objectModelTextureDataAlpha: Uint16Array;
    objectDrawRanges: DrawRange[];
    objectDrawRangesAlpha: DrawRange[];
    locsAnimated: LocAnimatedData[];
}

export interface EditorMapObjectRebuildInput {
    mapX: number;
    mapY: number;
    borderSize: number;
    scene: SceneData;
    sceneLocData: SceneLocData;
    chunkIds: number[];
}
