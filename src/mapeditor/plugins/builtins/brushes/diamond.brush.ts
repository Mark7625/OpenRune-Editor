import type { BrushTypePlugin } from "../builtin-plugin-types";

export const diamondBrushType: BrushTypePlugin = {
    id: "diamond",
    name: "Diamond",
    description: "Diamond (Manhattan) footprint: |dx|+|dy| <= radius.",
    isInBrushShape(dx, dy, radius) {
        if (radius < 0) {
            return false;
        }
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        return ax + ay <= radius;
    },
};
