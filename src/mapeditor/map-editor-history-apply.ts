import { getMapSquareId } from "../rs/map/MapFileIndex";
import type { Scene } from "../rs/scene/Scene";

import type { MapEditorHistoryEntry, MapSquareObjectDelta, MapSquareTileDelta, TileFieldSnapshot } from "./map-editor-history";
import { applyObjectSnapshotEntries } from "./map-editor-object-history";
import type { EditorMapSquare } from "./webgl/EditorMapSquare";
import type { WebGLMapEditorRenderer } from "./webgl/WebGLMapEditorRenderer";

function applySnapshotToTile(
    scene: Scene,
    level: number,
    sceneX: number,
    sceneY: number,
    snap: TileFieldSnapshot,
    map: EditorMapSquare,
    renderer: WebGLMapEditorRenderer,
    localTileId: number,
): { heightChanged: boolean; underlayChanged: boolean; overlayChanged: boolean; flagsChanged: boolean } {
    let heightChanged = false;
    let underlayChanged = false;
    let overlayChanged = false;
    let flagsChanged = false;

    if (snap.hl !== undefined && snap.hl.length > 0) {
        for (let i = 0; i < snap.hl.length; i++) {
            scene.tileHeights[level + i][sceneX][sceneY] = snap.hl[i];
        }
        heightChanged = true;
        const localX = localTileId >> 8;
        const localY = localTileId & 0xff;
        renderer.addHeightChangedTile(map.mapX * 64 + localX, map.mapY * 64 + localY);
    } else if (snap.h !== undefined) {
        scene.setHeight(level, sceneX, sceneY, snap.h);
        heightChanged = true;
        const localX = localTileId >> 8;
        const localY = localTileId & 0xff;
        renderer.addHeightChangedTile(map.mapX * 64 + localX, map.mapY * 64 + localY);
    }
    if (snap.u !== undefined) {
        scene.tileUnderlays[level][sceneX][sceneY] = snap.u;
        underlayChanged = true;
    }
    if (snap.o !== undefined) {
        scene.tileOverlays[level][sceneX][sceneY] = snap.o;
        overlayChanged = true;
    }
    if (snap.s !== undefined) {
        scene.tileShapes[level][sceneX][sceneY] = snap.s;
        overlayChanged = true;
    }
    if (snap.r !== undefined) {
        scene.tileRotations[level][sceneX][sceneY] = snap.r;
        overlayChanged = true;
    }
    if (snap.f !== undefined) {
        scene.tileRenderFlags[level][sceneX][sceneY] = snap.f;
        flagsChanged = true;
    }

    const localX = localTileId >> 8;
    const localY = localTileId & 0xff;
    if (localX >= 0 && localX < 64 && localY >= 0 && localY < 64) {
        const worldX = map.mapX * 64 + localX;
        const worldY = map.mapY * 64 + localY;
        const expand = heightChanged ? 2 : underlayChanged || overlayChanged ? 4 : 0;
        for (let x = worldX - expand; x <= worldX + expand; x++) {
            for (let y = worldY - expand; y <= worldY + expand; y++) {
                renderer.addAffectedTile(x, y);
            }
        }
        if (expand === 0) {
            renderer.addAffectedTile(worldX, worldY);
        }
    }

    return { heightChanged, underlayChanged, overlayChanged, flagsChanged };
}

function applySquareDelta(
    renderer: WebGLMapEditorRenderer,
    delta: MapSquareTileDelta,
    direction: "before" | "after",
): void {
    const map = renderer.mapManager.getMapById(delta.mapId) as EditorMapSquare | undefined;
    if (!map) {
        return;
    }
    const scene = map.scene;
    const border = map.borderSize;
    let heightChanged = false;
    let underlayChanged = false;
    let overlayChanged = false;
    let flagsChanged = false;

    for (const [localTileId, before, after] of delta.tiles) {
        const sceneX = border + (localTileId >> 8);
        const sceneY = border + (localTileId & 0xff);
        if (sceneX < 0 || sceneX >= scene.sizeX || sceneY < 0 || sceneY >= scene.sizeY) {
            continue;
        }
        const snap = direction === "before" ? before : after;
        const result = applySnapshotToTile(scene, delta.level, sceneX, sceneY, snap, map, renderer, localTileId);
        heightChanged ||= result.heightChanged;
        underlayChanged ||= result.underlayChanged;
        overlayChanged ||= result.overlayChanged;
        flagsChanged ||= result.flagsChanged;
    }

    if (heightChanged) {
        map.heightUpdated = true;
        map.heightRebuildMinLevel =
            map.heightRebuildMinLevel === undefined
                ? delta.level
                : Math.min(map.heightRebuildMinLevel, delta.level);
    }
    if (underlayChanged) {
        map.underlayUpdated = true;
    }
    if (overlayChanged) {
        map.overlayUpdated = true;
    }
    if (flagsChanged) {
        map.tileRenderFlagsUpdated = true;
    }
}

function applyObjectDelta(
    renderer: WebGLMapEditorRenderer,
    delta: MapSquareObjectDelta,
    direction: "before" | "after",
): void {
    const map = renderer.mapManager.getMapById(delta.mapId) as EditorMapSquare | undefined;
    if (!map) {
        return;
    }
    const clearEntries = direction === "before" ? delta.after : delta.before;
    const applyEntries = direction === "before" ? delta.before : delta.after;
    applyObjectSnapshotEntries(map, delta.mapId, renderer, clearEntries, applyEntries);
}

function applyEntry(renderer: WebGLMapEditorRenderer, entry: MapEditorHistoryEntry, direction: "before" | "after"): void {
    for (const delta of entry.deltas) {
        applySquareDelta(renderer, delta, direction);
    }
    for (const delta of entry.objectDeltas) {
        applyObjectDelta(renderer, delta, direction);
    }
}

export function applyHistoryUndo(renderer: WebGLMapEditorRenderer, entry: MapEditorHistoryEntry): void {
    applyEntry(renderer, entry, "before");
    renderer.updateAffectedTiles();
    renderer.host.scheduleMinimapRefreshAfterEdit();
}

export function applyHistoryRedo(renderer: WebGLMapEditorRenderer, entry: MapEditorHistoryEntry): void {
    applyEntry(renderer, entry, "after");
    renderer.updateAffectedTiles();
    renderer.host.scheduleMinimapRefreshAfterEdit();
}

export function applyHistoryJump(
    renderer: WebGLMapEditorRenderer,
    entries: MapEditorHistoryEntry[],
    direction: "undo" | "redo",
): void {
    if (entries.length === 0) {
        return;
    }
    if (direction === "undo") {
        for (const entry of entries) {
            applyEntry(renderer, entry, "before");
        }
    } else {
        for (const entry of entries) {
            applyEntry(renderer, entry, "after");
        }
    }
    renderer.updateAffectedTiles();
    renderer.host.scheduleMinimapRefreshAfterEdit();
}

export function mapIdToCoords(mapId: number): { mapX: number; mapY: number } {
    return {
        mapX: (mapId >> 8) & 0xff,
        mapY: mapId & 0xff,
    };
}

export function formatMapSquareLabel(mapId: number): string {
    const { mapX, mapY } = mapIdToCoords(mapId);
    return `${mapX}, ${mapY}`;
}

export function getMapSquareIdFromWorld(worldX: number, worldY: number): number {
    const mapX = Math.floor(worldX / 64);
    const mapY = Math.floor(worldY / 64);
    return getMapSquareId(mapX, mapY);
}
