import { getMapSquareId } from "../../../rs/map/MapFileIndex";
import { Loc } from "../../../rs/scene/Loc";
import { Scene } from "../../../rs/scene/Scene";
import { getIdFromTag } from "../../../rs/scene/entity/EntityTag";
import type { IEditorPluginHost } from "../editor-plugin-host";
import type { EditorMapSquare } from "../../webgl/EditorMapSquare";
import { getObjectChunkIdsForTileRect } from "../../webgl/objectChunk";
import {
    applySceneTileLocEntry,
    floorDecorationDataFromSceneTile,
    locPlacementFromLoc,
    moveLocPlacement,
    removeLocFromScene,
    resolveLocEntityModelParams,
    rotateFloorDecorationData,
    rotateLocPlacement,
    rotateWallData,
    rotateWallDecorationData,
    serializeSceneLocData,
    wallDataFromSceneTile,
    wallDecorationDataFromSceneTile,
    type FloorDecorationData,
    type LocPlacementData,
    type SceneTileLocData,
    type WallData,
    type WallDecorationData,
} from "../../webgl/sceneLocData";
import { markObjectChunksForHeightEdit } from "../../webgl/scene-loc-height-sync";
import { ObjectPickIndex, type EditorObjectKind, type EditorObjectRef } from "../../webgl/sceneLocPicker";
import type { WebGLMapEditorRenderer } from "../../webgl/WebGLMapEditorRenderer";
import {
    recordHistoryObjectMutation,
    snapshotObjectEntriesForRef,
} from "../../map-editor-object-history";

export type ObjectTransformPivot = {
    modelOffset: [number, number, number];
    mapX: number;
    mapY: number;
    level: number;
};

const ROTATABLE_OBJECT_KINDS: ReadonlySet<EditorObjectKind> = new Set([
    "loc",
    "wall",
    "floorDecoration",
    "wallDecoration",
]);

export function isRotatableObjectKind(kind: EditorObjectKind): boolean {
    return ROTATABLE_OBJECT_KINDS.has(kind);
}

export function isMovableObjectKind(kind: EditorObjectKind): boolean {
    return isRotatableObjectKind(kind);
}

function sceneLocMatchesRef(x: number, height: number, y: number, ref: EditorObjectRef): boolean {
    return x === ref.sceneX && height === ref.sceneY && y === ref.sceneZ;
}

export function syncMapObjectPickIndex(map: EditorMapSquare, mapId: number): void {
    map.sceneLocData = serializeSceneLocData(map.scene, map.borderSize);
    map.objectPickIndex = ObjectPickIndex.fromSceneLocData(map.mapX, map.mapY, mapId, map.sceneLocData);
}

export function syncObjectRefFromLoc(ref: EditorObjectRef, loc: Loc): EditorObjectRef {
    const modelParams = resolveLocEntityModelParams(loc.flags, loc.entity);
    return {
        ...ref,
        locTag: loc.tag.toString(),
        anchorTileX: loc.startX,
        anchorTileY: loc.startY,
        locTypeId: getIdFromTag(loc.tag),
        locModelType: modelParams.type,
        rotation: modelParams.rotation,
        sceneX: loc.x,
        sceneY: loc.height,
        sceneZ: loc.y,
    };
}

export function findLocByTagInMap(map: EditorMapSquare, level: number, locTag: string): Loc | undefined {
    if (!locTag) {
        return undefined;
    }
    const start = map.borderSize;
    const end = start + Scene.MAP_SQUARE_SIZE;
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

export function findLocForRef(map: EditorMapSquare, ref: EditorObjectRef): Loc | undefined {
    if (ref.kind !== "loc") {
        return undefined;
    }

    if (ref.locTag) {
        const byTag = findLocByTagInMap(map, ref.level, ref.locTag);
        if (byTag) {
            return byTag;
        }
    }

    const tile = map.scene.tiles[ref.level]?.[ref.anchorTileX]?.[ref.anchorTileY];
    if (!tile) {
        return undefined;
    }

    let fallback: Loc | undefined;
    for (const loc of tile.locs) {
        if (loc.startX !== ref.anchorTileX || loc.startY !== ref.anchorTileY) {
            continue;
        }
        if (getIdFromTag(loc.tag) !== ref.locTypeId) {
            continue;
        }
        const modelParams = resolveLocEntityModelParams(loc.flags, loc.entity);
        if (modelParams.type !== ref.locModelType || modelParams.rotation !== ref.rotation) {
            continue;
        }
        if (sceneLocMatchesRef(loc.x, loc.height, loc.y, ref)) {
            return loc;
        }
        fallback = loc;
    }
    return fallback;
}

function syncObjectRefFromWall(ref: EditorObjectRef, wall: WallData): EditorObjectRef {
    const entity = wall.entity0 ?? wall.entity1;
    if (!entity) {
        return ref;
    }
    return {
        ...ref,
        locTag: wall.tag,
        rotation: entity.rotation,
        locModelType: entity.type,
        sceneX: wall.x,
        sceneY: wall.height,
        sceneZ: wall.y,
    };
}

function syncObjectRefFromFloorDecoration(
    ref: EditorObjectRef,
    floorDecoration: FloorDecorationData,
): EditorObjectRef {
    return {
        ...ref,
        locTag: floorDecoration.tag,
        rotation: floorDecoration.entity.rotation,
        locModelType: floorDecoration.entity.type,
        sceneX: floorDecoration.x,
        sceneY: floorDecoration.height,
        sceneZ: floorDecoration.y,
    };
}

function syncObjectRefFromWallDecoration(
    ref: EditorObjectRef,
    wallDecoration: WallDecorationData,
): EditorObjectRef {
    return {
        ...ref,
        locTag: wallDecoration.tag,
        rotation: wallDecoration.entity0.rotation,
        locModelType: wallDecoration.entity0.type,
        sceneX: wallDecoration.x,
        sceneY: wallDecoration.height,
        sceneZ: wallDecoration.y,
    };
}

function refsEquivalent(a: EditorObjectRef, b: EditorObjectRef): boolean {
    return (
        a.anchorTileX === b.anchorTileX &&
        a.anchorTileY === b.anchorTileY &&
        a.rotation === b.rotation &&
        a.sceneX === b.sceneX &&
        a.sceneY === b.sceneY &&
        a.sceneZ === b.sceneZ &&
        a.locModelType === b.locModelType
    );
}

export function refreshSelectedObjectRef(
    host: IEditorPluginHost,
    map: EditorMapSquare,
    ref: EditorObjectRef,
): void {
    if (ref.kind === "loc") {
        const loc = findLocByTagInMap(map, ref.level, ref.locTag) ?? findLocForRef(map, ref);
        if (!loc) {
            return;
        }
        const synced = syncObjectRefFromLoc(ref, loc);
        if (refsEquivalent(synced, ref)) {
            return;
        }
        host.setSelectedObject(synced);
        return;
    }

    const tile = map.scene.tiles[ref.level]?.[ref.anchorTileX]?.[ref.anchorTileY];
    if (!tile) {
        return;
    }

    let synced: EditorObjectRef | undefined;
    if (ref.kind === "wall") {
        const wall = wallDataFromSceneTile(tile, ref.level, ref.anchorTileX, ref.anchorTileY);
        if (wall && wall.tag === ref.locTag) {
            synced = syncObjectRefFromWall(ref, wall);
        }
    } else if (ref.kind === "floorDecoration") {
        const floorDecoration = floorDecorationDataFromSceneTile(
            tile,
            ref.level,
            ref.anchorTileX,
            ref.anchorTileY,
        );
        if (floorDecoration && floorDecoration.tag === ref.locTag) {
            synced = syncObjectRefFromFloorDecoration(ref, floorDecoration);
        }
    } else if (ref.kind === "wallDecoration") {
        const wallDecoration = wallDecorationDataFromSceneTile(
            tile,
            ref.level,
            ref.anchorTileX,
            ref.anchorTileY,
        );
        if (wallDecoration && wallDecoration.tag === ref.locTag) {
            synced = syncObjectRefFromWallDecoration(ref, wallDecoration);
        }
    }

    if (!synced || refsEquivalent(synced, ref)) {
        return;
    }
    host.setSelectedObject(synced);
}

export function getObjectSceneModelOffset(
    ref: EditorObjectRef,
    map: EditorMapSquare,
): [number, number, number] {
    const borderOffset = map.borderSize * -128;
    return [ref.sceneX + borderOffset, ref.sceneY, ref.sceneZ + borderOffset];
}

export function getObjectTransformPivot(ref: EditorObjectRef, map: EditorMapSquare): ObjectTransformPivot {
    return {
        modelOffset: getObjectSceneModelOffset(ref, map),
        mapX: map.mapX,
        mapY: map.mapY,
        level: ref.level,
    };
}

function localTileBounds(
    map: EditorMapSquare,
    sceneMinX: number,
    sceneMinY: number,
    sceneMaxX: number,
    sceneMaxY: number,
): { localMinX: number; localMinY: number; localMaxX: number; localMaxY: number } {
    return {
        localMinX: Math.max(0, sceneMinX - map.borderSize),
        localMinY: Math.max(0, sceneMinY - map.borderSize),
        localMaxX: Math.min(63, sceneMaxX - map.borderSize),
        localMaxY: Math.min(63, sceneMaxY - map.borderSize),
    };
}

function markAffectedObjectChunks(
    map: EditorMapSquare,
    mapId: number,
    renderer: WebGLMapEditorRenderer,
    sceneMinX: number,
    sceneMinY: number,
    sceneMaxX: number,
    sceneMaxY: number,
): void {
    const { localMinX, localMinY, localMaxX, localMaxY } = localTileBounds(
        map,
        sceneMinX,
        sceneMinY,
        sceneMaxX,
        sceneMaxY,
    );
    map.markObjectChunksDirty(localMinX, localMinY, localMaxX, localMaxY);
    markObjectChunksForHeightEdit(map, getObjectChunkIdsForTileRect(localMinX, localMinY, localMaxX, localMaxY));
    renderer.scheduleObjectChunkReload(mapId, map.dirtyObjectChunks);
}

function refreshSceneLocIndex(map: EditorMapSquare, mapId: number): void {
    syncMapObjectPickIndex(map, mapId);
}

function updatedRefFromPlacement(ref: EditorObjectRef, placement: LocPlacementData): EditorObjectRef {
    return {
        ...ref,
        locTag: placement.tag,
        anchorTileX: placement.startX,
        anchorTileY: placement.startY,
        sceneX: placement.x,
        sceneY: placement.height,
        sceneZ: placement.y,
        locModelType: placement.entity.type,
        rotation: placement.entity.rotation,
    };
}

function footprintBounds(placement: LocPlacementData): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
} {
    return {
        minX: placement.startX,
        minY: placement.startY,
        maxX: placement.endX,
        maxY: placement.endY,
    };
}

function locPlacementEquivalent(a: LocPlacementData, b: LocPlacementData): boolean {
    return (
        a.startX === b.startX &&
        a.startY === b.startY &&
        a.endX === b.endX &&
        a.endY === b.endY &&
        a.flags === b.flags &&
        a.tag === b.tag &&
        a.entity.rotation === b.entity.rotation &&
        a.entity.type === b.entity.type
    );
}

function sceneTileLocEntryEquivalent(a: SceneTileLocData, b: SceneTileLocData): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function applyLocPlacement(
    map: EditorMapSquare,
    mapId: number,
    ref: EditorObjectRef,
    renderer: WebGLMapEditorRenderer,
    host: IEditorPluginHost,
    mutate: (placement: LocPlacementData, scene: Scene) => LocPlacementData | undefined,
): boolean {
    const loc = findLocForRef(map, ref);
    if (!loc) {
        return false;
    }

    const originalPlacement = locPlacementFromLoc(loc, ref.level, loc.startX, loc.startY);
    if (!originalPlacement) {
        return false;
    }

    const nextPlacement = mutate(originalPlacement, map.scene);
    if (!nextPlacement) {
        return false;
    }

    if (locPlacementEquivalent(nextPlacement, originalPlacement)) {
        return false;
    }

    const oldBounds = footprintBounds(originalPlacement);
    removeLocFromScene(map.scene, loc);

    const entry: SceneTileLocData = {
        level: ref.level,
        tileX: nextPlacement.startX,
        tileY: nextPlacement.startY,
        loc: nextPlacement,
    };
    if (!applySceneTileLocEntry(map.scene, entry)) {
        applySceneTileLocEntry(map.scene, {
            level: ref.level,
            tileX: originalPlacement.startX,
            tileY: originalPlacement.startY,
            loc: originalPlacement,
        });
        return false;
    }

    const newBounds = footprintBounds(nextPlacement);
    refreshSceneLocIndex(map, mapId);
    markAffectedObjectChunks(
        map,
        mapId,
        renderer,
        Math.min(oldBounds.minX, newBounds.minX),
        Math.min(oldBounds.minY, newBounds.minY),
        Math.max(oldBounds.maxX, newBounds.maxX),
        Math.max(oldBounds.maxY, newBounds.maxY),
    );

    const updatedRef = updatedRefFromPlacement(ref, nextPlacement);
    const liveLoc = findLocByTagInMap(map, ref.level, nextPlacement.tag) ?? findLocForRef(map, updatedRef);
    if (liveLoc) {
        host.setSelectedObject(syncObjectRefFromLoc(ref, liveLoc));
    } else {
        host.setSelectedObject(updatedRef);
    }
    return true;
}

function clearTileSceneObject(
    tile: NonNullable<EditorMapSquare["scene"]["tiles"][number][number][number]>,
    kind: EditorObjectKind,
): void {
    if (kind === "wall") {
        tile.wall = undefined;
    } else if (kind === "floorDecoration") {
        tile.floorDecoration = undefined;
    } else if (kind === "wallDecoration") {
        tile.wallDecoration = undefined;
    }
}

function tileEntryForRef(map: EditorMapSquare, ref: EditorObjectRef): SceneTileLocData | undefined {
    const tile = map.scene.tiles[ref.level]?.[ref.anchorTileX]?.[ref.anchorTileY];
    if (!tile) {
        return undefined;
    }

    const base = {
        level: ref.level,
        tileX: ref.anchorTileX,
        tileY: ref.anchorTileY,
    };

    if (ref.kind === "wall") {
        const wall = wallDataFromSceneTile(tile, ref.level, ref.anchorTileX, ref.anchorTileY);
        if (!wall || wall.tag !== ref.locTag) {
            return undefined;
        }
        return { ...base, wall };
    }
    if (ref.kind === "floorDecoration") {
        const floorDecoration = floorDecorationDataFromSceneTile(
            tile,
            ref.level,
            ref.anchorTileX,
            ref.anchorTileY,
        );
        if (!floorDecoration || floorDecoration.tag !== ref.locTag) {
            return undefined;
        }
        return { ...base, floorDecoration };
    }
    if (ref.kind === "wallDecoration") {
        const wallDecoration = wallDecorationDataFromSceneTile(
            tile,
            ref.level,
            ref.anchorTileX,
            ref.anchorTileY,
        );
        if (!wallDecoration || wallDecoration.tag !== ref.locTag) {
            return undefined;
        }
        return { ...base, wallDecoration };
    }

    return undefined;
}

function updatedRefFromTileEntry(ref: EditorObjectRef, entry: SceneTileLocData): EditorObjectRef {
    let synced: EditorObjectRef;
    if (entry.wall) {
        synced = syncObjectRefFromWall(ref, entry.wall);
    } else if (entry.floorDecoration) {
        synced = syncObjectRefFromFloorDecoration(ref, entry.floorDecoration);
    } else if (entry.wallDecoration) {
        synced = syncObjectRefFromWallDecoration(ref, entry.wallDecoration);
    } else {
        return ref;
    }
    return {
        ...synced,
        anchorTileX: entry.tileX,
        anchorTileY: entry.tileY,
    };
}

function applyTileObjectMutation(
    map: EditorMapSquare,
    mapId: number,
    ref: EditorObjectRef,
    renderer: WebGLMapEditorRenderer,
    host: IEditorPluginHost,
    mutate: (entry: SceneTileLocData) => SceneTileLocData | undefined,
): boolean {
    const originalEntry = tileEntryForRef(map, ref);
    if (!originalEntry) {
        return false;
    }

    const nextEntry = mutate(originalEntry);
    if (!nextEntry) {
        return false;
    }

    if (sceneTileLocEntryEquivalent(nextEntry, originalEntry)) {
        return false;
    }

    const sourceTile = map.scene.tiles[ref.level]?.[originalEntry.tileX]?.[originalEntry.tileY];
    if (!sourceTile) {
        return false;
    }

    clearTileSceneObject(sourceTile, ref.kind);
    if (!applySceneTileLocEntry(map.scene, nextEntry)) {
        clearTileSceneObject(sourceTile, ref.kind);
        applySceneTileLocEntry(map.scene, originalEntry);
        return false;
    }

    refreshSceneLocIndex(map, mapId);
    markAffectedObjectChunks(
        map,
        mapId,
        renderer,
        Math.min(originalEntry.tileX, nextEntry.tileX),
        Math.min(originalEntry.tileY, nextEntry.tileY),
        Math.max(originalEntry.tileX, nextEntry.tileX),
        Math.max(originalEntry.tileY, nextEntry.tileY),
    );
    host.setSelectedObject(updatedRefFromTileEntry(ref, nextEntry));
    return true;
}

export function rotateSelectedObject(host: IEditorPluginHost, renderer: WebGLMapEditorRenderer): boolean {
    const ref = host.selectedObject;
    if (!ref || !host.isObjectSelectorToolActive() || !isRotatableObjectKind(ref.kind)) {
        return false;
    }

    const map = renderer.mapManager.getMapById(ref.mapId) as EditorMapSquare | undefined;
    if (!map) {
        return false;
    }

    return recordHistoryObjectMutation(
        host,
        map,
        ref.level,
        "Rotate object",
        () => snapshotObjectEntriesForRef(map, ref),
        () => rotateSelectedObjectCore(host, renderer),
        () => {
            const current = host.selectedObject;
            if (!current) {
                return [];
            }
            const currentMap = renderer.mapManager.getMapById(current.mapId) as EditorMapSquare | undefined;
            if (!currentMap) {
                return [];
            }
            return snapshotObjectEntriesForRef(currentMap, current);
        },
    );
}

function rotateSelectedObjectCore(host: IEditorPluginHost, renderer: WebGLMapEditorRenderer): boolean {
    const ref = host.selectedObject;
    if (!ref || !host.isObjectSelectorToolActive() || !isRotatableObjectKind(ref.kind)) {
        return false;
    }

    const map = renderer.mapManager.getMapById(ref.mapId) as EditorMapSquare | undefined;
    if (!map) {
        return false;
    }

    const mapId = getMapSquareId(map.mapX, map.mapY);
    if (ref.kind === "loc") {
        return applyLocPlacement(map, mapId, ref, renderer, host, (placement, scene) =>
            rotateLocPlacement(placement, scene),
        );
    }

    return applyTileObjectMutation(map, mapId, ref, renderer, host, (entry) => {
        if (entry.wall) {
            return { ...entry, wall: rotateWallData(entry.wall) };
        }
        if (entry.floorDecoration) {
            return { ...entry, floorDecoration: rotateFloorDecorationData(entry.floorDecoration) };
        }
        if (entry.wallDecoration) {
            return { ...entry, wallDecoration: rotateWallDecorationData(entry.wallDecoration) };
        }
        return undefined;
    });
}

function moveTileEntry(
    entry: SceneTileLocData,
    map: EditorMapSquare,
    deltaTileX: number,
    deltaTileY: number,
): SceneTileLocData | undefined {
    const newTileX = entry.tileX + deltaTileX;
    const newTileY = entry.tileY + deltaTileY;
    const min = map.borderSize;
    const max = map.borderSize + Scene.MAP_SQUARE_SIZE - 1;
    if (newTileX < min || newTileY < min || newTileX > max || newTileY > max) {
        return undefined;
    }

    const centerX = newTileX * 128 + 64;
    const centerY = newTileY * 128 + 64;
    const height = map.scene.tileHeights[entry.level][newTileX][newTileY];

    if (entry.wall) {
        return {
            ...entry,
            tileX: newTileX,
            tileY: newTileY,
            wall: { ...entry.wall, x: centerX, y: centerY, height },
        };
    }
    if (entry.floorDecoration) {
        return {
            ...entry,
            tileX: newTileX,
            tileY: newTileY,
            floorDecoration: { ...entry.floorDecoration, x: centerX, y: centerY, height },
        };
    }
    if (entry.wallDecoration) {
        return {
            ...entry,
            tileX: newTileX,
            tileY: newTileY,
            wallDecoration: { ...entry.wallDecoration, x: centerX, y: centerY, height },
        };
    }

    return undefined;
}

export function moveSelectedObjectToAnchor(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    targetAnchorTileX: number,
    targetAnchorTileY: number,
): boolean {
    const ref = host.selectedObject;
    if (!ref) {
        return false;
    }
    return moveSelectedObjectByTiles(
        host,
        renderer,
        targetAnchorTileX - ref.anchorTileX,
        targetAnchorTileY - ref.anchorTileY,
    );
}

export function moveSelectedObjectByTiles(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    deltaStartX: number,
    deltaStartY: number,
): boolean {
    if (deltaStartX === 0 && deltaStartY === 0) {
        return false;
    }

    const ref = host.selectedObject;
    if (!ref || !host.isObjectSelectorToolActive() || !isMovableObjectKind(ref.kind)) {
        return false;
    }

    const map = renderer.mapManager.getMapById(ref.mapId) as EditorMapSquare | undefined;
    if (!map) {
        return false;
    }

    const mapId = getMapSquareId(map.mapX, map.mapY);
    if (ref.kind === "loc") {
        return applyLocPlacement(map, mapId, ref, renderer, host, (placement, scene) =>
            moveLocPlacement(scene, placement, deltaStartX, deltaStartY),
        );
    }

    return applyTileObjectMutation(map, mapId, ref, renderer, host, (entry) =>
        moveTileEntry(entry, map, deltaStartX, deltaStartY),
    );
}

export function worldTileToSceneTile(
    worldX: number,
    worldY: number,
    map: EditorMapSquare,
): { sceneX: number; sceneY: number } {
    const localX = ((worldX % 64) + 64) % 64;
    const localY = ((worldY % 64) + 64) % 64;
    return {
        sceneX: localX + map.borderSize,
        sceneY: localY + map.borderSize,
    };
}
