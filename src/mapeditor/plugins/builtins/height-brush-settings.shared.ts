import {
    ArrowUpDown,
    Layers,
    Mountain,
    Sparkles,
    Waves,
    type LucideIcon,
} from "lucide-react";

import type { HeightPaintMode } from "./height-tool-model";

export const HEIGHT_MODES: readonly {
    id: HeightPaintMode;
    name: string;
    description: string;
    icon: LucideIcon;
}[] = [
    {
        id: "raise-lower",
        name: "Raise / Lower",
        description: "Default tile height editing. Paint raises terrain; hold Alt to lower.",
        icon: ArrowUpDown,
    },
    {
        id: "slope",
        name: "Slope",
        description: "Creates a directional ramp across the brushed area.",
        icon: Mountain,
    },
    {
        id: "blend",
        name: "Blend",
        description: "Blends tiles into nearby terrain for softer transitions.",
        icon: Waves,
    },
    {
        id: "smooth",
        name: "Smooth",
        description: "Averages neighboring heights for classic smoothing.",
        icon: Sparkles,
    },
    {
        id: "flatten",
        name: "Flatten",
        description: "Pulls tiles toward the hovered anchor height for plateaus.",
        icon: Layers,
    },
    {
        id: "terrace",
        name: "Terrace",
        description: "Snaps terrain into stepped levels for layered landforms.",
        icon: Layers,
    },
];
