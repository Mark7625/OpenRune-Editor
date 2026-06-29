import { useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { Label } from "../components/ui/label";
import { cn } from "../util/cn";
import { MapEditorBrushWorkspaceToolSettings } from "./MapEditorBrushWorkspaceToolSettings";
import { MapEditorBrushWorkspaceQuickControls } from "./map-editor-quick-controls";
import {
    BUILTIN_BRUSH_TYPE_PLUGINS,
    getBuiltinEditorToolPlugin,
} from "./plugins/builtins/current-plugin-layout.builtin";
import { OVERLAY_SAME_ID_FLOOD_BRUSH_HUD, OVERLAY_SAME_ID_FLOOD_UI } from "./overlay-flood-fill";
import type { MapEditorBrushType } from "./map-editor-kinds";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { MapEditorHudContext } from "./map-editor-workbench-context";

export type MapEditorBrushWorkspaceVariant = "bar" | "window";

export interface MapEditorBrushWorkspacePanelProps {
    pluginHost: IEditorPluginHost;
    variant?: MapEditorBrushWorkspaceVariant;
}

function BrushTypeSelect({
    floodActive,
    brushType,
    visibleBrushShapes,
    disabled,
    onChange,
    className,
}: {
    floodActive: boolean;
    brushType: MapEditorBrushType;
    visibleBrushShapes: readonly { id: MapEditorBrushType; name: string; description: string }[];
    disabled: boolean;
    onChange: (type: MapEditorBrushType) => void;
    className?: string;
}): JSX.Element {
    return (
        <select
            id="dock-brush-type"
            className={cn(
                "h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
            value={floodActive ? "__flood__" : brushType}
            disabled={disabled || floodActive}
            onChange={(e) => {
                const v = e.target.value as MapEditorBrushType | "__flood__";
                if (v === "__flood__") {
                    return;
                }
                onChange(v);
            }}
        >
            {floodActive ? (
                <option value="__flood__" title={OVERLAY_SAME_ID_FLOOD_UI.description}>
                    {OVERLAY_SAME_ID_FLOOD_UI.dropdownLabel}
                </option>
            ) : (
                visibleBrushShapes.map(({ id, name, description }) => (
                    <option key={id} value={id} title={description}>
                        {name}
                    </option>
                ))
            )}
        </select>
    );
}

function RadiusControl({
    brushSize,
    disabled,
    onChange,
    layout,
}: {
    brushSize: number;
    disabled: boolean;
    onChange: (size: number) => void;
    layout: MapEditorBrushWorkspaceVariant;
}): JSX.Element {
    const sliderClassName = layout === "bar" ? "w-24" : "w-full";
    return (
        <div className={cn("flex items-center gap-2", layout === "window" && "flex-col items-stretch gap-1")}>
            <div className={cn("flex items-center gap-2", layout === "window" && "justify-between")}>
                <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">Radius</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{brushSize}</span>
            </div>
            <input
                id="dock-brush-radius"
                type="range"
                min={0}
                max={16}
                step={1}
                value={brushSize}
                disabled={disabled}
                className={cn(
                    "map-editor-panel-slider h-1.5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50",
                    sliderClassName,
                )}
                onChange={(e) => onChange(Number(e.target.value))}
            />
        </div>
    );
}

function PlaneFooter({
    viewPlaneMax,
    hideBelowViewPlane,
    layout,
    onPlaneChange,
    onHideBelowChange,
}: {
    viewPlaneMax: number;
    hideBelowViewPlane: boolean;
    layout: MapEditorBrushWorkspaceVariant;
    onPlaneChange: (next: number) => void;
    onHideBelowChange: (next: boolean) => void;
}): JSX.Element {
    const planeHint = hideBelowViewPlane
        ? `Showing plane ${viewPlaneMax} and above`
        : `Showing planes 0–${viewPlaneMax}`;

    return (
        <div
            className={cn(
                "flex shrink-0 items-center gap-1.5",
                layout === "bar" && "border-l border-border pl-3",
                layout === "window" && "justify-between border-t border-border/80 bg-muted/20 px-2.5 py-2",
            )}
            title={planeHint}
        >
            <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">Plane</span>
            <div className="flex shrink-0 items-center gap-0.5">
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={viewPlaneMax <= 0}
                    aria-label="Decrease view plane"
                    onClick={() => onPlaneChange(viewPlaneMax - 1)}
                >
                    −
                </Button>
                <span className="w-5 shrink-0 text-center font-mono text-xs tabular-nums">{viewPlaneMax}</span>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={viewPlaneMax >= 3}
                    aria-label="Increase view plane"
                    onClick={() => onPlaneChange(viewPlaneMax + 1)}
                >
                    +
                </Button>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                <input
                    type="checkbox"
                    className="size-3.5 shrink-0 accent-primary"
                    checked={hideBelowViewPlane}
                    onChange={(e) => onHideBelowChange(e.target.checked)}
                />
                Hide below
            </label>
        </div>
    );
}

function CollapsibleSection({
    title,
    defaultOpen = true,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    children: ReactNode;
}): JSX.Element {
    return (
        <Collapsible defaultOpen={defaultOpen} className="group/collapsible border-b border-border/70 last:border-b-0">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold hover:bg-muted/40">
                <span>{title}</span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>{children}</CollapsibleContent>
        </Collapsible>
    );
}

/**
 * Brush controls for the docked bar or floating window under/over the 3D map.
 */
export function MapEditorBrushWorkspacePanel({
    pluginHost,
    variant = "bar",
}: MapEditorBrushWorkspacePanelProps): JSX.Element {
    const hud = useContext(MapEditorHudContext);

    const editorTool = useSyncExternalStore(
        pluginHost.subscribeEditorTool,
        pluginHost.getEditorTool,
        pluginHost.getEditorTool,
    );

    const workbenchSnap = useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );
    const [brushSize, setBrushSize] = useState<number>(pluginHost.brushSize);
    const [brushType, setBrushType] = useState<MapEditorBrushType>(pluginHost.brushType);
    const [viewPlaneMax, setViewPlaneMax] = useState<number>(pluginHost.viewPlaneMax);
    const [hideBelowViewPlane, setHideBelowViewPlane] = useState<boolean>(pluginHost.hideBelowViewPlane);

    useEffect(() => {
        setBrushType(pluginHost.brushType);
        setBrushSize(pluginHost.brushSize);
        setViewPlaneMax(pluginHost.viewPlaneMax);
        setHideBelowViewPlane(pluginHost.hideBelowViewPlane);
    }, [pluginHost]);

    useEffect(() => {
        setBrushSize(hud.brushSize);
        setBrushType(hud.brushType);
    }, [hud.brushSize, hud.brushType]);

    const setFootprintType = (t: MapEditorBrushType) => {
        pluginHost.brushType = t;
        setBrushType(t);
    };

    const setPlane = (next: number) => {
        const clamped = Math.max(0, Math.min(3, next));
        pluginHost.viewPlaneMax = clamped;
        setViewPlaneMax(clamped);
        pluginHost.notifyWorkbenchStateChanged();
    };

    const setHideBelow = (next: boolean) => {
        pluginHost.hideBelowViewPlane = next;
        setHideBelowViewPlane(next);
        pluginHost.notifyWorkbenchStateChanged();
    };

    const setRadius = (v: number) => {
        pluginHost.brushSize = v;
        setBrushSize(v);
    };

    const floodActive = hud.brushTypeActive === OVERLAY_SAME_ID_FLOOD_BRUSH_HUD;
    const toolPlugin = getBuiltinEditorToolPlugin(editorTool);
    const usesBrushControls = toolPlugin.usesBrushControls !== false;

    const visibleBrushShapes = useMemo(
        () => BUILTIN_BRUSH_TYPE_PLUGINS.filter((p) => pluginHost.isBrushShapePluginEnabled(p.id)),
        [pluginHost, workbenchSnap],
    );

    if (variant === "window") {
        return (
            <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
                <CollapsibleSection title="Brushes">
                    <div className="space-y-2.5 px-2.5 pb-2.5 pt-0.5">
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Brush type
                            </Label>
                            <BrushTypeSelect
                                floodActive={floodActive}
                                brushType={brushType}
                                visibleBrushShapes={visibleBrushShapes}
                                disabled={!usesBrushControls}
                                onChange={setFootprintType}
                                className="w-full max-w-none"
                            />
                        </div>
                        <RadiusControl
                            brushSize={brushSize}
                            disabled={!usesBrushControls}
                            onChange={setRadius}
                            layout="window"
                        />
                    </div>
                </CollapsibleSection>
                <CollapsibleSection title="Settings">
                    <MapEditorBrushWorkspaceQuickControls pluginHost={pluginHost} />
                    <MapEditorBrushWorkspaceToolSettings pluginHost={pluginHost} editorTool={editorTool} />
                </CollapsibleSection>
                <PlaneFooter
                    viewPlaneMax={viewPlaneMax}
                    hideBelowViewPlane={hideBelowViewPlane}
                    layout="window"
                    onPlaneChange={setPlane}
                    onHideBelowChange={setHideBelow}
                />
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 w-full min-w-0 items-center gap-x-3 gap-y-0 overflow-hidden px-2 py-0.5">
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="whitespace-nowrap">Brush type</span>
                <BrushTypeSelect
                    floodActive={floodActive}
                    brushType={brushType}
                    visibleBrushShapes={visibleBrushShapes}
                    disabled={!usesBrushControls}
                    onChange={setFootprintType}
                    className="max-w-[7.5rem] shrink-0"
                />
            </label>

            <RadiusControl
                brushSize={brushSize}
                disabled={!usesBrushControls}
                onChange={setRadius}
                layout="bar"
            />

            <PlaneFooter
                viewPlaneMax={viewPlaneMax}
                hideBelowViewPlane={hideBelowViewPlane}
                layout="bar"
                onPlaneChange={setPlane}
                onHideBelowChange={setHideBelow}
            />
        </div>
    );
}
