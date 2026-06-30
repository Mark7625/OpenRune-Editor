import { readTileFieldSnapshot } from "../../map-editor-history-snapshot";
import type { TileFieldSnapshot } from "../../map-editor-history";
import { cloneSceneTileLocEntry, snapshotObjectEntriesForBounds } from "../../map-editor-object-history";
import type { EditorMapSquare } from "../../webgl/EditorMapSquare";
import type { WebGLMapEditorRenderer } from "../../webgl/WebGLMapEditorRenderer";
import type { CopyFootprintSceneBounds } from "./object-copy-placement";
import { worldTileToSceneTile } from "./object-transform-runtime";
import {
    regionStampObjectEntryMatchesOptions,
    resolveRegionStampCopyOptions,
    type RegionStampCopyOptions,
} from "./region-stamp-copy-options";
import {
    boundsHeight,
    boundsWidth,
    rotatedStampDimensions,
    type RegionStamp,
    type RegionStampObjectEntry,
    type RegionStampTileEntry,
    type WorldTileBounds,
} from "./region-stamp-types";

function worldToSceneBounds(
    map: EditorMapSquare,
    bounds: WorldTileBounds,
): CopyFootprintSceneBounds | null {
    const mapWorldMinX = map.mapX * 64;
    const mapWorldMinY = map.mapY * 64;
    const mapWorldMaxX = mapWorldMinX + 63;
    const mapWorldMaxY = mapWorldMinY + 63;

    const minWorldX = Math.max(bounds.minWorldX, mapWorldMinX);
    const minWorldY = Math.max(bounds.minWorldY, mapWorldMinY);
    const maxWorldX = Math.min(bounds.maxWorldX, mapWorldMaxX);
    const maxWorldY = Math.min(bounds.maxWorldY, mapWorldMaxY);
    if (minWorldX > maxWorldX || minWorldY > maxWorldY) {
        return null;
    }

    const minScene = worldTileToSceneTile(minWorldX, minWorldY, map);
    const maxScene = worldTileToSceneTile(maxWorldX, maxWorldY, map);
    return {
        minX: minScene.sceneX,
        minY: minScene.sceneY,
        maxX: maxScene.sceneX,
        maxY: maxScene.sceneY,
    };
}

export function captureRegionStamp(
    renderer: WebGLMapEditorRenderer,
    bounds: WorldTileBounds,
    copyOptions: RegionStampCopyOptions = resolveRegionStampCopyOptions(),
): RegionStamp {
    const tiles: RegionStampTileEntry[] = [];
    const objects: RegionStampObjectEntry[] = [];
    const seenObjectKeys = new Set<string>();

    for (let worldX = bounds.minWorldX; worldX <= bounds.maxWorldX; worldX++) {
        for (let worldY = bounds.minWorldY; worldY <= bounds.maxWorldY; worldY++) {
            const relX = worldX - bounds.minWorldX;
            const relY = worldY - bounds.minWorldY;
            const mapX = Math.floor(worldX / 64);
            const mapY = Math.floor(worldY / 64);
            const map = renderer.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
            if (!map) {
                continue;
            }
            const { sceneX, sceneY } = worldTileToSceneTile(worldX, worldY, map);
            for (let level = 0; level < map.scene.levels; level++) {
                tiles.push({
                    relX,
                    relY,
                    level,
                    fields: readTileFieldSnapshot(map.scene, level, sceneX, sceneY),
                });
            }
        }
    }

    const mapsSeen = new Set<string>();
    for (let worldX = bounds.minWorldX; worldX <= bounds.maxWorldX; worldX++) {
        for (let worldY = bounds.minWorldY; worldY <= bounds.maxWorldY; worldY++) {
            const mapX = Math.floor(worldX / 64);
            const mapY = Math.floor(worldY / 64);
            const key = `${mapX},${mapY}`;
            if (mapsSeen.has(key)) {
                continue;
            }
            mapsSeen.add(key);
            const map = renderer.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
            if (!map) {
                continue;
            }
            const sceneBounds = worldToSceneBounds(map, bounds);
            if (!sceneBounds) {
                continue;
            }
            for (let level = 0; level < map.scene.levels; level++) {
                const entries = snapshotObjectEntriesForBounds(map, level, sceneBounds);
                for (const entry of entries) {
                    const anchorWorldX =
                        map.mapX * 64 + (entry.loc ? entry.loc.startX - map.borderSize : entry.tileX - map.borderSize);
                    const anchorWorldY =
                        map.mapY * 64 + (entry.loc ? entry.loc.startY - map.borderSize : entry.tileY - map.borderSize);
                    const objectKey = `${level}:${entry.loc?.tag ?? entry.wall?.tag ?? entry.floorDecoration?.tag ?? entry.wallDecoration?.tag}:${anchorWorldX}:${anchorWorldY}`;
                    if (seenObjectKeys.has(objectKey)) {
                        continue;
                    }
                    if (!regionStampObjectEntryMatchesOptions(entry, copyOptions)) {
                        continue;
                    }
                    seenObjectKeys.add(objectKey);
                    const captureSceneX = entry.loc?.startX ?? entry.tileX;
                    const captureSceneY = entry.loc?.startY ?? entry.tileY;
                    objects.push({
                        relX: anchorWorldX - bounds.minWorldX,
                        relY: anchorWorldY - bounds.minWorldY,
                        level,
                        captureMapX: map.mapX,
                        captureMapY: map.mapY,
                        captureSceneX,
                        captureSceneY,
                        entry: cloneSceneTileLocEntry(entry),
                    });
                }
            }
        }
    }

    return {
        width: boundsWidth(bounds),
        height: boundsHeight(bounds),
        copyOptions: resolveRegionStampCopyOptions(copyOptions),
        tiles,
        objects,
    };
}

export function emptyTileFields(): TileFieldSnapshot {
    return {
        h: 0,
        hl: [0, 0, 0, 0],
        u: 0,
        o: 0,
        s: 0,
        r: 0,
        f: 0,
    };
}

export function boundsForStampAtOrigin(
    originWorldX: number,
    originWorldY: number,
    stamp: RegionStamp,
    rotation: number,
): WorldTileBounds {
    const { width, height } = rotatedStampDimensions(stamp.width, stamp.height, rotation);
    return {
        minWorldX: originWorldX,
        minWorldY: originWorldY,
        maxWorldX: originWorldX + width - 1,
        maxWorldY: originWorldY + height - 1,
    };
}
