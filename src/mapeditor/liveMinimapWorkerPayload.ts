import { Transfer } from "threads/worker";

import type { SceneData } from "./webgl/loader/EditorMapData";
import { Scene } from "../rs/scene/Scene";

/** Build a scene instance backed by transferred terrain snapshots (minimap-only). */
export function sceneFromTerrainData(data: SceneData): Scene {
    const scene = new Scene(data.levels, data.sizeX, data.sizeY);
    scene.tileHeights = data.tileHeights;
    scene.tileRenderFlags = data.tileRenderFlags;
    scene.tileUnderlays = data.tileUnderlays;
    scene.tileOverlays = data.tileOverlays;
    scene.tileShapes = data.tileShapes;
    scene.tileRotations = data.tileRotations;
    scene.tileLightOcclusions = data.tileLightOcclusions;
    scene.tileLights = data.tileLights;
    scene.tileBlendedColors = data.tileBlendedColors;
    return scene;
}

/** Snapshot of terrain typed arrays only (matches {@link SceneData}). */
export type LiveMinimapWorkerRequest =
    | {
          mode: "full";
          scene: SceneData;
          selectedLevel: number;
          borderSize: number;
      }
    | {
          mode: "patch";
          scene: SceneData;
          selectedLevel: number;
          borderSize: number;
          pixels: Int32Array;
          modelMinX: number;
          modelMaxX: number;
          modelMinY: number;
          modelMaxY: number;
          patchMinX: number;
          patchMaxX: number;
          patchMinY: number;
          patchMaxY: number;
      };

export type LiveMinimapWorkerResult = {
    minimapBlob: Blob;
    pixelCache: Int32Array;
};

export function cloneSceneTerrainData(scene: Scene): SceneData {
    const { levels, sizeX, sizeY } = scene;

    const tileHeights: Int32Array[][] = [];
    for (let l = 0; l < levels; l++) {
        tileHeights[l] = [];
        for (let x = 0; x < sizeX + 1; x++) {
            tileHeights[l][x] = new Int32Array(scene.tileHeights[l][x]);
        }
    }

    const tileRenderFlags: Uint8Array[][] = [];
    const tileUnderlays: Uint16Array[][] = [];
    const tileOverlays: Int16Array[][] = [];
    const tileShapes: Uint8Array[][] = [];
    const tileRotations: Uint8Array[][] = [];
    const tileLights: Int32Array[][] = [];
    const tileBlendedColors: Int32Array[][] = [];

    for (let l = 0; l < levels; l++) {
        tileRenderFlags[l] = [];
        tileUnderlays[l] = [];
        tileOverlays[l] = [];
        tileShapes[l] = [];
        tileRotations[l] = [];
        tileLights[l] = [];
        tileBlendedColors[l] = [];
        for (let x = 0; x < sizeX; x++) {
            tileRenderFlags[l][x] = new Uint8Array(scene.tileRenderFlags[l][x]);
            tileUnderlays[l][x] = new Uint16Array(scene.tileUnderlays[l][x]);
            tileOverlays[l][x] = new Int16Array(scene.tileOverlays[l][x]);
            tileShapes[l][x] = new Uint8Array(scene.tileShapes[l][x]);
            tileRotations[l][x] = new Uint8Array(scene.tileRotations[l][x]);
            tileLights[l][x] = new Int32Array(scene.tileLights[l][x]);
            tileBlendedColors[l][x] = new Int32Array(scene.tileBlendedColors[l][x]);
        }
    }

    const tileLightOcclusions: Uint8Array[][] = [];
    for (let l = 0; l < levels; l++) {
        tileLightOcclusions[l] = [];
        for (let x = 0; x < sizeX + 1; x++) {
            tileLightOcclusions[l][x] = new Uint8Array(scene.tileLightOcclusions[l][x]);
        }
    }

    return {
        levels,
        sizeX,
        sizeY,
        tileHeights,
        tileRenderFlags,
        tileUnderlays,
        tileOverlays,
        tileShapes,
        tileRotations,
        tileLightOcclusions,
        tileLights,
        tileBlendedColors,
    };
}

function collectSceneDataTransferables(data: SceneData): Transferable[] {
    const out: Transferable[] = [];
    const push2 = (grid: ArrayBufferView[][]) => {
        for (const row of grid) {
            for (const cell of row) {
                out.push(cell.buffer);
            }
        }
    };
    push2(data.tileHeights as unknown as ArrayBufferView[][]);
    push2(data.tileRenderFlags as unknown as ArrayBufferView[][]);
    push2(data.tileUnderlays as unknown as ArrayBufferView[][]);
    push2(data.tileOverlays as unknown as ArrayBufferView[][]);
    push2(data.tileShapes as unknown as ArrayBufferView[][]);
    push2(data.tileRotations as unknown as ArrayBufferView[][]);
    push2(data.tileLightOcclusions as unknown as ArrayBufferView[][]);
    push2(data.tileLights as unknown as ArrayBufferView[][]);
    push2(data.tileBlendedColors as unknown as ArrayBufferView[][]);
    return out;
}

/** Build transferable request for {@link RenderDataWorker.renderLiveEditorMinimap}. */
export function transferLiveMinimapWorkerRequest(req: LiveMinimapWorkerRequest) {
    const transferables = collectSceneDataTransferables(req.scene);
    if (req.mode === "patch") {
        transferables.push(req.pixels.buffer);
    }
    return Transfer(req, transferables);
}
