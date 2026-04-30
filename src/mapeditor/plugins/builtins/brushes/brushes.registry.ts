import type { MapEditorBrushType } from "../../../map-editor-kinds";
import type { BrushTypePlugin } from "../builtin-plugin-types";
import { circleBrushType } from "./circle.brush";
import { diamondBrushType } from "./diamond.brush";
import { squareBrushType } from "./square.brush";

export const BUILTIN_BRUSH_TYPE_PLUGINS: readonly BrushTypePlugin[] = [
    squareBrushType,
    circleBrushType,
    diamondBrushType,
];

const brushTypePluginById: Record<MapEditorBrushType, BrushTypePlugin> = {
    square: squareBrushType,
    circle: circleBrushType,
    diamond: diamondBrushType,
};

export function getBuiltinBrushTypePlugin(shape: MapEditorBrushType): BrushTypePlugin {
    return brushTypePluginById[shape];
}

export function isInBuiltinBrushShape(
    dx: number,
    dy: number,
    radius: number,
    shape: MapEditorBrushType,
): boolean {
    return getBuiltinBrushTypePlugin(shape).isInBrushShape(dx, dy, radius);
}
