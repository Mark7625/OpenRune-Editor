import { memo, useSyncExternalStore } from "react";
import { MousePointer2 } from "lucide-react";

import { Label } from "../../../components/ui/label";
import { isCopyableObjectKind } from "./object-copy-placement";
import type { EditorToolPlugin, MapEditorPalettePanelProps } from "./builtin-plugin-types";

function ObjectSelectorToolPanelInner({ pluginHost }: MapEditorPalettePanelProps): JSX.Element {
    useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );
    const hovered = pluginHost.hoveredObject;
    const selected = pluginHost.selectedObject;
    const copyActive = pluginHost.isObjectCopyPlacementActive();
    const copyTemplate = pluginHost.getObjectCopyTemplate();
    return (
        <div className="map-editor-panel flex min-h-0 flex-1 flex-col gap-3 p-4">
            <p className="text-xs text-muted-foreground">
                Hover objects for an orange wireframe preview. Left-click to select (blue wireframe) or click empty
                space to deselect. Press R to rotate the selected object. Press C to copy it — click the map to place
                copies; Esc cancels copy mode. Customize wireframe colors in Settings → Gizmo Style → Object selector
                wireframe.
            </p>
            {copyActive && copyTemplate ? (
                <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100/90">
                    Copy placement active — click the map to place · <span className="font-medium">Esc</span> to cancel
                </div>
            ) : null}
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
                        Loc #{selected.locTypeId} · plane {selected.level} · {selected.kind} · rot{" "}
                        {selected.rotation & 3}
                    </p>
                    {isCopyableObjectKind(selected.kind) ? (
                        <p className="mt-1 text-muted-foreground">Press R to rotate · Press C to copy</p>
                    ) : null}
                    <button
                        type="button"
                        className="mt-2 text-xs text-primary underline-offset-2 hover:underline"
                        onClick={() => {
                            pluginHost.cancelObjectCopyPlacement();
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
        {
            id: "deselect-or-cancel-copy",
            name: "Deselect / cancel copy",
            description: "Cancel copy placement, or clear the current object selection.",
            defaultChords: [{ code: "Escape" }],
            shouldProcess: ({ host }) =>
                host.isObjectSelectorToolActive() &&
                (host.isObjectCopyPlacementActive() || host.selectedObject != null),
            action: ({ host }) => {
                if (host.isObjectCopyPlacementActive()) {
                    host.cancelObjectCopyPlacement();
                } else {
                    host.clearSelectedObject();
                }
                host.notifyWorkbenchStateChanged();
            },
        },
        {
            id: "rotate-selected",
            name: "Rotate selected object",
            description: "Rotate the selected object 90° on its tile.",
            defaultChords: [{ code: "KeyR" }],
            shouldProcess: ({ host }) => {
                const ref = host.selectedObject;
                return (
                    host.isObjectSelectorToolActive() &&
                    !host.isObjectCopyPlacementActive() &&
                    ref != null &&
                    isCopyableObjectKind(ref.kind)
                );
            },
            action: ({ host }) => {
                host.rotateSelectedObject();
            },
        },
        {
            id: "rotate-selected-suppress",
            name: "Rotate selected object (camera suppress)",
            description: "While held, suppress camera move-up when an object is selected.",
            defaultChords: [{ code: "KeyR" }],
            trigger: "HELD",
            shouldProcess: ({ host }) => {
                const ref = host.selectedObject;
                return (
                    host.isObjectSelectorToolActive() &&
                    !host.isObjectCopyPlacementActive() &&
                    ref != null &&
                    isCopyableObjectKind(ref.kind)
                );
            },
            action: () => true,
        },
        {
            id: "copy-object",
            name: "Copy object placement",
            description: "Stamp copies of the selected object — click tiles to place, Esc to cancel.",
            defaultChords: [{ code: "KeyC" }],
            shouldProcess: ({ host }) => {
                const ref = host.selectedObject;
                return (
                    host.isObjectSelectorToolActive() &&
                    ref != null &&
                    isCopyableObjectKind(ref.kind)
                );
            },
            action: ({ host }) => {
                host.startObjectCopyPlacement();
                host.notifyWorkbenchStateChanged();
            },
        },
        {
            id: "copy-object-suppress",
            name: "Copy object (camera suppress)",
            description: "While copy mode is active or starting copy, suppress camera move-down on C.",
            defaultChords: [{ code: "KeyC" }],
            trigger: "HELD",
            shouldProcess: ({ host }) =>
                host.isObjectSelectorToolActive() &&
                (host.isObjectCopyPlacementActive() ||
                    (host.selectedObject != null && isCopyableObjectKind(host.selectedObject.kind))),
            action: () => true,
        },
    ],
};
