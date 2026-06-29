import type { AddPanelOptions, DockviewApi } from "dockview";

import { addMapEditorDockPanelRestoredOrDefault } from "./map-editor-dock-panel-restore";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { getPaintToolsStripModel } from "./plugins/builtins/paint-tools-strip-model";

export const EDITOR_PAINT_TOOLS_STRIP_WIDTH = 40;

export function configureEditorPaintToolsPanel(api: DockviewApi): void {
    const panel = api.getPanel("editor-paint-tools");
    if (!panel) {
        return;
    }

    panel.group.model.header.hidden = true;

    const w = EDITOR_PAINT_TOOLS_STRIP_WIDTH;
    const snapshot = panel.toJSON();
    if (snapshot.minimumWidth !== w || snapshot.maximumWidth !== w) {
        panel.updateFromStateModel({
            ...snapshot,
            minimumWidth: w,
            maximumWidth: w,
        });
    }

    panel.api.setSize({ width: w });
}

function ensureEditorPaintToolsPanel(api: DockviewApi, editor?: IEditorPluginHost): void {
    if (api.getPanel("editor-paint-tools")) {
        return;
    }

    const editorRef = "editor-scene-editor";
    const defaults: AddPanelOptions = {
        id: "editor-paint-tools",
        component: "paintTools",
        title: "Tools",
        position: { referencePanel: editorRef, direction: "left" },
        initialWidth: EDITOR_PAINT_TOOLS_STRIP_WIDTH,
        minimumWidth: EDITOR_PAINT_TOOLS_STRIP_WIDTH,
        maximumWidth: EDITOR_PAINT_TOOLS_STRIP_WIDTH,
    };

    addMapEditorDockPanelRestoredOrDefault(api, "editor-paint-tools", defaults, editor);
}

export function syncPaintToolsDockPanel(api: DockviewApi | null, editor: IEditorPluginHost | null): void {
    if (!api || !editor) {
        return;
    }

    const panel = api.getPanel("editor-paint-tools");
    const model = getPaintToolsStripModel(editor);
    const shouldDock =
        editor.isWorkbenchUiPluginEnabled("paint_tools_strip") &&
        model.floatingPanelVisible &&
        model.dockSide === "left";

    if (!shouldDock) {
        panel?.api.close();
        return;
    }

    ensureEditorPaintToolsPanel(api, editor);
    configureEditorPaintToolsPanel(api);
}
