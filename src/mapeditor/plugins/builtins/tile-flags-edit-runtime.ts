import { applyTileRenderFlags, hasTileRenderFlag, TileRenderFlag } from "../../../rs/map/TileRenderFlags";
import { Scene } from "../../../rs/scene/Scene";
import { recordHistoryTileMutation } from "../../map-editor-history-record";
import type { EditorMapSquare } from "../../webgl/EditorMapSquare";
import type { WebGLMapEditorRenderer } from "../../webgl/WebGLMapEditorRenderer";
import { getTileFlagsToolModel } from "./tile-flags-tool-model";

function tileFlagsPaintKey(mapId: number, sceneX: number, sceneY: number, level: number): string {
    return `${mapId}:${level}:${sceneX}:${sceneY}`;
}

/** OSRS stores bridge / render-Z on plane 1; mirror when painting from ground. */
function storageLevelsForPaint(selectedLevel: number, paintFlags: ReadonlySet<TileRenderFlag>): number[] {
    const levels = [selectedLevel];
    if (selectedLevel === 0 && Scene.MAX_LEVELS > 1) {
        for (const flag of paintFlags) {
            if (flag === TileRenderFlag.BRIDGE_TILE || flag === TileRenderFlag.RENDER_ON_LOWER_Z) {
                levels.push(1);
                break;
            }
        }
    }
    return levels;
}

function applyFlagsAt(
    renderer: WebGLMapEditorRenderer,
    map: EditorMapSquare,
    level: number,
    sceneX: number,
    sceneY: number,
    paintFlags: ReadonlySet<TileRenderFlag>,
    removeMode: boolean,
): boolean {
    const scene = map.scene;
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
            return false;
        }
    }

    const next = applyTileRenderFlags(current, paintFlags, removeMode);
    if (next === current) {
        return false;
    }

    recordHistoryTileMutation(renderer.host, map, level, sceneX, sceneY, () => {
        scene.tileRenderFlags[level][sceneX][sceneY] = next;
    });
    return true;
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

    const selectedLevel = renderer.host.selectedLevel;
    const targetLevels = storageLevelsForPaint(selectedLevel, paintFlags);

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

            const paintKey = tileFlagsPaintKey(mapId, sceneX, sceneY, selectedLevel);
            if (paintedKeys.has(paintKey)) {
                continue;
            }
            paintedKeys.add(paintKey);

            let tileChanged = false;
            for (const level of targetLevels) {
                if (applyFlagsAt(renderer, map, level, sceneX, sceneY, paintFlags, removeMode)) {
                    tileChanged = true;
                }
            }
            if (!tileChanged) {
                continue;
            }
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
