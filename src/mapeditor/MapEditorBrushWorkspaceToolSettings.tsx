import { useMemo, useSyncExternalStore } from "react";

import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { cn } from "../util/cn";
import type { MapEditorTool } from "./map-editor-kinds";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { getBuiltinEditorToolPlugin } from "./plugins/builtins/current-plugin-layout.builtin";
import { getHeightToolModel } from "./plugins/builtins/height-tool-model";
import { HEIGHT_MODES } from "./plugins/builtins/height-brush-settings.shared";

export interface MapEditorBrushWorkspaceToolSettingsProps {
    pluginHost: IEditorPluginHost;
    editorTool: MapEditorTool;
}

function HeightBrushSettings({ pluginHost }: { pluginHost: IEditorPluginHost }): JSX.Element {
    const heightModel = getHeightToolModel(pluginHost);
    const currentMode = heightModel.mode;
    const selectedMode = useMemo(
        () => HEIGHT_MODES.find((mode) => mode.id === currentMode) ?? HEIGHT_MODES[0],
        [currentMode],
    );

    return (
        <div className="space-y-2.5 px-2 pb-1 pt-0.5">
            <div className="grid grid-cols-2 gap-1">
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
                                    className={cn(
                                        "h-7 justify-start gap-1 px-1.5 text-[10px]",
                                        selected && "ring-1 ring-primary/35",
                                    )}
                                    onClick={() => {
                                        heightModel.setMode(mode.id);
                                        pluginHost.setEditorTool("height");
                                    }}
                                >
                                    <Icon className="size-3 shrink-0" />
                                    <span className="truncate">{mode.name}</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[14rem] text-xs">
                                {mode.description}
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">{selectedMode.description}</p>
            <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Height step ({pluginHost.heightAdjustStep})
                </Label>
                <input
                    type="range"
                    min={1}
                    max={32}
                    value={pluginHost.heightAdjustStep}
                    onPointerDown={(event) => event.stopPropagation()}
                    onChange={(event) => {
                        const raw = Number(event.target.value);
                        getBuiltinEditorToolPlugin("height").data?.applyHeightStepFromRawInput?.(pluginHost, raw);
                        pluginHost.notifyWorkbenchStateChanged();
                    }}
                    className="map-editor-panel-slider h-1.5 w-full cursor-pointer accent-primary"
                />
            </div>
        </div>
    );
}

export function MapEditorBrushWorkspaceToolSettings({
    pluginHost,
    editorTool,
}: MapEditorBrushWorkspaceToolSettingsProps): JSX.Element {
    useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );

    if (editorTool === "height") {
        return <HeightBrushSettings pluginHost={pluginHost} />;
    }

    if (editorTool === "object-selector") {
        return (
            <p className="px-2 py-1 text-[11px] leading-snug text-muted-foreground">
                Selection tool — hover and click objects in the 3D view.
            </p>
        );
    }

    if (editorTool === "object-delete") {
        return (
            <p className="px-2 py-1 text-[11px] leading-snug text-muted-foreground">
                Delete tool — hold Delete and hover objects to remove them.
            </p>
        );
    }

    if (editorTool === "region-stamp") {
        return (
            <p className="px-2 py-1 text-[11px] leading-snug text-muted-foreground">
                Region stamp — drag to select · C opens copy options · live preview while placing · R rotate.
            </p>
        );
    }

    return (
        <p className="px-2 py-1 text-[11px] leading-snug text-muted-foreground">
            No additional settings for this tool.
        </p>
    );
}
