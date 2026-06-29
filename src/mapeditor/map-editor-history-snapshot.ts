import type { Scene } from "../rs/scene/Scene";

import type { TileFieldSnapshot } from "./map-editor-history";

function readTileHeightStack(scene: Scene, level: number, sceneX: number, sceneY: number): number[] {
    const heights: number[] = [];
    for (let l = level; l < scene.levels; l++) {
        heights.push(scene.tileHeights[l][sceneX][sceneY]);
    }
    return heights;
}

export function readTileFieldSnapshot(scene: Scene, level: number, sceneX: number, sceneY: number): TileFieldSnapshot {
    return {
        h: scene.tileHeights[level][sceneX][sceneY],
        hl: readTileHeightStack(scene, level, sceneX, sceneY),
        u: scene.tileUnderlays[level][sceneX][sceneY],
        o: scene.tileOverlays[level][sceneX][sceneY],
        s: scene.tileShapes[level][sceneX][sceneY],
        r: scene.tileRotations[level][sceneX][sceneY],
        f: scene.tileRenderFlags[level][sceneX][sceneY] ?? 0,
    };
}
