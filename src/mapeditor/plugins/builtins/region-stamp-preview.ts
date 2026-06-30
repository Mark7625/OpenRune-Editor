import { getMapSquareId } from "../../../rs/map/MapFileIndex";
import type { IEditorPluginHost } from "../editor-plugin-host";
import type { EditorMapSquare } from "../../webgl/EditorMapSquare";
import type { EditorObjectRef } from "../../webgl/sceneLocPicker";
import { editorObjectRefFromSceneTileLocEntry } from "../../webgl/sceneLocPicker";
import type { WebGLMapEditorRenderer } from "../../webgl/WebGLMapEditorRenderer";
import { buildRegionStampPreviewObjectEntry } from "./region-stamp-apply";
import { rotateStampLocalCoord, type RegionStamp } from "./region-stamp-types";

export function buildRegionStampPreviewObjectRefs(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    stamp: RegionStamp,
    originWorldX: number,
    originWorldY: number,
    rotation: number,
): EditorObjectRef[] {
    const refs: EditorObjectRef[] = [];

    for (const object of stamp.objects) {
        if (!host.isPlaneVisible(object.level)) {
            continue;
        }

        const rotated = rotateStampLocalCoord(object.relX, object.relY, stamp.width, stamp.height, rotation);
        const targetWorldX = originWorldX + rotated.relX;
        const targetWorldY = originWorldY + rotated.relY;
        const mapX = Math.floor(targetWorldX / 64);
        const mapY = Math.floor(targetWorldY / 64);
        const map = renderer.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
        if (!map) {
            continue;
        }

        const entry = buildRegionStampPreviewObjectEntry(
            host,
            map,
            stamp,
            object,
            originWorldX,
            originWorldY,
            rotation,
        );
        if (!entry) {
            continue;
        }

        const ref = editorObjectRefFromSceneTileLocEntry(map, getMapSquareId(map.mapX, map.mapY), entry);
        if (ref) {
            refs.push(ref);
        }
    }

    return refs;
}

export function buildRegionStampPreviewTileWorldKeys(
    host: IEditorPluginHost,
    stamp: RegionStamp,
    originWorldX: number,
    originWorldY: number,
    rotation: number,
): Map<string, { worldX: number; worldY: number; level: number }> {
    const tiles = new Map<string, { worldX: number; worldY: number; level: number }>();

    for (const tile of stamp.tiles) {
        if (!host.isPlaneVisible(tile.level)) {
            continue;
        }

        const rotated = rotateStampLocalCoord(tile.relX, tile.relY, stamp.width, stamp.height, rotation);
        const worldX = originWorldX + rotated.relX;
        const worldY = originWorldY + rotated.relY;
        tiles.set(`${tile.level}:${worldX},${worldY}`, { worldX, worldY, level: tile.level });
    }

    return tiles;
}
