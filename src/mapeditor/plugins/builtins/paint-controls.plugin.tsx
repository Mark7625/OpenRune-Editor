import { useMemo, useSyncExternalStore } from "react";

import { Button } from "../../../components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../components/ui/tooltip";
import { BUILTIN_EDITOR_TOOL_PLUGINS } from "./current-plugin-layout.builtin";
import type { IEditorPluginHost } from "../editor-plugin-host";

export interface EditorPaintControlsPluginPanelProps {
    pluginHost: IEditorPluginHost;
}

/** Builtin plugin-owned tool strip: icons only. */
export function EditorPaintControlsPluginPanel({
    pluginHost,
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

    return (
        <TooltipProvider delayDuration={300}>
            <nav className="flex h-full min-h-0 flex-col items-center gap-1.5 py-2" aria-label="Map paint tools">
                {visibleTools.map(({ id, name, description, icon: Icon }) => (
                    <Tooltip key={id}>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                size="icon"
                                variant={editorTool === id ? "default" : "outline"}
                                className="h-9 w-9 shrink-0"
                                onClick={() => pluginHost.setEditorTool(id)}
                                aria-label={name}
                                aria-pressed={editorTool === id}
                            >
                                <Icon className="size-4" aria-hidden />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs text-xs leading-snug">
                            <span className="font-medium text-foreground">{name}</span>
                            <span className="mt-1 block text-muted-foreground">{description}</span>
                        </TooltipContent>
                    </Tooltip>
                ))}
            </nav>
        </TooltipProvider>
    );
}
