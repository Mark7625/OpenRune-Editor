import type { AddPanelOptions, DockviewApi } from "dockview";

import { addMapEditorDockPanelRestoredOrDefault } from "./map-editor-dock-panel-restore";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { getEditorBottomBarModel } from "./plugins/builtins/editor-bottom-bar-model";

export const EDITOR_BOTTOM_BAR_STRIP_HEIGHT = 44;

export function configureEditorBrushWorkspacePanel(api: DockviewApi): void {
    const panel = api.getPanel("editor-brush-workspace");
    if (!panel) {
        return;
    }

    panel.group.model.header.hidden = true;

    const h = EDITOR_BOTTOM_BAR_STRIP_HEIGHT;
    const snapshot = panel.toJSON();
    if (snapshot.minimumHeight !== h || snapshot.maximumHeight !== h) {
        panel.updateFromStateModel({
            ...snapshot,
            minimumHeight: h,
            maximumHeight: h,
        });
    }

    panel.api.setSize({ height: h });
}

function ensureEditorBrushWorkspacePanel(api: DockviewApi, editor?: IEditorPluginHost): void {
    if (api.getPanel("editor-brush-workspace")) {
        return;
    }

    const editorRef = "editor-scene-editor";
    const h = EDITOR_BOTTOM_BAR_STRIP_HEIGHT;
    const defaults: AddPanelOptions = {
        id: "editor-brush-workspace",
        component: "brushWorkspace",
        title: "Brush",
        position: { referencePanel: editorRef, direction: "below" },
        initialHeight: h,
        minimumHeight: h,
        maximumHeight: h,
    };

    addMapEditorDockPanelRestoredOrDefault(api, "editor-brush-workspace", defaults, editor);
}

export function syncEditorBottomBarDockPanel(api: DockviewApi | null, editor: IEditorPluginHost | null): void {
    if (!api || !editor) {
        return;
    }

    const panel = api.getPanel("editor-brush-workspace");
    const model = getEditorBottomBarModel(editor);
    const shouldDock =
        editor.isWorkbenchUiPluginEnabled("brush_workspace") &&
        model.floatingPanelVisible &&
        model.placement === "docked";

    if (!shouldDock) {
        panel?.api.close();
        return;
    }

    ensureEditorBrushWorkspacePanel(api, editor);
    configureEditorBrushWorkspacePanel(api);
}
