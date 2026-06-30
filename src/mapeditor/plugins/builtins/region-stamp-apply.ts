import { getMapSquareId } from "../../../rs/map/MapFileIndex";
import { Scene } from "../../../rs/scene/Scene";
import { calculateEntityTag, EntityType, getIdFromTag } from "../../../rs/scene/entity/EntityTag";
import type { LocType } from "../../../rs/config/loctype/LocType";
import type { IEditorPluginHost } from "../editor-plugin-host";
import { recordHistoryTileMutation } from "../../map-editor-history-record";
import {
    cloneSceneTileLocEntry,
    snapshotObjectEntriesForBounds,
} from "../../map-editor-object-history";
import type { EditorMapSquare } from "../../webgl/EditorMapSquare";
import { getObjectChunkIdsForTileRect } from "../../webgl/objectChunk";
import {
    applySceneTileLocEntry,
    moveLocPlacement,
    removeLocFromScene,
    rotateFloorDecorationData,
    rotateLocPlacement,
    rotateWallData,
    rotateWallDecorationData,
    type SceneTileLocData,
} from "../../webgl/sceneLocData";
import { markObjectChunksForHeightEdit } from "../../webgl/scene-loc-height-sync";
import { syncMapObjectPickIndex, worldTileToSceneTile } from "./object-transform-runtime";
import type { WebGLMapEditorRenderer } from "../../webgl/WebGLMapEditorRenderer";
import { readTileFieldSnapshot } from "../../map-editor-history-snapshot";
import { boundsForStampAtOrigin, captureRegionStamp, emptyTileFields } from "./region-stamp-capture";
import { mergeTileFieldsForStampApply, resolveRegionStampCopyOptions, stampHasObjectCategories, stampHasTileCategories } from "./region-stamp-copy-options";
import type { CopyFootprintSceneBounds } from "./object-copy-placement";
import {
    rotateStampLocalCoord,
    rotateTileFields,
    type RegionStamp,
    type RegionStampObjectEntry,
    type WorldTileBounds,
} from "./region-stamp-types";

function locTypeNotInteractive(locType: LocType): boolean {
    return locType.isInteractive === 0;
}

function newTagForTile(sceneTileX: number, sceneTileY: number, locTypeId: number, locType: LocType): string {
    return calculateEntityTag(
        sceneTileX,
        sceneTileY,
        EntityType.LOC,
        locTypeNotInteractive(locType),
        locTypeId,
    ).toString();
}

export function sceneBoundsForWorldRect(
    map: EditorMapSquare,
    bounds: WorldTileBounds,
): CopyFootprintSceneBounds | null {
    const mapWorldMinX = map.mapX * 64;
    const mapWorldMinY = map.mapY * 64;
    const minWorldX = Math.max(bounds.minWorldX, mapWorldMinX);
    const minWorldY = Math.max(bounds.minWorldY, mapWorldMinY);
    const maxWorldX = Math.min(bounds.maxWorldX, mapWorldMinX + 63);
    const maxWorldY = Math.min(bounds.maxWorldY, mapWorldMinY + 63);
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

export function applyTileFields(
    scene: Scene,
    level: number,
    sceneX: number,
    sceneY: number,
    fields: ReturnType<typeof emptyTileFields>,
): void {
    if (fields.hl !== undefined && fields.hl.length > 0) {
        for (let i = 0; i < fields.hl.length; i++) {
            scene.tileHeights[level + i][sceneX][sceneY] = fields.hl[i]!;
        }
    } else if (fields.h !== undefined) {
        scene.setHeight(level, sceneX, sceneY, fields.h);
    }
    if (fields.u !== undefined) {
        scene.tileUnderlays[level][sceneX][sceneY] = fields.u;
    }
    if (fields.o !== undefined) {
        scene.tileOverlays[level][sceneX][sceneY] = fields.o;
    }
    if (fields.s !== undefined) {
        scene.tileShapes[level][sceneX][sceneY] = fields.s;
    }
    if (fields.r !== undefined) {
        scene.tileRotations[level][sceneX][sceneY] = fields.r;
    }
    if (fields.f !== undefined) {
        scene.tileRenderFlags[level][sceneX][sceneY] = fields.f;
    }
}

export function clearObjectEntry(map: EditorMapSquare, entry: SceneTileLocData): void {
    if (entry.loc) {
        const loc = entry.loc;
        for (let sx = loc.startX; sx <= loc.endX; sx++) {
            for (let sy = loc.startY; sy <= loc.endY; sy++) {
                const tile = map.scene.tiles[entry.level]?.[sx]?.[sy];
                if (!tile) {
                    continue;
                }
                for (const live of [...tile.locs]) {
                    if (live.tag.toString() === loc.tag) {
                        removeLocFromScene(map.scene, live);
                        break;
                    }
                }
            }
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

function markMapTerrainDirty(map: EditorMapSquare): void {
    map.heightUpdated = true;
    map.underlayUpdated = true;
    map.overlayUpdated = true;
    map.tileRenderFlagsUpdated = true;
}

export function markMapObjectChunks(
    map: EditorMapSquare,
    mapId: number,
    renderer: WebGLMapEditorRenderer,
    bounds: CopyFootprintSceneBounds,
): void {
    const localMinX = Math.max(0, bounds.minX - map.borderSize);
    const localMinY = Math.max(0, bounds.minY - map.borderSize);
    const localMaxX = Math.min(63, bounds.maxX - map.borderSize);
    const localMaxY = Math.min(63, bounds.maxY - map.borderSize);
    map.markObjectChunksDirty(localMinX, localMinY, localMaxX, localMaxY);
    markObjectChunksForHeightEdit(map, getObjectChunkIdsForTileRect(localMinX, localMinY, localMaxX, localMaxY));
    renderer.scheduleObjectChunkReload(mapId, map.dirtyObjectChunks);
}

function buildPastedObjectEntry(
    host: IEditorPluginHost,
    map: EditorMapSquare,
    stamp: RegionStamp,
    object: RegionStampObjectEntry,
    originWorldX: number,
    originWorldY: number,
    rotation: number,
): SceneTileLocData | undefined {
    const rotated = rotateStampLocalCoord(object.relX, object.relY, stamp.width, stamp.height, rotation);
    const targetWorldX = originWorldX + rotated.relX;
    const targetWorldY = originWorldY + rotated.relY;
    const { sceneX, sceneY } = worldTileToSceneTile(targetWorldX, targetWorldY, map);
    const deltaX = sceneX - object.captureSceneX;
    const deltaY = sceneY - object.captureSceneY;
    const min = map.borderSize;
    const max = map.borderSize + Scene.MAP_SQUARE_SIZE - 1;
    const turns = ((rotation % 4) + 4) % 4;

    if (object.entry.loc) {
        let placement = moveLocPlacement(map.scene, object.entry.loc, deltaX, deltaY);
        if (!placement) {
            return undefined;
        }
        for (let i = 0; i < turns; i++) {
            placement = rotateLocPlacement(placement, map.scene);
            if (!placement) {
                return undefined;
            }
        }
        const locTypeId = getIdFromTag(BigInt(placement.tag));
        const locType = host.locTypeLoader.load(locTypeId);
        return {
            level: object.level,
            tileX: placement.startX,
            tileY: placement.startY,
            loc: { ...placement, tag: newTagForTile(placement.startX, placement.startY, locTypeId, locType) },
        };
    }

    const newTileX = object.entry.tileX + deltaX;
    const newTileY = object.entry.tileY + deltaY;
    if (newTileX < min || newTileY < min || newTileX > max || newTileY > max) {
        return undefined;
    }
    const centerX = newTileX * 128 + 64;
    const centerY = newTileY * 128 + 64;
    const height = map.scene.tileHeights[object.level][newTileX][newTileY];
    const locTypeId = getIdFromTag(
        BigInt(object.entry.wall?.tag ?? object.entry.floorDecoration?.tag ?? object.entry.wallDecoration?.tag ?? "0"),
    );
    const locType = host.locTypeLoader.load(locTypeId);
    const tag = newTagForTile(newTileX, newTileY, locTypeId, locType);

    if (object.entry.wall) {
        let wall = {
            ...object.entry.wall,
            tag,
            x: centerX,
            y: centerY,
            height,
            entity0: object.entry.wall.entity0
                ? { ...object.entry.wall.entity0, level: object.level, tileX: newTileX, tileY: newTileY }
                : undefined,
            entity1: object.entry.wall.entity1
                ? { ...object.entry.wall.entity1, level: object.level, tileX: newTileX, tileY: newTileY }
                : undefined,
        };
        for (let i = 0; i < turns; i++) {
            wall = rotateWallData(wall);
        }
        return { level: object.level, tileX: newTileX, tileY: newTileY, wall };
    }
    if (object.entry.floorDecoration) {
        let floorDecoration = {
            ...object.entry.floorDecoration,
            tag,
            x: centerX,
            y: centerY,
            height,
            entity: { ...object.entry.floorDecoration.entity, level: object.level, tileX: newTileX, tileY: newTileY },
        };
        for (let i = 0; i < turns; i++) {
            floorDecoration = rotateFloorDecorationData(floorDecoration);
        }
        return { level: object.level, tileX: newTileX, tileY: newTileY, floorDecoration };
    }
    if (object.entry.wallDecoration) {
        let wallDecoration = {
            ...object.entry.wallDecoration,
            tag,
            x: centerX,
            y: centerY,
            height,
            entity0: {
                ...object.entry.wallDecoration.entity0,
                level: object.level,
                tileX: newTileX,
                tileY: newTileY,
            },
            entity1: object.entry.wallDecoration.entity1
                ? {
                      ...object.entry.wallDecoration.entity1,
                      level: object.level,
                      tileX: newTileX,
                      tileY: newTileY,
                  }
                : undefined,
        };
        for (let i = 0; i < turns; i++) {
            wallDecoration = rotateWallDecorationData(wallDecoration);
        }
        return { level: object.level, tileX: newTileX, tileY: newTileY, wallDecoration };
    }

    return undefined;
}

function applyRegionTiles(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    bounds: WorldTileBounds,
    recordHistory: boolean,
    mutateTile: (worldX: number, worldY: number, level: number, map: EditorMapSquare, sceneX: number, sceneY: number) => void,
): void {
    const mapsTouched = new Set<number>();
    for (let worldX = bounds.minWorldX; worldX <= bounds.maxWorldX; worldX++) {
        for (let worldY = bounds.minWorldY; worldY <= bounds.maxWorldY; worldY++) {
            const mapX = Math.floor(worldX / 64);
            const mapY = Math.floor(worldY / 64);
            const map = renderer.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
            if (!map) {
                continue;
            }
            mapsTouched.add(getMapSquareId(map.mapX, map.mapY));
            const { sceneX, sceneY } = worldTileToSceneTile(worldX, worldY, map);
            for (let level = 0; level < map.scene.levels; level++) {
                const apply = () => {
                    mutateTile(worldX, worldY, level, map, sceneX, sceneY);
                };
                if (recordHistory) {
                    recordHistoryTileMutation(host, map, level, sceneX, sceneY, apply);
                } else {
                    apply();
                }
            }
            renderer.addAffectedTile(worldX, worldY);
        }
    }
    for (const mapId of mapsTouched) {
        const map = renderer.mapManager.getMapById(mapId) as EditorMapSquare | undefined;
        if (map) {
            markMapTerrainDirty(map);
        }
    }
}

function stampHasObjectCategoriesFromStamp(stamp: RegionStamp): boolean {
    return stampHasObjectCategories(resolveRegionStampCopyOptions(stamp.copyOptions));
}

function applyRegionObjects(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    bounds: WorldTileBounds,
    recordHistory: boolean,
    buildEntries: (map: EditorMapSquare, level: number) => SceneTileLocData[],
): void {
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
            const sceneBounds = sceneBoundsForWorldRect(map, bounds);
            if (!sceneBounds) {
                continue;
            }
            const mapId = getMapSquareId(map.mapX, map.mapY);
            for (let level = 0; level < map.scene.levels; level++) {
                const before = snapshotObjectEntriesForBounds(map, level, sceneBounds).map(cloneSceneTileLocEntry);
                for (const entry of before) {
                    clearObjectEntry(map, entry);
                }
                const newEntries = buildEntries(map, level);
                for (const entry of newEntries) {
                    applySceneTileLocEntry(map.scene, entry);
                }
                const after = snapshotObjectEntriesForBounds(map, level, sceneBounds).map(cloneSceneTileLocEntry);
                if (recordHistory && JSON.stringify(before) !== JSON.stringify(after)) {
                    host.recordHistoryObjectChange(mapId, level, before, after);
                }
                markMapObjectChunks(map, mapId, renderer, sceneBounds);
                syncMapObjectPickIndex(map, mapId);
            }
        }
    }
}

export function applyRegionStampToScene(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    stamp: RegionStamp,
    originWorldX: number,
    originWorldY: number,
    rotation: number,
    options: { recordHistory: boolean; applyObjects?: boolean },
): WorldTileBounds {
    const applyObjects = options.applyObjects !== false;
    const copyOptions = resolveRegionStampCopyOptions(stamp.copyOptions);
    const targetBounds = boundsForStampAtOrigin(originWorldX, originWorldY, stamp, rotation);
    const tileLookup = new Map<string, ReturnType<typeof rotateTileFields>>();
    for (const tile of stamp.tiles) {
        const rotated = rotateStampLocalCoord(tile.relX, tile.relY, stamp.width, stamp.height, rotation);
        tileLookup.set(`${rotated.relX},${rotated.relY},${tile.level}`, rotateTileFields(tile.fields, rotation));
    }

    if (stampHasTileCategories(copyOptions)) {
        applyRegionTiles(host, renderer, targetBounds, options.recordHistory, (_worldX, _worldY, level, map, sceneX, sceneY) => {
            const relX = _worldX - targetBounds.minWorldX;
            const relY = _worldY - targetBounds.minWorldY;
            const fields = tileLookup.get(`${relX},${relY},${level}`);
            if (!fields) {
                return;
            }
            const current = readTileFieldSnapshot(map.scene, level, sceneX, sceneY);
            const merged = mergeTileFieldsForStampApply(current, fields, copyOptions);
            applyTileFields(map.scene, level, sceneX, sceneY, merged);
        });
    }

    if (applyObjects && stampHasObjectCategoriesFromStamp(stamp)) {
        applyRegionObjects(host, renderer, targetBounds, options.recordHistory, (map, level) => {
            const entries: SceneTileLocData[] = [];
            for (const object of stamp.objects) {
                if (object.level !== level) {
                    continue;
                }
                const pasted = buildPastedObjectEntry(host, map, stamp, object, originWorldX, originWorldY, rotation);
                if (pasted) {
                    entries.push(pasted);
                }
            }
            return entries;
        });
    }

    return targetBounds;
}

export function pasteRegionStampAt(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    stamp: RegionStamp,
    originWorldX: number,
    originWorldY: number,
    rotation: number,
): boolean {
    if (host.isHistoryApplying()) {
        return false;
    }

    host.beginHistoryStroke("region-stamp", "Paste region");
    applyRegionStampToScene(host, renderer, stamp, originWorldX, originWorldY, rotation, {
        recordHistory: true,
        applyObjects: true,
    });
    host.commitHistoryStroke();
    renderer.updateAffectedTiles();
    renderer.host.scheduleMinimapRefreshAfterEdit();
    return true;
}

export function deleteRegionBounds(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    bounds: WorldTileBounds,
): boolean {
    if (host.isHistoryApplying()) {
        return false;
    }

    host.beginHistoryStroke("region-stamp", "Delete region");
    const empty = emptyTileFields();
    applyRegionTiles(host, renderer, bounds, true, (_wx, _wy, level, map, sceneX, sceneY) => {
        applyTileFields(map.scene, level, sceneX, sceneY, empty);
    });
    applyRegionObjects(host, renderer, bounds, true, () => []);
    host.commitHistoryStroke();
    renderer.updateAffectedTiles();
    renderer.host.scheduleMinimapRefreshAfterEdit();
    return true;
}

export { captureRegionStamp as captureRegionStampFromBounds };
export { buildPastedObjectEntry as buildRegionStampPreviewObjectEntry };
