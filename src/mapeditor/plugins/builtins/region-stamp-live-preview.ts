import { getMapSquareId } from "../../../rs/map/MapFileIndex";
import { readTileFieldSnapshot } from "../../map-editor-history-snapshot";
import type { TileFieldSnapshot } from "../../map-editor-history";
import { cloneSceneTileLocEntry, snapshotObjectEntriesForBounds } from "../../map-editor-object-history";
import type { IEditorPluginHost } from "../editor-plugin-host";
import type { EditorMapSquare } from "../../webgl/EditorMapSquare";
import type { WebGLMapEditorRenderer } from "../../webgl/WebGLMapEditorRenderer";
import type { CopyFootprintSceneBounds } from "./object-copy-placement";
import { applyRegionStampToScene, applyTileFields, clearObjectEntry, markMapObjectChunks, sceneBoundsForWorldRect } from "./region-stamp-apply";
import { boundsForStampAtOrigin } from "./region-stamp-capture";
import { worldTileToSceneTile } from "./object-transform-runtime";
import type { SceneTileLocData } from "../../webgl/sceneLocData";
import { applySceneTileLocEntry } from "../../webgl/sceneLocData";
import { syncMapObjectPickIndex } from "./object-transform-runtime";
import type { WorldTileBounds } from "./region-stamp-types";
import type { RegionStamp } from "./region-stamp-types";

type SnapshotTile = {
    mapId: number;
    level: number;
    sceneX: number;
    sceneY: number;
    worldX: number;
    worldY: number;
    fields: TileFieldSnapshot;
};

type SnapshotObjectLayer = {
    mapId: number;
    level: number;
    sceneBounds: CopyFootprintSceneBounds;
    entries: SceneTileLocData[];
};

export type RegionStampAreaSnapshot = {
    bounds: WorldTileBounds;
    tiles: SnapshotTile[];
    objectLayers: SnapshotObjectLayer[];
};

export function captureRegionAreaSnapshot(
    renderer: WebGLMapEditorRenderer,
    bounds: WorldTileBounds,
): RegionStampAreaSnapshot {
    const tiles: SnapshotTile[] = [];
    const objectLayers: SnapshotObjectLayer[] = [];
    const mapsSeen = new Set<string>();

    for (let worldX = bounds.minWorldX; worldX <= bounds.maxWorldX; worldX++) {
        for (let worldY = bounds.minWorldY; worldY <= bounds.maxWorldY; worldY++) {
            const mapX = Math.floor(worldX / 64);
            const mapY = Math.floor(worldY / 64);
            const map = renderer.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
            if (!map) {
                continue;
            }
            const mapId = getMapSquareId(map.mapX, map.mapY);
            const { sceneX, sceneY } = worldTileToSceneTile(worldX, worldY, map);
            for (let level = 0; level < map.scene.levels; level++) {
                tiles.push({
                    mapId,
                    level,
                    sceneX,
                    sceneY,
                    worldX,
                    worldY,
                    fields: readTileFieldSnapshot(map.scene, level, sceneX, sceneY),
                });
            }

            const key = `${mapX},${mapY}`;
            if (mapsSeen.has(key)) {
                continue;
            }
            mapsSeen.add(key);
            const sceneBounds = sceneBoundsForWorldRect(map, bounds);
            if (!sceneBounds) {
                continue;
            }
            for (let level = 0; level < map.scene.levels; level++) {
                objectLayers.push({
                    mapId,
                    level,
                    sceneBounds,
                    entries: snapshotObjectEntriesForBounds(map, level, sceneBounds).map(cloneSceneTileLocEntry),
                });
            }
        }
    }

    return { bounds, tiles, objectLayers };
}

function markSnapshotMapsDirty(renderer: WebGLMapEditorRenderer, snapshot: RegionStampAreaSnapshot): void {
    const mapIds = new Set<number>();
    for (const tile of snapshot.tiles) {
        mapIds.add(tile.mapId);
        renderer.addAffectedTile(tile.worldX, tile.worldY);
    }
    for (const mapId of mapIds) {
        const map = renderer.mapManager.getMapById(mapId) as EditorMapSquare | undefined;
        if (map) {
            map.heightUpdated = true;
            map.underlayUpdated = true;
            map.overlayUpdated = true;
            map.tileRenderFlagsUpdated = true;
            map.objectUpdated = true;
        }
    }
}

export function restoreRegionAreaSnapshot(renderer: WebGLMapEditorRenderer, snapshot: RegionStampAreaSnapshot): void {
    const mapById = new Map<number, EditorMapSquare>();

    for (const tile of snapshot.tiles) {
        let map = mapById.get(tile.mapId);
        if (!map) {
            map = renderer.mapManager.getMapById(tile.mapId) as EditorMapSquare | undefined;
            if (!map) {
                continue;
            }
            mapById.set(tile.mapId, map);
        }
        applyTileFields(map.scene, tile.level, tile.sceneX, tile.sceneY, tile.fields);
    }

    for (const layer of snapshot.objectLayers) {
        const map = renderer.mapManager.getMapById(layer.mapId) as EditorMapSquare | undefined;
        if (!map) {
            continue;
        }
        const current = snapshotObjectEntriesForBounds(map, layer.level, layer.sceneBounds).map(cloneSceneTileLocEntry);
        for (const entry of current) {
            clearObjectEntry(map, entry);
        }
        for (const entry of layer.entries) {
            applySceneTileLocEntry(map.scene, entry);
        }
        markMapObjectChunks(map, layer.mapId, renderer, layer.sceneBounds);
        syncMapObjectPickIndex(map, layer.mapId);
    }

    markSnapshotMapsDirty(renderer, snapshot);
    renderer.updateAffectedTiles();
}

let activePreviewKey: string | null = null;
let activePreviewBaseline: RegionStampAreaSnapshot | null = null;

export function syncRegionStampLivePreview(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    stamp: RegionStamp,
    originWorldX: number,
    originWorldY: number,
    rotation: number,
): void {
    const key = `${originWorldX},${originWorldY},${rotation & 3},${stamp.width},${stamp.height}`;
    if (activePreviewKey === key) {
        return;
    }

    clearRegionStampLivePreview(renderer);

    const bounds = boundsForStampAtOrigin(originWorldX, originWorldY, stamp, rotation);
    activePreviewBaseline = captureRegionAreaSnapshot(renderer, bounds);
    applyRegionStampToScene(host, renderer, stamp, originWorldX, originWorldY, rotation, {
        recordHistory: false,
        applyObjects: false,
    });
    renderer.updateAffectedTiles();
    activePreviewKey = key;
}

export function clearRegionStampLivePreview(renderer: WebGLMapEditorRenderer): void {
    if (!activePreviewBaseline) {
        activePreviewKey = null;
        return;
    }

    restoreRegionAreaSnapshot(renderer, activePreviewBaseline);
    activePreviewBaseline = null;
    activePreviewKey = null;
}

export function hasActiveRegionStampLivePreview(): boolean {
    return activePreviewBaseline != null;
}
