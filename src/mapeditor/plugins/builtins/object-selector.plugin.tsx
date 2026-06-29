import { memo, useSyncExternalStore } from "react";
import { MousePointer2 } from "lucide-react";

import { Label } from "../../../components/ui/label";
import type { EditorToolPlugin, MapEditorPalettePanelProps } from "./builtin-plugin-types";

function ObjectSelectorToolPanelInner({ pluginHost }: MapEditorPalettePanelProps): JSX.Element {
    useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );
    const hovered = pluginHost.hoveredObject;
    const selected = pluginHost.selectedObject;
    return (
        <div className="map-editor-panel flex min-h-0 flex-1 flex-col gap-3 p-4">
            <p className="text-xs text-muted-foreground">
                Hover objects in the 3D view for an orange wireframe preview. Left-click to select (blue wireframe).
                Customize wireframe colors in Settings → Gizmo Style → Object selector wireframe.
            </p>
            {hovered ? (
                <div className="rounded-md border border-orange-500/40 bg-orange-500/10 p-2 text-xs">
                    <Label className="text-xs text-muted-foreground">Hovered object</Label>
                    <p className="mt-1 font-mono tabular-nums">
                        Loc #{hovered.locTypeId} · plane {hovered.level} · {hovered.kind}
                    </p>
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">Hover a tile with an object to preview it.</p>
            )}
            {selected ? (
                <div className="rounded-md border bg-muted/30 p-2 text-xs">
                    <Label className="text-xs text-muted-foreground">Selected object</Label>
                    <p className="mt-1 font-mono tabular-nums">
                        Loc #{selected.locTypeId} · plane {selected.level} · {selected.kind}
                    </p>
                    <button
                        type="button"
                        className="mt-2 text-xs text-primary underline-offset-2 hover:underline"
                        onClick={() => {
                            pluginHost.clearSelectedObject();
                            pluginHost.notifyWorkbenchStateChanged();
                        }}
                    >
                        Clear selection
                    </button>
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">No object selected — left-click an object in the map view.</p>
            )}
        </div>
    );
}

export const ObjectSelectorToolPanel = memo(ObjectSelectorToolPanelInner);

export const objectSelectorEditorTool: EditorToolPlugin = {
    id: "object-selector",
    name: "Object Selector",
    description: "Hover and click world objects to inspect them with wireframe highlights.",
    icon: MousePointer2,
    workspaces: [{ panelId: "editor-object-selector", activateTab: true }],
    actions: [{ kind: "select-tool", tool: "object-selector" }],
    palettePanel: ObjectSelectorToolPanel,
    usesBrushControls: false,
    keyBindings: [
        {
            id: "select-tool",
            name: "Select Object Selector tool",
            description: "Switch active tool to Object Selector.",
            defaultChords: [{ code: "Digit4" }],
            action: ({ host }) => {
                host.setEditorTool("object-selector");
            },
        },
    ],
};
