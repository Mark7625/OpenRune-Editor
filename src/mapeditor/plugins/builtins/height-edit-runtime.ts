import { clamp } from "../../../util/MathUtil";
import { getActivePaintModifiers } from "../../editor-tool-input";
import { getBuiltinEditorToolPlugin } from "./current-plugin-layout.builtin";
import { getHeightToolModel } from "./height-tool-model";
import { recordHistoryTileMutation } from "../../map-editor-history-record";
import type { EditorMapSquare } from "../../webgl/EditorMapSquare";
import type { WebGLMapEditorRenderer } from "../../webgl/WebGLMapEditorRenderer";

function markHeightTileEdit(renderer: WebGLMapEditorRenderer, worldX: number, worldY: number): void {
    renderer.addHeightChangedTile(worldX, worldY);
    for (let x = worldX - 2; x <= worldX + 1; x++) {
        for (let y = worldY - 2; y <= worldY + 1; y++) {
            renderer.addAffectedTile(x, y);
        }
    }
}

function applyHeightChange(
    renderer: WebGLMapEditorRenderer,
    map: EditorMapSquare,
    level: number,
    sceneX: number,
    sceneY: number,
    worldX: number,
    worldY: number,
    nextHeight: number,
): void {
    recordHistoryTileMutation(renderer.host, map, level, sceneX, sceneY, () => {
        map.scene.setHeight(level, sceneX, sceneY, nextHeight);
    });
    markHeightTileEdit(renderer, worldX, worldY);
}

export function applyHeightBlendRuntime(
    renderer: WebGLMapEditorRenderer,
    hoveredTilesMap: Map<number, Set<number>>,
    strength: number,
): void {
    const level = renderer.host.selectedLevel;
    const blend = Math.max(0.05, Math.min(1, strength));
    const worldTileAverageHeightMap = new Map<number, { avg: number; edgeDelta: number }>();
    for (const [mapId, tileIds] of hoveredTilesMap) {
        const map = renderer.mapManager.getMapById(mapId);
        if (!map) {
            continue;
        }
        for (const tileId of tileIds) {
            const tileX = tileId >> 8;
            const tileY = tileId & 0xff;
            const worldX = map.mapX * 64 + tileX - map.borderSize;
            const worldY = map.mapY * 64 + tileY - map.borderSize;
            const worldTileId = (worldX << 16) | worldY;
            if (worldTileAverageHeightMap.has(worldTileId)) {
                continue;
            }
            const centerHeight = renderer.getHeightWorld(level, worldX, worldY);
            let weightedHeightSum = 0;
            let weightSum = 0;
            let maxEdgeDelta = 0;
            for (let x = worldX - 2; x <= worldX + 2; x++) {
                for (let y = worldY - 2; y <= worldY + 2; y++) {
                    const h = renderer.getHeightWorld(level, x, y);
                    const dist = Math.max(Math.abs(x - worldX), Math.abs(y - worldY));
                    const weight = dist === 0 ? 5 : dist === 1 ? 3 : 1;
                    weightedHeightSum += h * weight;
                    weightSum += weight;
                    maxEdgeDelta = Math.max(maxEdgeDelta, Math.abs(h - centerHeight));
                }
            }
            worldTileAverageHeightMap.set(worldTileId, {
                avg: Math.floor(weightedHeightSum / Math.max(1, weightSum)),
                edgeDelta: maxEdgeDelta,
            });
        }
    }
    for (const [mapId, tileIds] of hoveredTilesMap) {
        const map = renderer.mapManager.getMapById(mapId);
        if (!map) {
            continue;
        }
        const scene = map.scene;
        for (const tileId of tileIds) {
            const sceneX = tileId >> 8;
            const sceneY = tileId & 0xff;
            const tileX = sceneX - map.borderSize;
            const tileY = sceneY - map.borderSize;
            const worldX = map.mapX * 64 + tileX;
            const worldY = map.mapY * 64 + tileY;
            const worldTileId = (worldX << 16) | worldY;
            const avgData = worldTileAverageHeightMap.get(worldTileId);
            if (!avgData) {
                continue;
            }
            const height = scene.tileHeights[level][sceneX][sceneY];
            const minHeight = scene.getMinHeight(level, sceneX, sceneY);
            const maxHeight = minHeight - 0xff * 8;
            const brushRadius = Math.max(1, renderer.host.brushSize + 0.5);
            const brushDist = Math.hypot(worldX - renderer.hoverWorldX, worldY - renderer.hoverWorldY);
            const brushFalloff = Math.max(0.2, Math.min(1, 1 - brushDist / (brushRadius + 0.75)));
            const edgePreserve = avgData.edgeDelta > 56 ? 0.45 : avgData.edgeDelta > 32 ? 0.7 : 1;
            const blendFactor = blend * brushFalloff * edgePreserve;
            const nextHeight = clamp(Math.round(height + (avgData.avg - height) * blendFactor), maxHeight, minHeight);
            if (nextHeight === height) {
                continue;
            }
            applyHeightChange(renderer, map as EditorMapSquare, level, sceneX, sceneY, worldX, worldY, nextHeight);
        }
        map.heightUpdated = true;
    }
}

export function applyHeightSlopeRuntime(
    renderer: WebGLMapEditorRenderer,
    hoveredTilesMap: Map<number, Set<number>>,
    strength: number,
): void {
    const level = renderer.host.selectedLevel;
    const paintModifiers = getActivePaintModifiers(renderer.host);
    const direction = paintModifiers.heightInvertWithAlt ? -1 : 1;
    const points: { worldX: number; worldY: number }[] = [];
    for (const [mapId, tileIds] of hoveredTilesMap) {
        const map = renderer.mapManager.getMapById(mapId);
        if (!map) {
            continue;
        }
        for (const tileId of tileIds) {
            const sceneX = tileId >> 8;
            const sceneY = tileId & 0xff;
            const tileX = sceneX - map.borderSize;
            const tileY = sceneY - map.borderSize;
            points.push({
                worldX: map.mapX * 64 + tileX,
                worldY: map.mapY * 64 + tileY,
            });
        }
    }
    if (points.length === 0) {
        return;
    }

    let sumX = 0;
    let sumY = 0;
    for (const point of points) {
        sumX += point.worldX;
        sumY += point.worldY;
    }
    const centerX = Math.round(sumX / points.length);
    const centerY = Math.round(sumY / points.length);
    const yaw = ((renderer.host.camera.getYaw() & 2047) / 2048) * (Math.PI * 2);
    const axisX = Math.sin(yaw);
    const axisY = Math.cos(yaw);
    const maxAxisDistance = Math.max(1, renderer.host.brushSize + 1);
    const centerHeight = renderer.getHeightWorld(level, centerX, centerY);
    const slopeRange = renderer.host.heightAdjustStep * 6 * Math.max(0.1, Math.min(1, strength));

    for (const [mapId, tileIds] of hoveredTilesMap) {
        const map = renderer.mapManager.getMapById(mapId);
        if (!map) {
            continue;
        }
        const scene = map.scene;
        for (const tileId of tileIds) {
            const sceneX = tileId >> 8;
            const sceneY = tileId & 0xff;
            const tileX = sceneX - map.borderSize;
            const tileY = sceneY - map.borderSize;
            const worldX = map.mapX * 64 + tileX;
            const worldY = map.mapY * 64 + tileY;
            const offsetX = worldX - centerX;
            const offsetY = worldY - centerY;
            const axisOffset = offsetX * axisX + offsetY * axisY;
            const normalizedOffset = Math.max(-1, Math.min(1, axisOffset / maxAxisDistance));
            const radialDist = Math.hypot(offsetX, offsetY);
            const radialFalloff = Math.max(0.2, Math.min(1, 1 - radialDist / (renderer.host.brushSize + 1.25)));
            const targetHeight = Math.round(centerHeight + direction * normalizedOffset * slopeRange);
            const currentHeight = scene.tileHeights[level][sceneX][sceneY];
            const minHeight = scene.getMinHeight(level, sceneX, sceneY);
            const maxHeight = minHeight - 0xff * 8;
            const nextHeight = clamp(
                Math.round(currentHeight + (targetHeight - currentHeight) * ((0.2 + Math.min(0.65, strength)) * radialFalloff)),
                maxHeight,
                minHeight,
            );
            if (nextHeight === currentHeight) {
                continue;
            }
            applyHeightChange(renderer, map as EditorMapSquare, level, sceneX, sceneY, worldX, worldY, nextHeight);
        }
        map.heightUpdated = true;
    }
}

export function applyHeightSmoothingRuntime(
    renderer: WebGLMapEditorRenderer,
    hoveredTilesMap: Map<number, Set<number>>,
): void {
    const level = renderer.host.selectedLevel;

    const worldTileAverageHeightMap = new Map<number, number>();
    for (const [mapId, tileIds] of hoveredTilesMap) {
        const map = renderer.mapManager.getMapById(mapId);
        if (!map) {
            continue;
        }
        for (const tileId of tileIds) {
            const tileX = tileId >> 8;
            const tileY = tileId & 0xff;
            const worldX = map.mapX * 64 + tileX - map.borderSize;
            const worldY = map.mapY * 64 + tileY - map.borderSize;
            const worldTileId = (worldX << 16) | worldY;
            if (worldTileAverageHeightMap.has(worldTileId)) {
                continue;
            }
            let heightSum = 0;
            for (let x = worldX - 1; x <= worldX + 1; x++) {
                for (let y = worldY - 1; y <= worldY + 1; y++) {
                    heightSum += renderer.getHeightWorld(level, x, y);
                }
            }

            const avg = Math.floor(heightSum / 9);

            worldTileAverageHeightMap.set(worldTileId, avg);
        }
    }
    for (const [mapId, tileIds] of hoveredTilesMap) {
        const map = renderer.mapManager.getMapById(mapId);
        if (!map) {
            continue;
        }

        const scene = map.scene;

        for (const tileId of tileIds) {
            const sceneX = tileId >> 8;
            const sceneY = tileId & 0xff;
            const tileX = sceneX - map.borderSize;
            const tileY = sceneY - map.borderSize;
            const worldX = map.mapX * 64 + tileX;
            const worldY = map.mapY * 64 + tileY;
            const worldTileId = (worldX << 16) | worldY;

            const newHeight = worldTileAverageHeightMap.get(worldTileId);
            if (newHeight === undefined) {
                continue;
            }
            const height = scene.tileHeights[level][sceneX][sceneY];
            if (newHeight === height) {
                continue;
            }
            applyHeightChange(renderer, map as EditorMapSquare, level, sceneX, sceneY, worldX, worldY, newHeight);
        }

        map.heightUpdated = true;
    }
}

export function applyHeightAdjustmentRuntime(
    renderer: WebGLMapEditorRenderer,
    hoveredTilesMap: Map<number, Set<number>>,
): void {
    const level = renderer.host.selectedLevel;

    const paintModifiers = getActivePaintModifiers(renderer.host);
    const adjustment =
        getBuiltinEditorToolPlugin("height").data?.getHeightAdjustment?.(renderer.host, paintModifiers) ??
        (paintModifiers.heightInvertWithAlt ? renderer.host.heightAdjustStep : -renderer.host.heightAdjustStep);

    for (const [mapId, tileIds] of hoveredTilesMap) {
        const map = renderer.mapManager.getMapById(mapId);
        if (!map) {
            continue;
        }

        const scene = map.scene;

        for (const tileId of tileIds) {
            const sceneX = tileId >> 8;
            const sceneY = tileId & 0xff;

            const height = scene.tileHeights[level][sceneX][sceneY];
            const minHeight = scene.getMinHeight(level, sceneX, sceneY);
            const maxHeight = minHeight - 0xff * 8;
            const newHeight = clamp(height + adjustment, maxHeight, minHeight);

            if (newHeight === height) {
                continue;
            }

            const tileX = sceneX - map.borderSize;
            const tileY = sceneY - map.borderSize;
            const worldX = map.mapX * 64 + tileX;
            const worldY = map.mapY * 64 + tileY;
            applyHeightChange(renderer, map as EditorMapSquare, level, sceneX, sceneY, worldX, worldY, newHeight);
        }

        map.heightUpdated = true;
    }
}

export function applyHeightFlattenRuntime(
    renderer: WebGLMapEditorRenderer,
    hoveredTilesMap: Map<number, Set<number>>,
    strength: number,
): void {
    const level = renderer.host.selectedLevel;
    const flatten = Math.max(0.05, Math.min(1, strength));
    const targetHeight = renderer.getHeightWorld(level, renderer.hoverWorldX, renderer.hoverWorldY);
    for (const [mapId, tileIds] of hoveredTilesMap) {
        const map = renderer.mapManager.getMapById(mapId);
        if (!map) {
            continue;
        }
        const scene = map.scene;
        for (const tileId of tileIds) {
            const sceneX = tileId >> 8;
            const sceneY = tileId & 0xff;
            const tileX = sceneX - map.borderSize;
            const tileY = sceneY - map.borderSize;
            const worldX = map.mapX * 64 + tileX;
            const worldY = map.mapY * 64 + tileY;
            const offset = Math.hypot(worldX - renderer.hoverWorldX, worldY - renderer.hoverWorldY);
            const falloff = Math.max(0.2, Math.min(1, 1 - offset / (renderer.host.brushSize + 1.25)));
            const currentHeight = scene.tileHeights[level][sceneX][sceneY];
            const minHeight = scene.getMinHeight(level, sceneX, sceneY);
            const maxHeight = minHeight - 0xff * 8;
            const nextHeight = clamp(
                Math.round(currentHeight + (targetHeight - currentHeight) * flatten * falloff),
                maxHeight,
                minHeight,
            );
            if (nextHeight === currentHeight) {
                continue;
            }
            applyHeightChange(renderer, map as EditorMapSquare, level, sceneX, sceneY, worldX, worldY, nextHeight);
        }
        map.heightUpdated = true;
    }
}

export function applyHeightTerraceRuntime(
    renderer: WebGLMapEditorRenderer,
    hoveredTilesMap: Map<number, Set<number>>,
    terraceStep: number,
): void {
    const level = renderer.host.selectedLevel;
    const step = Math.max(2, Math.min(96, Math.round(terraceStep) || 2));
    for (const [mapId, tileIds] of hoveredTilesMap) {
        const map = renderer.mapManager.getMapById(mapId);
        if (!map) {
            continue;
        }
        const scene = map.scene;
        for (const tileId of tileIds) {
            const sceneX = tileId >> 8;
            const sceneY = tileId & 0xff;
            const tileX = sceneX - map.borderSize;
            const tileY = sceneY - map.borderSize;
            const worldX = map.mapX * 64 + tileX;
            const worldY = map.mapY * 64 + tileY;
            const currentHeight = scene.tileHeights[level][sceneX][sceneY];
            const minHeight = scene.getMinHeight(level, sceneX, sceneY);
            const maxHeight = minHeight - 0xff * 8;
            const snapped = Math.round(currentHeight / step) * step;
            const nextHeight = clamp(snapped, maxHeight, minHeight);
            if (nextHeight === currentHeight) {
                continue;
            }
            applyHeightChange(renderer, map as EditorMapSquare, level, sceneX, sceneY, worldX, worldY, nextHeight);
        }
        map.heightUpdated = true;
    }
}

export function applyHeightToolRuntime(
    renderer: WebGLMapEditorRenderer,
    hoveredTilesMap: Map<number, Set<number>>,
): void {
    const model = getHeightToolModel(renderer.host);
    switch (model.mode) {
        case "smooth":
            applyHeightSmoothingRuntime(renderer, hoveredTilesMap);
            break;
        case "slope":
            applyHeightSlopeRuntime(renderer, hoveredTilesMap, model.slopeStrength);
            break;
        case "blend":
            applyHeightBlendRuntime(renderer, hoveredTilesMap, model.blendStrength);
            break;
        case "flatten":
            applyHeightFlattenRuntime(renderer, hoveredTilesMap, model.flattenStrength);
            break;
        case "terrace":
            applyHeightTerraceRuntime(renderer, hoveredTilesMap, model.terraceStep);
            break;
        case "raise-lower":
        default:
            applyHeightAdjustmentRuntime(renderer, hoveredTilesMap);
            break;
    }
}
