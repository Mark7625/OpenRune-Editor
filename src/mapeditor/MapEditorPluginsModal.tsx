import { useSyncExternalStore } from "react";
import type { DockviewApi } from "dockview";
import { toast } from "sonner";

import { Button } from "../components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog";
import {
    BUILTIN_BRUSH_TYPE_PLUGINS,
    BUILTIN_EDITOR_TOOL_PLUGINS,
    BUILTIN_WORKBENCH_UI_PLUGINS,
} from "./plugins/builtins/current-plugin-layout.builtin";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { refreshMapEditorWorkbench } from "./map-editor-workbench-layout";

export interface MapEditorPluginsModalProps {
    pluginHost: IEditorPluginHost;
    dockApi: DockviewApi | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function PluginToggleRow({
    title,
    description,
    checked,
    disabled,
    onCheckedChange,
}: {
    title: string;
    description: string;
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (next: boolean) => void;
}): JSX.Element {
    return (
        <div className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-none">{title}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{description}</p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={title}
                disabled={disabled}
                onClick={() => onCheckedChange(!checked)}
                className={[
                    "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
                    checked ? "border-primary bg-primary" : "border-input bg-muted",
                    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                ].join(" ")}
            >
                <span
                    className={[
                        "inline-block size-4 rounded-full bg-background shadow-sm transition-transform",
                        checked ? "translate-x-[0.9rem]" : "translate-x-[0.1rem]",
                    ].join(" ")}
                />
            </button>
        </div>
    );
}

export function MapEditorPluginsModal({
    pluginHost,
    dockApi,
    open,
    onOpenChange,
}: MapEditorPluginsModalProps): JSX.Element {
    useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );

    const toolsOnCount = BUILTIN_EDITOR_TOOL_PLUGINS.filter((p) => pluginHost.isEditorToolPluginEnabled(p.id)).length;
    const brushOnCount = BUILTIN_BRUSH_TYPE_PLUGINS.filter((p) => pluginHost.isBrushShapePluginEnabled(p.id)).length;

    const afterChange = () => {
        refreshMapEditorWorkbench(dockApi, pluginHost);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:w-full">
                <DialogHeader className="shrink-0 border-b border-border px-6 py-4 text-left">
                    <DialogTitle>Plugins</DialogTitle>
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-2">
                    {BUILTIN_EDITOR_TOOL_PLUGINS.map(({ id, name, description }) => {
                        const enabled = pluginHost.isEditorToolPluginEnabled(id);
                        const onlyOnePaintTool = toolsOnCount <= 1;
                        return (
                            <PluginToggleRow
                                key={id}
                                title={name}
                                description={description}
                                checked={enabled}
                                disabled={enabled && onlyOnePaintTool}
                                onCheckedChange={(next) => {
                                    const ok = pluginHost.setEditorToolPluginEnabled(id, next);
                                    if (!ok) {
                                        toast.error("Unable to update tool plugin state.");
                                        return;
                                    }
                                    afterChange();
                                }}
                            />
                        );
                    })}
                    {BUILTIN_BRUSH_TYPE_PLUGINS.map(({ id, name, description }) => {
                        const enabled = pluginHost.isBrushShapePluginEnabled(id);
                        const onlyOneShape = brushOnCount <= 1;
                        return (
                            <PluginToggleRow
                                key={id}
                                title={name}
                                description={description}
                                checked={enabled}
                                disabled={enabled && onlyOneShape}
                                onCheckedChange={(next) => {
                                    const ok = pluginHost.setBrushShapePluginEnabled(id, next);
                                    if (!ok) {
                                        toast.error("Keep at least one brush type plugin enabled.");
                                        return;
                                    }
                                    afterChange();
                                }}
                            />
                        );
                    })}
                    {BUILTIN_WORKBENCH_UI_PLUGINS.map(({ id, name, description }) => (
                        <PluginToggleRow
                            key={id}
                            title={name}
                            description={description}
                            checked={pluginHost.isWorkbenchUiPluginEnabled(id)}
                            onCheckedChange={(next) => {
                                pluginHost.setWorkbenchUiPluginEnabled(id, next);
                                afterChange();
                            }}
                        />
                    ))}
                </div>

                <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
