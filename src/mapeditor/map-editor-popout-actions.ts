import type { MapEditorDockPanelId } from "./plugins/builtins/builtin-plugin-types";
import {
    closeMapEditorExternalPanel,
    getMapEditorExternalHost,
} from "./map-editor-external-panel";
import {
    isMapEditorFloatablePanel,
    restoreMapEditorPanelFromExternal,
} from "./map-editor-panel-display";
import { restoreEditorBottomBarFromExternal } from "./plugins/builtins/editor-bottom-bar-model";

export type MapEditorExternalPanelId = MapEditorDockPanelId | "editor-brush-workspace";

export function restoreMapEditorExternalPopout(panelId: MapEditorExternalPanelId): void {
    const host = getMapEditorExternalHost();
    if (!host) {
        return;
    }
    if (panelId === "editor-brush-workspace") {
        restoreEditorBottomBarFromExternal(host);
        return;
    }
    if (isMapEditorFloatablePanel(panelId)) {
        restoreMapEditorPanelFromExternal(host, panelId);
    }
}

/** Restore prior dock/float placement in the main editor, then close this popout window. */
export function closeMapEditorExternalPopout(panelId: MapEditorExternalPanelId): void {
    restoreMapEditorExternalPopout(panelId);
    closeMapEditorExternalPanel(panelId);
}
