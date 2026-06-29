import { useMemo, useSyncExternalStore } from "react";

import { Button } from "../../../components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../components/ui/tooltip";
import { cn } from "../../../util/cn";
import { BUILTIN_EDITOR_TOOL_PLUGINS } from "./current-plugin-layout.builtin";
import type { PaintToolsStripOrientation } from "./paint-tools-strip-model";
import type { IEditorPluginHost } from "../editor-plugin-host";

export interface EditorPaintControlsPluginPanelProps {
    pluginHost: IEditorPluginHost;
    orientation?: PaintToolsStripOrientation;
    compact?: boolean;
    scrollable?: boolean;
}

/** Builtin plugin-owned tool strip: icons only. */
export function EditorPaintControlsPluginPanel({
    pluginHost,
    orientation = "vertical",
    compact = false,
    scrollable = true,
}: EditorPaintControlsPluginPanelProps): JSX.Element {
    const editorTool = useSyncExternalStore(
        pluginHost.subscribeEditorTool,
        pluginHost.getEditorTool,
        pluginHost.getEditorTool,
    );

    const pluginsSnapshot = useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );

    const visibleTools = useMemo(
        () => BUILTIN_EDITOR_TOOL_PLUGINS.filter((p) => pluginHost.isEditorToolPluginEnabled(p.id)),
        [pluginHost, pluginsSnapshot],
    );

    const isVertical = orientation === "vertical";
    const tooltipSide = isVertical ? "right" : "bottom";

    return (
        <TooltipProvider delayDuration={300}>
            <nav
                className={cn(
                    "flex",
                    compact
                        ? "gap-0.5"
                        : cn("min-h-0 flex-1 gap-1.5 p-2", scrollable ? "overflow-auto" : "overflow-hidden"),
                    isVertical
                        ? compact
                            ? "flex-col items-center"
                            : "min-h-0 flex-1 flex-col items-center"
                        : compact
                          ? "flex-row items-center"
                          : "min-h-0 flex-1 flex-row flex-wrap items-center justify-center",
                )}
                aria-label="Map paint tools"
            >
                {visibleTools.map(({ id, name, description, icon: Icon }) => (
                    <Tooltip key={id}>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                size="icon"
                                variant={editorTool === id ? "default" : "outline"}
                                className={cn("shrink-0", compact ? "size-8" : "h-9 w-9")}
                                onClick={() => pluginHost.setEditorTool(id)}
                                aria-label={name}
                                aria-pressed={editorTool === id}
                            >
                                <Icon className="size-4" aria-hidden />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side={tooltipSide} className="max-w-xs text-xs leading-snug">
                            <span className="font-medium text-foreground">{name}</span>
                            <span className="mt-1 block text-muted-foreground">{description}</span>
                        </TooltipContent>
                    </Tooltip>
                ))}
            </nav>
        </TooltipProvider>
    );
}
