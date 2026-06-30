import { getMapSquareId } from "../../../rs/map/MapFileIndex";
import type { IEditorPluginHost } from "../editor-plugin-host";
import type { EditorMapSquare } from "../../webgl/EditorMapSquare";
import { getObjectChunkIdsForTileRect } from "../../webgl/objectChunk";
import {
    removeLocFromScene,
    type SceneTileLocData,
} from "../../webgl/sceneLocData";
import { markObjectChunksForHeightEdit } from "../../webgl/scene-loc-height-sync";
import {
    recordHistoryObjectMutation,
    snapshotObjectEntriesForRef,
} from "../../map-editor-object-history";
import type { EditorObjectRef } from "../../webgl/sceneLocPicker";
import type { WebGLMapEditorRenderer } from "../../webgl/WebGLMapEditorRenderer";
import {
    editorObjectRefKey,
} from "../../webgl/sceneLocPicker";
import {
    findLocForRef,
    syncMapObjectPickIndex,
} from "./object-transform-runtime";

function markObjectChunksForRef(map: EditorMapSquare, ref: EditorObjectRef): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
} {
    if (ref.kind === "loc") {
        const loc = findLocForRef(map, ref);
        if (loc) {
            return {
                minX: loc.startX,
                minY: loc.startY,
                maxX: loc.endX,
                maxY: loc.endY,
            };
        }
    }
    return {
        minX: ref.anchorTileX,
        minY: ref.anchorTileY,
        maxX: ref.anchorTileX,
        maxY: ref.anchorTileY,
    };
}

function tileEntryForRef(map: EditorMapSquare, ref: EditorObjectRef): SceneTileLocData | undefined {
    const entries = snapshotObjectEntriesForRef(map, ref);
    return entries[0];
}

function deleteObjectRefCore(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    map: EditorMapSquare,
    ref: EditorObjectRef,
): boolean {
    if (ref.kind === "loc") {
        const loc = findLocForRef(map, ref);
        if (!loc) {
            return false;
        }
        removeLocFromScene(map.scene, loc);
    } else {
        const entry = tileEntryForRef(map, ref);
        if (!entry) {
            return false;
        }
        const tile = map.scene.tiles[entry.level]?.[entry.tileX]?.[entry.tileY];
        if (!tile) {
            return false;
        }
        if (entry.wall) {
            tile.wall = undefined;
        } else if (entry.floorDecoration) {
            tile.floorDecoration = undefined;
        } else if (entry.wallDecoration) {
            tile.wallDecoration = undefined;
        } else {
            return false;
        }
    }

    const mapId = getMapSquareId(map.mapX, map.mapY);
    syncMapObjectPickIndex(map, mapId);

    const bounds = markObjectChunksForRef(map, ref);
    const localMinX = Math.max(0, bounds.minX - map.borderSize);
    const localMinY = Math.max(0, bounds.minY - map.borderSize);
    const localMaxX = Math.min(63, bounds.maxX - map.borderSize);
    const localMaxY = Math.min(63, bounds.maxY - map.borderSize);
    map.markObjectChunksDirty(localMinX, localMinY, localMaxX, localMaxY);
    markObjectChunksForHeightEdit(map, getObjectChunkIdsForTileRect(localMinX, localMinY, localMaxX, localMaxY));
    renderer.scheduleObjectChunkReload(mapId, map.dirtyObjectChunks);

    if (editorObjectRefKey(host.selectedObject, ref)) {
        host.clearSelectedObject();
    }
    if (editorObjectRefKey(host.getObjectCopyTemplate(), ref)) {
        host.cancelObjectCopyPlacement();
    }
    if (editorObjectRefKey(host.hoveredObject, ref)) {
        host.setHoveredObject(undefined);
    }

    return true;
}

export function deleteObjectRef(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    ref: EditorObjectRef,
): boolean {
    const map =
        (renderer.mapManager.getMap(ref.mapX, ref.mapY) as EditorMapSquare | undefined) ??
        (renderer.mapManager.getMapById(ref.mapId) as EditorMapSquare | undefined);
    if (!map) {
        return false;
    }

    return recordHistoryObjectMutation(
        host,
        map,
        ref.level,
        "Delete object",
        () => snapshotObjectEntriesForRef(map, ref),
        () => deleteObjectRefCore(host, renderer, map, ref),
        () => [],
        "object-delete",
    );
}
