import type { BrushTypePlugin } from "../builtin-plugin-types";

export const circleBrushType: BrushTypePlugin = {
    id: "circle",
    name: "Circle",
    description: "Circular footprint: tiles within Euclidean distance <= radius.",
    isInBrushShape(dx, dy, radius) {
        if (radius < 0) {
            return false;
        }
        return dx * dx + dy * dy <= radius * radius;
    },
};
