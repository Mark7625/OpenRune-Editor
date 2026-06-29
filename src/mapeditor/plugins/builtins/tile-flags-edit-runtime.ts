import { applyTileRenderFlags, hasTileRenderFlag } from "../../../rs/map/TileRenderFlags";
import { recordHistoryTileMutation } from "../../map-editor-history-record";
import type { EditorMapSquare } from "../../webgl/EditorMapSquare";
import type { WebGLMapEditorRenderer } from "../../webgl/WebGLMapEditorRenderer";
import { getTileFlagsToolModel } from "./tile-flags-tool-model";

function tileFlagsPaintKey(mapId: number, sceneX: number, sceneY: number, level: number): string {
    return `${mapId}:${level}:${sceneX}:${sceneY}`;
}

export function applyTileRenderFlagsRuntime(
    renderer: WebGLMapEditorRenderer,
    hoveredTilesMap: Map<number, Set<number>>,
    paintedKeys: Set<string>,
    removeMode: boolean,
): void {
    const paintFlags = getTileFlagsToolModel(renderer.host).paintFlags;
    if (paintFlags.size === 0) {
        return;
    }

    const level = renderer.host.selectedLevel;

    for (const [mapId, tileIds] of hoveredTilesMap) {
        const map = renderer.mapManager.getMapById(mapId);
        if (!map) {
            continue;
        }

        const scene = map.scene;
        let mapChanged = false;

        for (const tileId of tileIds) {
            const sceneX = tileId >> 8;
            const sceneY = tileId & 0xff;
            if (sceneX >= scene.sizeX || sceneY >= scene.sizeY) {
                continue;
            }

            const paintKey = tileFlagsPaintKey(mapId, sceneX, sceneY, level);
            if (paintedKeys.has(paintKey)) {
                continue;
            }
            paintedKeys.add(paintKey);

            const current = scene.tileRenderFlags[level][sceneX][sceneY] ?? 0;

            if (!removeMode) {
                let allPaintFlagsSet = true;
                for (const flag of paintFlags) {
                    if (!hasTileRenderFlag(current, flag)) {
                        allPaintFlagsSet = false;
                        break;
                    }
                }
                if (allPaintFlagsSet) {
                    continue;
                }
            }

            const next = applyTileRenderFlags(current, paintFlags, removeMode);
            if (next === current) {
                continue;
            }

            recordHistoryTileMutation(renderer.host, map as EditorMapSquare, level, sceneX, sceneY, () => {
                scene.tileRenderFlags[level][sceneX][sceneY] = next;
            });
            mapChanged = true;

            const tileX = sceneX - map.borderSize;
            const tileY = sceneY - map.borderSize;
            if (tileX < 0 || tileX >= 64 || tileY < 0 || tileY >= 64) {
                continue;
            }

            const worldX = map.mapX * 64 + tileX;
            const worldY = map.mapY * 64 + tileY;
            renderer.addAffectedTile(worldX, worldY);
        }

        if (mapChanged) {
            map.tileRenderFlagsUpdated = true;
        }
    }
}
