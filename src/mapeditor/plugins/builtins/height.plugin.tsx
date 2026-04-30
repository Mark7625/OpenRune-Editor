import { memo, useMemo, useSyncExternalStore } from "react";
import { ArrowDownToLine, ArrowUpDown, Layers, Mountain, Sparkles, Waves } from "lucide-react";

import type { EditorToolPlugin, MapEditorPalettePanelProps } from "./builtin-plugin-types";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Label } from "../../../components/ui/label";
import { Separator } from "../../../components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../components/ui/tooltip";
import { cn } from "../../../util/cn";
import { getBuiltinEditorToolPlugin } from "./current-plugin-layout.builtin";
import { getHeightToolModel, type HeightPaintMode } from "./height-tool-model";
import { isEditorToolKeybindHeld, keybindChordToLabel } from "../../editor-tool-input";
import "../../MapEditorPanel.css";

const HEIGHT_MODES: readonly {
    id: HeightPaintMode;
    name: string;
    description: string;
    icon: typeof ArrowUpDown;
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

function HeightEditorToolPanelInner({ pluginHost: host }: MapEditorPalettePanelProps): JSX.Element {
    const workbenchSnap = useSyncExternalStore(
        host.subscribeWorkbenchPlugins,
        host.getWorkbenchPluginsStateSnapshot,
        host.getWorkbenchPluginsStateSnapshot,
    );
    const heightModel = getHeightToolModel(host);
    const currentMode = heightModel.mode;
    const selectedMode = useMemo(() => HEIGHT_MODES.find((mode) => mode.id === currentMode) ?? HEIGHT_MODES[0], [currentMode]);
    const lowerModifierLabel = useMemo(() => {
        const chords = host.getResolvedKeybindChords("height:hold-lower-modifier", [
            { code: "AltLeft" },
            { code: "AltRight" },
        ]);
        const first = chords[0] ?? null;
        return first ? keybindChordToLabel(first) : "Unbound";
    }, [host, workbenchSnap]);

    return (
        <div className="map-editor-panel flex min-h-0 flex-1 flex-col">
            <CardHeader className="space-y-1.5 border-b border-border bg-muted/20 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold tracking-tight text-foreground">Height</CardTitle>
                    <Badge variant="outline" className="h-5 border-border px-2 font-mono text-[10px] font-normal">
                        Step {host.heightAdjustStep}
                    </Badge>
                </div>
                <div className="rounded-md border border-muted bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    Active mode: <span className="font-medium text-foreground">{selectedMode.name}</span>
                </div>
            </CardHeader>
            <Separator />
            <TooltipProvider delayDuration={250}>
                <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                    <div className="grid grid-cols-2 gap-1.5">
                        {HEIGHT_MODES.map((mode) => {
                            const Icon = mode.icon;
                            const selected = mode.id === currentMode;
                            return (
                                <Tooltip key={mode.id}>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={selected ? "secondary" : "outline"}
                                            className={cn("h-8 justify-start gap-1.5 px-2 text-[11px]", selected && "ring-1 ring-primary/35")}
                                            onClick={() => {
                                                heightModel.setMode(mode.id);
                                                host.setEditorTool("height");
                                            }}
                                        >
                                            <Icon className="size-3.5" />
                                            {mode.name}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom">{mode.description}</TooltipContent>
                                </Tooltip>
                            );
                        })}
                    </div>
                <p className="text-xs text-muted-foreground">{selectedMode.description}</p>
                <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Height step ({host.heightAdjustStep})
                    </Label>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <input
                                type="range"
                                min={1}
                                max={32}
                                value={host.heightAdjustStep}
                                onPointerDown={(event) => event.stopPropagation()}
                                onChange={(event) => {
                                    const raw = Number(event.target.value);
                                    getBuiltinEditorToolPlugin("height").data?.applyHeightStepFromRawInput?.(host, raw);
                                    host.notifyWorkbenchStateChanged();
                                }}
                                className="h-2 w-full accent-primary"
                            />
                        </TooltipTrigger>
                        <TooltipContent side="bottom">How much each stroke raises/lowers height.</TooltipContent>
                    </Tooltip>
                </div>
                {currentMode === "slope" ? (
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Slope strength ({Math.round(heightModel.slopeStrength * 100)}%)
                        </Label>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <input
                                    type="range"
                                    min={10}
                                    max={100}
                                    value={Math.round(heightModel.slopeStrength * 100)}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onChange={(event) => heightModel.setSlopeStrength(Number(event.target.value) / 100)}
                                    className="h-2 w-full accent-primary"
                                />
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Controls how steep the generated slope is.</TooltipContent>
                        </Tooltip>
                    </div>
                ) : null}
                {currentMode === "blend" ? (
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Blend strength ({Math.round(heightModel.blendStrength * 100)}%)
                        </Label>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <input
                                    type="range"
                                    min={5}
                                    max={100}
                                    value={Math.round(heightModel.blendStrength * 100)}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onChange={(event) => heightModel.setBlendStrength(Number(event.target.value) / 100)}
                                    className="h-2 w-full accent-primary"
                                />
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Higher values blend harder into nearby terrain.</TooltipContent>
                        </Tooltip>
                    </div>
                ) : null}
                {currentMode === "flatten" ? (
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Flatten strength ({Math.round(heightModel.flattenStrength * 100)}%)
                        </Label>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <input
                                    type="range"
                                    min={5}
                                    max={100}
                                    value={Math.round(heightModel.flattenStrength * 100)}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onChange={(event) => heightModel.setFlattenStrength(Number(event.target.value) / 100)}
                                    className="h-2 w-full accent-primary"
                                />
                            </TooltipTrigger>
                            <TooltipContent side="bottom">How fast terrain gets pulled to hovered anchor height.</TooltipContent>
                        </Tooltip>
                    </div>
                ) : null}
                {currentMode === "terrace" ? (
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Terrace step ({heightModel.terraceStep})
                        </Label>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <input
                                    type="range"
                                    min={2}
                                    max={96}
                                    value={heightModel.terraceStep}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onChange={(event) => heightModel.setTerraceStep(Number(event.target.value))}
                                    className="h-2 w-full accent-primary"
                                />
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Step size for snapped terrace levels.</TooltipContent>
                        </Tooltip>
                    </div>
                ) : null}
                <div className="rounded-md border border-border/80 bg-card/50 px-2.5 py-2 text-[11px] text-muted-foreground">
                    <ArrowDownToLine className="mr-1 inline size-3.5 align-text-bottom" />
                    Tip: paint raises terrain by default. Hold <span className="font-medium text-foreground">{lowerModifierLabel}</span> to lower (and invert slope direction).
                </div>
                </CardContent>
            </TooltipProvider>
        </div>
    );
}

export const HeightEditorToolPanel = memo(HeightEditorToolPanelInner);

export const heightEditorTool: EditorToolPlugin = {
    id: "height",
    name: "Height",
    description: "Terrain height editing with raise/lower, slope, blend, and smooth modes.",
    icon: ArrowUpDown,
    workspaces: [{ panelId: "editor-height", activateTab: true }],
    actions: [{ kind: "select-tool", tool: "height" }],
    data: {
        applyHeightStepFromRawInput: (host, raw) => {
            host.heightAdjustStep = Math.max(1, Math.min(256, Math.round(raw) || 1));
        },
        getHeightAdjustment: (host, modifiers) =>
            modifiers.heightInvertWithAlt ? host.heightAdjustStep : -host.heightAdjustStep,
    },
    palettePanel: HeightEditorToolPanel,
    paintPolicy: {
        getPaintModifiers: ({ host }) => {
            const lowerModifierHeld = isEditorToolKeybindHeld(host, "height:hold-lower-modifier", [
                { code: "AltLeft" },
                { code: "AltRight" },
            ]);
            return {
                heightInvertWithAlt: lowerModifierHeld,
                controlWheelAdjustsBrushSize: true,
            };
        },
    },
    keyBindings: [
        {
            id: "select-tool",
            name: "Select Height tool",
            description: "Switch active paint tool to Height.",
            defaultChords: [{ code: "Digit3" }],
            action: ({ host }) => {
                host.setEditorTool("height");
            },
        },
        {
            id: "hold-lower-modifier",
            name: "Hold lower modifier",
            description: "While held, height paint lowers terrain and inverts slope direction.",
            defaultChords: [{ code: "AltLeft" }, { code: "AltRight" }],
            trigger: "HELD",
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: () => true,
        },
        {
            id: "mode-raise-lower",
            name: "Height mode: Raise / Lower",
            description: "Switch Height tool mode to Raise / Lower.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                getHeightToolModel(host).setMode("raise-lower");
                return true;
            },
        },
        {
            id: "mode-slope",
            name: "Height mode: Slope",
            description: "Switch Height tool mode to Slope.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                getHeightToolModel(host).setMode("slope");
                return true;
            },
        },
        {
            id: "mode-blend",
            name: "Height mode: Blend",
            description: "Switch Height tool mode to Blend.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                getHeightToolModel(host).setMode("blend");
                return true;
            },
        },
        {
            id: "mode-smooth",
            name: "Height mode: Smooth",
            description: "Switch Height tool mode to Smooth.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                getHeightToolModel(host).setMode("smooth");
                return true;
            },
        },
        {
            id: "increase-step",
            name: "Increase height step",
            description: "Increase Height step slider value.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                host.heightAdjustStep = Math.max(1, Math.min(256, host.heightAdjustStep + 1));
                host.notifyWorkbenchStateChanged();
                return true;
            },
        },
        {
            id: "decrease-step",
            name: "Decrease height step",
            description: "Decrease Height step slider value.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                host.heightAdjustStep = Math.max(1, Math.min(256, host.heightAdjustStep - 1));
                host.notifyWorkbenchStateChanged();
                return true;
            },
        },
        {
            id: "increase-slope-strength",
            name: "Increase slope strength",
            description: "Increase Slope strength slider value.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                const model = getHeightToolModel(host);
                model.setSlopeStrength(model.slopeStrength + 0.05);
                return true;
            },
        },
        {
            id: "decrease-slope-strength",
            name: "Decrease slope strength",
            description: "Decrease Slope strength slider value.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                const model = getHeightToolModel(host);
                model.setSlopeStrength(model.slopeStrength - 0.05);
                return true;
            },
        },
        {
            id: "increase-blend-strength",
            name: "Increase blend strength",
            description: "Increase Blend strength slider value.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                const model = getHeightToolModel(host);
                model.setBlendStrength(model.blendStrength + 0.05);
                return true;
            },
        },
        {
            id: "decrease-blend-strength",
            name: "Decrease blend strength",
            description: "Decrease Blend strength slider value.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                const model = getHeightToolModel(host);
                model.setBlendStrength(model.blendStrength - 0.05);
                return true;
            },
        },
    ],
};
