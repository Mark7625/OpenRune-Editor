import { getMapSquareId } from "../rs/map/MapFileIndex";
import { Loc } from "../rs/scene/Loc";
import type { MapEditorHistoryTool } from "./map-editor-history";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import type { EditorMapSquare } from "./webgl/EditorMapSquare";
import { getObjectChunkIdsForTileRect } from "./webgl/objectChunk";
import { ObjectPickIndex } from "./webgl/sceneLocPicker";
import {
    applySceneTileLocEntry,
    cloneSceneLocData,
    floorDecorationDataFromSceneTile,
    locPlacementFromLoc,
    removeLocFromScene,
    serializeSceneLocData,
    wallDataFromSceneTile,
    wallDecorationDataFromSceneTile,
    type SceneTileLocData,
} from "./webgl/sceneLocData";
import { markObjectChunksForHeightEdit } from "./webgl/scene-loc-height-sync";
import type { EditorObjectRef } from "./webgl/sceneLocPicker";
import type { WebGLMapEditorRenderer } from "./webgl/WebGLMapEditorRenderer";
import type { CopyFootprintSceneBounds } from "./plugins/builtins/object-copy-placement";

export function cloneSceneTileLocEntry(entry: SceneTileLocData): SceneTileLocData {
    return cloneSceneLocData({ tiles: [entry] }).tiles[0]!;
}

function cloneSceneTileLocEntries(entries: SceneTileLocData[]): SceneTileLocData[] {
    return entries.map(cloneSceneTileLocEntry);
}

function entriesEqual(a: SceneTileLocData[], b: SceneTileLocData[]): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function syncMapObjectPickIndex(map: EditorMapSquare, mapId: number): void {
    map.sceneLocData = serializeSceneLocData(map.scene, map.borderSize);
    map.objectPickIndex = ObjectPickIndex.fromSceneLocData(map.mapX, map.mapY, mapId, map.sceneLocData);
}

function findLocByTagInMap(map: EditorMapSquare, level: number, locTag: string): Loc | undefined {
    if (!locTag) {
        return undefined;
    }
    const start = map.borderSize;
    const end = start + 64;
    for (let x = start; x < end; x++) {
        for (let y = start; y < end; y++) {
            const tile = map.scene.tiles[level]?.[x]?.[y];
            if (!tile) {
                continue;
            }
            for (const loc of tile.locs) {
                if (loc.startX === x && loc.startY === y && loc.tag.toString() === locTag) {
                    return loc;
                }
            }
        }
    }
    return undefined;
}

function findLocByTagInFootprint(
    map: EditorMapSquare,
    level: number,
    tag: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
): Loc | undefined {
    const byTag = findLocByTagInMap(map, level, tag);
    if (byTag && byTag.startX === startX && byTag.startY === startY) {
        return byTag;
    }
    for (let sx = startX; sx <= endX; sx++) {
        for (let sy = startY; sy <= endY; sy++) {
            const tile = map.scene.tiles[level]?.[sx]?.[sy];
            if (!tile) {
                continue;
            }
            for (const loc of tile.locs) {
                if (loc.tag.toString() === tag) {
                    return loc;
                }
            }
        }
    }
    return undefined;
}

function clearObjectEntry(map: EditorMapSquare, entry: SceneTileLocData): void {
    if (entry.loc) {
        const loc = entry.loc;
        const live = findLocByTagInFootprint(
            map,
            entry.level,
            loc.tag,
            loc.startX,
            loc.startY,
            loc.endX,
            loc.endY,
        );
        if (live) {
            removeLocFromScene(map.scene, live);
        }
        return;
    }

    const tile = map.scene.tiles[entry.level]?.[entry.tileX]?.[entry.tileY];
    if (!tile) {
        return;
    }
    if (entry.wall) {
        tile.wall = undefined;
    } else if (entry.floorDecoration) {
        tile.floorDecoration = undefined;
    } else if (entry.wallDecoration) {
        tile.wallDecoration = undefined;
    }
}

function markChunksForEntries(
    map: EditorMapSquare,
    mapId: number,
    renderer: WebGLMapEditorRenderer,
    entries: SceneTileLocData[],
): void {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const entry of entries) {
        if (entry.loc) {
            minX = Math.min(minX, entry.loc.startX);
            minY = Math.min(minY, entry.loc.startY);
            maxX = Math.max(maxX, entry.loc.endX);
            maxY = Math.max(maxY, entry.loc.endY);
        } else {
            minX = Math.min(minX, entry.tileX);
            minY = Math.min(minY, entry.tileY);
            maxX = Math.max(maxX, entry.tileX);
            maxY = Math.max(maxY, entry.tileY);
        }
    }

    if (!Number.isFinite(minX)) {
        return;
    }

    const localMinX = Math.max(0, minX - map.borderSize);
    const localMinY = Math.max(0, minY - map.borderSize);
    const localMaxX = Math.min(63, maxX - map.borderSize);
    const localMaxY = Math.min(63, maxY - map.borderSize);
    map.markObjectChunksDirty(localMinX, localMinY, localMaxX, localMaxY);
    markObjectChunksForHeightEdit(map, getObjectChunkIdsForTileRect(localMinX, localMinY, localMaxX, localMaxY));
    renderer.scheduleObjectChunkReload(mapId, map.dirtyObjectChunks);
}

export function snapshotObjectEntriesForRef(
    map: EditorMapSquare,
    ref: EditorObjectRef,
): SceneTileLocData[] {
    if (ref.kind === "loc") {
        const loc = findLocByTagInMap(map, ref.level, ref.locTag);
        if (!loc) {
            return [];
        }
        const placement = locPlacementFromLoc(loc, ref.level, loc.startX, loc.startY);
        if (!placement) {
            return [];
        }
        return [
            cloneSceneTileLocEntry({
                level: ref.level,
                tileX: placement.startX,
                tileY: placement.startY,
                loc: placement,
            }),
        ];
    }

    const tile = map.scene.tiles[ref.level]?.[ref.anchorTileX]?.[ref.anchorTileY];
    if (!tile) {
        return [];
    }

    if (ref.kind === "wall") {
        const wall = wallDataFromSceneTile(tile, ref.level, ref.anchorTileX, ref.anchorTileY);
        if (!wall || wall.tag !== ref.locTag) {
            return [];
        }
        return [
            cloneSceneTileLocEntry({
                level: ref.level,
                tileX: ref.anchorTileX,
                tileY: ref.anchorTileY,
                wall,
            }),
        ];
    }
    if (ref.kind === "floorDecoration") {
        const floorDecoration = floorDecorationDataFromSceneTile(
            tile,
            ref.level,
            ref.anchorTileX,
            ref.anchorTileY,
        );
        if (!floorDecoration || floorDecoration.tag !== ref.locTag) {
            return [];
        }
        return [
            cloneSceneTileLocEntry({
                level: ref.level,
                tileX: ref.anchorTileX,
                tileY: ref.anchorTileY,
                floorDecoration,
            }),
        ];
    }
    if (ref.kind === "wallDecoration") {
        const wallDecoration = wallDecorationDataFromSceneTile(
            tile,
            ref.level,
            ref.anchorTileX,
            ref.anchorTileY,
        );
        if (!wallDecoration || wallDecoration.tag !== ref.locTag) {
            return [];
        }
        return [
            cloneSceneTileLocEntry({
                level: ref.level,
                tileX: ref.anchorTileX,
                tileY: ref.anchorTileY,
                wallDecoration,
            }),
        ];
    }

    return [];
}

export function snapshotObjectEntriesForBounds(
    map: EditorMapSquare,
    level: number,
    bounds: CopyFootprintSceneBounds,
): SceneTileLocData[] {
    const entries: SceneTileLocData[] = [];
    const seenLocTags = new Set<string>();

    for (let sx = bounds.minX; sx <= bounds.maxX; sx++) {
        for (let sy = bounds.minY; sy <= bounds.maxY; sy++) {
            const tile = map.scene.tiles[level]?.[sx]?.[sy];
            if (!tile) {
                continue;
            }

            for (const loc of tile.locs) {
                const tag = loc.tag.toString();
                if (seenLocTags.has(tag)) {
                    continue;
                }
                seenLocTags.add(tag);
                const placement = locPlacementFromLoc(loc, level, loc.startX, loc.startY);
                if (placement) {
                    entries.push(
                        cloneSceneTileLocEntry({
                            level,
                            tileX: placement.startX,
                            tileY: placement.startY,
                            loc: placement,
                        }),
                    );
                }
            }

            const wall = wallDataFromSceneTile(tile, level, sx, sy);
            if (wall) {
                entries.push(cloneSceneTileLocEntry({ level, tileX: sx, tileY: sy, wall }));
            }
            const floorDecoration = floorDecorationDataFromSceneTile(tile, level, sx, sy);
            if (floorDecoration) {
                entries.push(cloneSceneTileLocEntry({ level, tileX: sx, tileY: sy, floorDecoration }));
            }
            const wallDecoration = wallDecorationDataFromSceneTile(tile, level, sx, sy);
            if (wallDecoration) {
                entries.push(cloneSceneTileLocEntry({ level, tileX: sx, tileY: sy, wallDecoration }));
            }
        }
    }

    return entries;
}

export function applyObjectSnapshotEntries(
    map: EditorMapSquare,
    mapId: number,
    renderer: WebGLMapEditorRenderer,
    clearEntries: SceneTileLocData[],
    applyEntries: SceneTileLocData[],
): void {
    for (const entry of clearEntries) {
        clearObjectEntry(map, entry);
    }
    for (const entry of applyEntries) {
        applySceneTileLocEntry(map.scene, entry);
    }
    syncMapObjectPickIndex(map, mapId);
    markChunksForEntries(map, mapId, renderer, [...clearEntries, ...applyEntries]);
}

export function recordHistoryObjectMutation(
    host: IEditorPluginHost,
    map: EditorMapSquare,
    level: number,
    label: string,
    readBefore: () => SceneTileLocData[],
    mutate: () => boolean,
    readAfter: () => SceneTileLocData[],
    tool: MapEditorHistoryTool = "object-selector",
): boolean {
    if (host.isHistoryApplying()) {
        return mutate();
    }

    const before = readBefore();
    host.beginHistoryStroke(tool, label);
    const ok = mutate();
    if (!ok) {
        host.cancelHistoryStroke();
        return false;
    }
    const after = readAfter();
    if (!entriesEqual(before, after)) {
        host.recordHistoryObjectChange(
            getMapSquareId(map.mapX, map.mapY),
            level,
            cloneSceneTileLocEntries(before),
            cloneSceneTileLocEntries(after),
        );
    }
    host.commitHistoryStroke();
    return true;
}
