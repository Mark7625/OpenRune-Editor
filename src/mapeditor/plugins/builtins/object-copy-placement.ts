import { getMapSquareId } from "../../../rs/map/MapFileIndex";
import { Scene } from "../../../rs/scene/Scene";
import { calculateEntityTag, EntityType } from "../../../rs/scene/entity/EntityTag";
import type { LocType } from "../../../rs/config/loctype/LocType";
import type { IEditorPluginHost } from "../editor-plugin-host";
import type { EditorMapSquare } from "../../webgl/EditorMapSquare";
import { getObjectChunkIdsForTileRect } from "../../webgl/objectChunk";
import {
    applySceneTileLocEntry,
    floorDecorationDataFromSceneTile,
    locPlacementFromLoc,
    moveLocPlacement,
    resolveLocEntityModelParams,
    wallDataFromSceneTile,
    wallDecorationDataFromSceneTile,
    type FloorDecorationData,
    type SceneTileLocData,
    type WallData,
    type WallDecorationData,
} from "../../webgl/sceneLocData";
import { markObjectChunksForHeightEdit } from "../../webgl/scene-loc-height-sync";
import {
    findLocForRef,
    findLocByTagInMap,
    isRotatableObjectKind,
    syncMapObjectPickIndex,
    syncObjectRefFromLoc,
    worldTileToSceneTile,
} from "./object-transform-runtime";
import {
    findObjectAtHover,
    type EditorObjectRef,
} from "../../webgl/sceneLocPicker";
import type { WebGLMapEditorRenderer } from "../../webgl/WebGLMapEditorRenderer";
import {
    recordHistoryObjectMutation,
    snapshotObjectEntriesForBounds,
} from "../../map-editor-object-history";

export function isCopyableObjectKind(kind: EditorObjectRef["kind"]): boolean {
    return isRotatableObjectKind(kind);
}

function locTypeNotInteractive(locType: LocType): boolean {
    return locType.isInteractive === 0;
}

function newTagForTile(
    sceneTileX: number,
    sceneTileY: number,
    locTypeId: number,
    locType: LocType,
): string {
    return calculateEntityTag(
        sceneTileX,
        sceneTileY,
        EntityType.LOC,
        locTypeNotInteractive(locType),
        locTypeId,
    ).toString();
}

function markChunks(
    map: EditorMapSquare,
    mapId: number,
    renderer: WebGLMapEditorRenderer,
    sceneMinX: number,
    sceneMinY: number,
    sceneMaxX: number,
    sceneMaxY: number,
): void {
    const min = map.borderSize;
    const max = map.borderSize + Scene.MAP_SQUARE_SIZE - 1;
    const localMinX = Math.max(0, sceneMinX - min);
    const localMinY = Math.max(0, sceneMinY - min);
    const localMaxX = Math.min(63, sceneMaxX - min);
    const localMaxY = Math.min(63, sceneMaxY - min);
    map.markObjectChunksDirty(localMinX, localMinY, localMaxX, localMaxY);
    markObjectChunksForHeightEdit(map, getObjectChunkIdsForTileRect(localMinX, localMinY, localMaxX, localMaxY));
    renderer.scheduleObjectChunkReload(mapId, map.dirtyObjectChunks);
}

function sourceEntryForTemplate(
    map: EditorMapSquare,
    template: EditorObjectRef,
): SceneTileLocData | undefined {
    const tile = map.scene.tiles[template.level]?.[template.anchorTileX]?.[template.anchorTileY];
    if (!tile) {
        return undefined;
    }

    const base = {
        level: template.level,
        tileX: template.anchorTileX,
        tileY: template.anchorTileY,
    };

    if (template.kind === "loc") {
        const loc = findLocForRef(map, template);
        if (!loc) {
            return undefined;
        }
        const placement = locPlacementFromLoc(loc, template.level, loc.startX, loc.startY);
        if (!placement) {
            return undefined;
        }
        return { ...base, tileX: placement.startX, tileY: placement.startY, loc: placement };
    }
    if (template.kind === "wall") {
        const wall = wallDataFromSceneTile(tile, template.level, template.anchorTileX, template.anchorTileY);
        if (!wall || wall.tag !== template.locTag) {
            return undefined;
        }
        return { ...base, wall };
    }
    if (template.kind === "floorDecoration") {
        const floorDecoration = floorDecorationDataFromSceneTile(
            tile,
            template.level,
            template.anchorTileX,
            template.anchorTileY,
        );
        if (!floorDecoration || floorDecoration.tag !== template.locTag) {
            return undefined;
        }
        return { ...base, floorDecoration };
    }
    if (template.kind === "wallDecoration") {
        const wallDecoration = wallDecorationDataFromSceneTile(
            tile,
            template.level,
            template.anchorTileX,
            template.anchorTileY,
        );
        if (!wallDecoration || wallDecoration.tag !== template.locTag) {
            return undefined;
        }
        return { ...base, wallDecoration };
    }

    return undefined;
}

function cloneEntryAtTile(
    entry: SceneTileLocData,
    map: EditorMapSquare,
    targetSceneX: number,
    targetSceneY: number,
    locType: LocType,
    locTypeId: number,
): SceneTileLocData | undefined {
    const deltaX = targetSceneX - entry.tileX;
    const deltaY = targetSceneY - entry.tileY;
    const min = map.borderSize;
    const max = map.borderSize + Scene.MAP_SQUARE_SIZE - 1;
    const newTileX = entry.tileX + deltaX;
    const newTileY = entry.tileY + deltaY;
    if (newTileX < min || newTileY < min || newTileX > max || newTileY > max) {
        return undefined;
    }

    const centerX = newTileX * 128 + 64;
    const centerY = newTileY * 128 + 64;
    const height = map.scene.tileHeights[entry.level][newTileX][newTileY];
    const tag = newTagForTile(newTileX, newTileY, locTypeId, locType);

    if (entry.loc) {
        const moved = moveLocPlacement(map.scene, entry.loc, deltaX, deltaY);
        if (!moved) {
            return undefined;
        }
        return {
            level: entry.level,
            tileX: moved.startX,
            tileY: moved.startY,
            loc: { ...moved, tag },
        };
    }
    if (entry.wall) {
        return cloneWallEntry(entry.wall, entry.level, newTileX, newTileY, centerX, centerY, height, tag);
    }
    if (entry.floorDecoration) {
        return cloneFloorDecorationEntry(
            entry.floorDecoration,
            entry.level,
            newTileX,
            newTileY,
            centerX,
            centerY,
            height,
            tag,
        );
    }
    if (entry.wallDecoration) {
        return cloneWallDecorationEntry(
            entry.wallDecoration,
            entry.level,
            newTileX,
            newTileY,
            centerX,
            centerY,
            height,
            tag,
        );
    }

    return undefined;
}

function cloneWallEntry(
    wall: WallData,
    level: number,
    tileX: number,
    tileY: number,
    x: number,
    y: number,
    height: number,
    tag: string,
): SceneTileLocData {
    return {
        level,
        tileX,
        tileY,
        wall: {
            ...wall,
            tag,
            x,
            y,
            height,
            entity0: wall.entity0 ? { ...wall.entity0, level, tileX, tileY } : undefined,
            entity1: wall.entity1 ? { ...wall.entity1, level, tileX, tileY } : undefined,
        },
    };
}

function cloneFloorDecorationEntry(
    floorDecoration: FloorDecorationData,
    level: number,
    tileX: number,
    tileY: number,
    x: number,
    y: number,
    height: number,
    tag: string,
): SceneTileLocData {
    return {
        level,
        tileX,
        tileY,
        floorDecoration: {
            ...floorDecoration,
            tag,
            x,
            y,
            height,
            entity: { ...floorDecoration.entity, level, tileX, tileY },
        },
    };
}

function cloneWallDecorationEntry(
    wallDecoration: WallDecorationData,
    level: number,
    tileX: number,
    tileY: number,
    x: number,
    y: number,
    height: number,
    tag: string,
): SceneTileLocData {
    return {
        level,
        tileX,
        tileY,
        wallDecoration: {
            ...wallDecoration,
            tag,
            x,
            y,
            height,
            entity0: { ...wallDecoration.entity0, level, tileX, tileY },
            entity1: wallDecoration.entity1
                ? { ...wallDecoration.entity1, level, tileX, tileY }
                : undefined,
        },
    };
}

export type CopyFootprintSceneBounds = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

export function getSourceMapForTemplate(
    renderer: WebGLMapEditorRenderer,
    template: EditorObjectRef,
): EditorMapSquare | undefined {
    return (
        (renderer.mapManager.getMap(template.mapX, template.mapY) as EditorMapSquare | undefined) ??
        (renderer.mapManager.getMapById(template.mapId) as EditorMapSquare | undefined)
    );
}

export function getCopyPreviewFootprintSceneBounds(
    template: EditorObjectRef,
    sourceMap: EditorMapSquare,
    targetSceneX: number,
    targetSceneY: number,
): CopyFootprintSceneBounds {
    const deltaX = targetSceneX - template.anchorTileX;
    const deltaY = targetSceneY - template.anchorTileY;

    if (template.kind === "loc") {
        const loc = findLocForRef(sourceMap, template);
        if (loc) {
            return {
                minX: loc.startX + deltaX,
                minY: loc.startY + deltaY,
                maxX: loc.endX + deltaX,
                maxY: loc.endY + deltaY,
            };
        }
    }

    return {
        minX: targetSceneX,
        minY: targetSceneY,
        maxX: targetSceneX,
        maxY: targetSceneY,
    };
}

export function placeObjectCopyAtHover(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    template: EditorObjectRef,
    worldX: number,
    worldY: number,
): EditorObjectRef | undefined {
    const mapX = Math.floor(worldX / 64);
    const mapY = Math.floor(worldY / 64);
    const map = renderer.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
    if (!map) {
        return undefined;
    }

    const { sceneX, sceneY } = worldTileToSceneTile(worldX, worldY, map);
    if (!host.isPlaneVisible(template.level)) {
        return undefined;
    }

    const sourceMap =
        (renderer.mapManager.getMap(template.mapX, template.mapY) as EditorMapSquare | undefined) ??
        (renderer.mapManager.getMapById(template.mapId) as EditorMapSquare | undefined);
    if (!sourceMap) {
        return undefined;
    }

    const sourceEntry = sourceEntryForTemplate(sourceMap, template);
    if (!sourceEntry) {
        return undefined;
    }

    const bounds = getCopyPreviewFootprintSceneBounds(template, sourceMap, sceneX, sceneY);
    let placedRef: EditorObjectRef | undefined;

    const ok = recordHistoryObjectMutation(
        host,
        map,
        template.level,
        "Place object copy",
        () => snapshotObjectEntriesForBounds(map, template.level, bounds),
        () => {
            placedRef = placeObjectCopyAtSceneTile(
                host,
                renderer,
                template,
                map,
                sourceEntry,
                sceneX,
                sceneY,
                worldX,
                worldY,
            );
            return placedRef !== undefined;
        },
        () => snapshotObjectEntriesForBounds(map, template.level, bounds),
    );

    return ok ? placedRef : undefined;
}

function placeObjectCopyAtSceneTile(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    template: EditorObjectRef,
    map: EditorMapSquare,
    sourceEntry: SceneTileLocData,
    sceneX: number,
    sceneY: number,
    worldX: number,
    worldY: number,
): EditorObjectRef | undefined {
    const locType = host.locTypeLoader.load(template.locTypeId);
    const nextEntry = cloneEntryAtTile(sourceEntry, map, sceneX, sceneY, locType, template.locTypeId);
    if (!nextEntry) {
        return undefined;
    }

    if (!applySceneTileLocEntry(map.scene, nextEntry)) {
        return undefined;
    }

    const mapId = getMapSquareId(map.mapX, map.mapY);
    const mapX = map.mapX;
    const mapY = map.mapY;
    syncMapObjectPickIndex(map, mapId);

    if (nextEntry.loc) {
        const bounds = nextEntry.loc;
        markChunks(map, mapId, renderer, bounds.startX, bounds.startY, bounds.endX, bounds.endY);
    } else {
        markChunks(map, mapId, renderer, nextEntry.tileX, nextEntry.tileY, nextEntry.tileX, nextEntry.tileY);
    }

    const placed = findObjectAtHover(
        (mx, my) => renderer.mapManager.getMap(mx, my) as EditorMapSquare | undefined,
        mapId,
        mapX,
        mapY,
        [template.level],
        worldX,
        worldY,
        host.viewPlaneMax,
    );
    if (placed && placed.locTypeId === template.locTypeId) {
        return placed;
    }

    if (template.kind === "loc" && nextEntry.loc) {
        const loc =
            findLocByTagInMap(map, template.level, nextEntry.loc.tag) ??
            findLocForRef(map, {
                ...template,
                mapId,
                mapX,
                mapY,
                anchorTileX: nextEntry.tileX,
                anchorTileY: nextEntry.tileY,
            });
        if (loc) {
            return syncObjectRefFromLoc(
                {
                    ...template,
                    mapId,
                    mapX,
                    mapY,
                    anchorTileX: nextEntry.loc.startX,
                    anchorTileY: nextEntry.loc.startY,
                },
                loc,
            );
        }
    }

    return {
        ...template,
        mapId,
        mapX,
        mapY,
        anchorTileX: nextEntry.tileX,
        anchorTileY: nextEntry.tileY,
        locTag: nextEntry.loc?.tag ?? nextEntry.wall?.tag ?? nextEntry.floorDecoration?.tag ?? nextEntry.wallDecoration?.tag ?? "",
    };
}
