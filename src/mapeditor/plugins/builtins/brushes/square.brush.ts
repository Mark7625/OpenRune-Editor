import type { BrushTypePlugin } from "../builtin-plugin-types";

export const squareBrushType: BrushTypePlugin = {
    id: "square",
    name: "Square",
    description: "Square footprint aligned to the map grid.",
    isInBrushShape(dx, dy, radius) {
        if (radius < 0) {
            return false;
        }
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        return ax <= radius && ay <= radius;
    },
};
