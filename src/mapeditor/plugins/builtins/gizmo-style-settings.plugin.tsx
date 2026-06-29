import { Paintbrush } from "lucide-react";

import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
    sliderFromThickness,
    thicknessFromSlider,
    type Rgba,
} from "../../map-editor-gizmo-settings";
import type { MapEditorPlugin } from "../types";

function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): readonly [number, number, number] {
    const raw = hex.replace("#", "");
    if (raw.length !== 6) {
        return [1, 1, 1];
    }
    const r = Number.parseInt(raw.slice(0, 2), 16) / 255;
    const g = Number.parseInt(raw.slice(2, 4), 16) / 255;
    const b = Number.parseInt(raw.slice(4, 6), 16) / 255;
    return [r, g, b];
}

function RgbaColorRow({
    label,
    value,
    onChange,
}: {
    label: string;
    value: Rgba;
    onChange: (next: Rgba) => void;
}): JSX.Element {
    const hex = rgbToHex(value[0], value[1], value[2]);
    const alpha = Math.round(value[3] * 100);
    return (
        <div className="grid gap-1 rounded-md border p-2">
            <Label className="text-xs">{label}</Label>
            <div className="flex items-center gap-2">
                <Input
                    type="color"
                    value={hex}
                    className="h-8 w-12 p-1"
                    onChange={(e) => {
                        const [r, g, b] = hexToRgb(e.target.value);
                        onChange([r, g, b, value[3]]);
                    }}
                />
                <span className="text-xs text-muted-foreground">Opacity</span>
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={alpha}
                    className="h-2 flex-1 accent-primary"
                    onChange={(e) => {
                        const a = Number(e.target.value) / 100;
                        onChange([value[0], value[1], value[2], a]);
                    }}
                />
                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{alpha}%</span>
            </div>
        </div>
    );
}

function GizmoStyleSettingsTab({ pluginHost }: { pluginHost: import("../types").PluginContext["pluginHost"] }): JSX.Element {
    const appearance = pluginHost.getGizmoAppearance();
    return (
        <div className="grid gap-3 rounded-md border p-3">
            <RgbaColorRow
                label="Map square grid"
                value={appearance.mapSquareGrid}
                onChange={(next) => pluginHost.setGizmoAppearance({ mapSquareGrid: next })}
            />
            <RgbaColorRow
                label="Chunk grid"
                value={appearance.chunkGrid}
                onChange={(next) => pluginHost.setGizmoAppearance({ chunkGrid: next })}
            />
            <RgbaColorRow
                label="Brush fill"
                value={appearance.brushOutline.fill}
                onChange={(next) =>
                    pluginHost.setGizmoAppearance({
                        brushOutline: { ...appearance.brushOutline, fill: next },
                    })
                }
            />
            <RgbaColorRow
                label="Brush outline"
                value={appearance.brushOutline.outline}
                onChange={(next) =>
                    pluginHost.setGizmoAppearance({
                        brushOutline: { ...appearance.brushOutline, outline: next },
                    })
                }
            />
            <div className="grid gap-1 rounded-md border p-2">
                <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">Outline thickness</Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                        {sliderFromThickness(appearance.brushOutline.outlineThickness)}
                    </span>
                </div>
                <input
                    type="range"
                    min={1}
                    max={100}
                    value={sliderFromThickness(appearance.brushOutline.outlineThickness)}
                    className="h-2 w-full accent-primary"
                    onChange={(e) =>
                        pluginHost.setGizmoAppearance({
                            brushOutline: {
                                ...appearance.brushOutline,
                                outlineThickness: thicknessFromSlider(Number(e.target.value)),
                            },
                        })
                    }
                />
            </div>
            <p className="text-xs font-medium text-muted-foreground">Object selector wireframe</p>
            <RgbaColorRow
                label="Hover"
                value={appearance.objectSelector.hover}
                onChange={(next) =>
                    pluginHost.setGizmoAppearance({
                        objectSelector: { ...appearance.objectSelector, hover: next },
                    })
                }
            />
            <RgbaColorRow
                label="Selected"
                value={appearance.objectSelector.selected}
                onChange={(next) =>
                    pluginHost.setGizmoAppearance({
                        objectSelector: { ...appearance.objectSelector, selected: next },
                    })
                }
            />
        </div>
    );
}

export const gizmoStyleSettingsPlugin: MapEditorPlugin = {
    id: "openrune.settings.gizmo-style",
    manifest: {
        icon: <Paintbrush className="size-4" />,
        name: "Gizmo Style",
        description: "Customize map grids and brush highlight style.",
        author: "OpenRune",
        version: "0.1.0",
        tags: ["settings", "gizmo", "style"],
        internalOnly: true,
        showInHub: false,
    },
    settingsTabs: [
        {
            id: "gizmo-style",
            title: "Gizmo Style",
            order: 20,
            render: (ctx) => <GizmoStyleSettingsTab pluginHost={ctx.pluginHost} />,
        },
    ],
};
