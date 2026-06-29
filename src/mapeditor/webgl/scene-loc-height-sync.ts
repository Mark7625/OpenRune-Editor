import { Scene } from "../../rs/scene/Scene";
import { getObjectChunkId, getObjectChunkIdsForTileRect } from "./objectChunk";
import type { EditorMapSquare } from "./EditorMapSquare";

function footprintHeight(
    scene: Scene,
    level: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
): number {
    const heightMap = scene.tileHeights[level];
    return (
        heightMap[endX][endY] +
        heightMap[startX][endY] +
        heightMap[startX][startY] +
        heightMap[endX][startY]
    ) >> 2;
}

function updateTileLocHeights(scene: Scene, level: number, sceneX: number, sceneY: number): void {
    const tile = scene.tiles[level][sceneX][sceneY];
    if (!tile) {
        return;
    }
    const height = scene.getCenterHeight(level, sceneX, sceneY);
    if (tile.floorDecoration) {
        tile.floorDecoration.height = height;
    }
    if (tile.wall) {
        tile.wall.height = height;
    }
    if (tile.wallDecoration) {
        tile.wallDecoration.height = height;
    }
}

/** Sync stored loc heights and return object chunk ids that need a mesh rebuild. */
export function syncSceneLocHeightsForHeightEdit(
    map: EditorMapSquare,
    level: number,
    changedLocalTiles: Set<number>,
): Set<number> {
    const chunks = new Set<number>();
    if (changedLocalTiles.size === 0) {
        return chunks;
    }

    const scene = map.scene;
    const borderSize = map.borderSize;
    const changedSceneTiles = new Set<number>();

    for (const tileId of changedLocalTiles) {
        const localX = tileId >> 8;
        const localY = tileId & 0xff;
        const sceneX = borderSize + localX;
        const sceneY = borderSize + localY;
        changedSceneTiles.add((sceneX << 8) | sceneY);
        chunks.add(getObjectChunkId(localX, localY));
        updateTileLocHeights(scene, level, sceneX, sceneY);
    }

    const startX = borderSize;
    const startY = borderSize;
    const endX = borderSize + Scene.MAP_SQUARE_SIZE;
    const endY = borderSize + Scene.MAP_SQUARE_SIZE;
    const updatedLocStarts = new Set<number>();

    for (let sceneX = startX; sceneX < endX; sceneX++) {
        for (let sceneY = startY; sceneY < endY; sceneY++) {
            const tile = scene.tiles[level][sceneX][sceneY];
            if (!tile) {
                continue;
            }
            for (const loc of tile.locs) {
                if (loc.startX !== sceneX || loc.startY !== sceneY) {
                    continue;
                }
                const locKey = (loc.startX << 16) | loc.startY;
                if (updatedLocStarts.has(locKey)) {
                    continue;
                }

                let intersects = false;
                for (const changedId of changedSceneTiles) {
                    const cx = changedId >> 8;
                    const cy = changedId & 0xff;
                    if (
                        cx >= loc.startX &&
                        cx <= loc.endX &&
                        cy >= loc.startY &&
                        cy <= loc.endY
                    ) {
                        intersects = true;
                        break;
                    }
                }
                if (!intersects) {
                    continue;
                }

                updatedLocStarts.add(locKey);
                loc.height = footprintHeight(
                    scene,
                    level,
                    loc.startX,
                    loc.startY,
                    loc.endX,
                    loc.endY,
                );
                for (const chunkId of getObjectChunkIdsForTileRect(
                    loc.startX - borderSize,
                    loc.startY - borderSize,
                    loc.endX - borderSize,
                    loc.endY - borderSize,
                )) {
                    chunks.add(chunkId);
                }
            }
        }
    }

    return chunks;
}

export function markObjectChunksForHeightEdit(
    map: EditorMapSquare,
    chunkIds: Iterable<number>,
): void {
    let marked = false;
    for (const chunkId of chunkIds) {
        map.dirtyObjectChunks.add(chunkId);
        marked = true;
    }
    if (marked) {
        map.objectUpdated = true;
    }
}
