import type { AddPanelOptions, DockviewApi } from "dockview";

import { addMapEditorDockPanelRestoredOrDefault } from "./map-editor-dock-panel-restore";
import type { MapEditorDockPanelId } from "./plugins/builtins/builtin-plugin-types";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";

const EDITOR_PALETTE_COLUMN_INITIAL_WIDTH = 380;
const EDITOR_HISTORY_MINIMAP_INITIAL_HEIGHT = 380;
const EDITOR_SCENE_PANEL_ID = "editor-scene-editor";

export function getMapEditorFloatableDockPanelDefaults(panelId: MapEditorDockPanelId): AddPanelOptions | null {
    switch (panelId) {
        case "editor-underlays":
            return {
                id: "editor-underlays",
                component: "palette",
                title: "Underlays",
                position: { referencePanel: EDITOR_SCENE_PANEL_ID, direction: "right" },
                initialWidth: EDITOR_PALETTE_COLUMN_INITIAL_WIDTH,
            };
        case "editor-overlays":
            return {
                id: "editor-overlays",
                component: "overlayPalette",
                title: "Overlays",
                position: { referencePanel: "editor-underlays", direction: "within" },
                inactive: true,
            };
        case "editor-height":
            return {
                id: "editor-height",
                component: "heightPalette",
                title: "Height",
                position: { referencePanel: "editor-underlays", direction: "within" },
                inactive: true,
            };
        case "editor-object-selector":
            return {
                id: "editor-object-selector",
                component: "objectSelectorPalette",
                title: "Objects",
                position: { referencePanel: "editor-underlays", direction: "within" },
                inactive: true,
            };
        case "editor-tile-flags":
            return {
                id: "editor-tile-flags",
                component: "tileFlagsPalette",
                title: "Tile flags",
                position: { referencePanel: "editor-underlays", direction: "within" },
                inactive: true,
            };
        case "editor-history":
            return {
                id: "editor-history",
                component: "historyWorkspace",
                title: "History",
                position: { referencePanel: "editor-underlays", direction: "below" },
                initialHeight: EDITOR_HISTORY_MINIMAP_INITIAL_HEIGHT,
            };
        case "editor-minimap":
            return {
                id: "editor-minimap",
                component: "minimapWorkspace",
                title: "Minimap",
                position: { referencePanel: "editor-history", direction: "within" },
                inactive: true,
            };
        default:
            return null;
    }
}

export function restoreMapEditorFloatableDockPanel(
    api: DockviewApi,
    host: IEditorPluginHost,
    panelId: MapEditorDockPanelId,
): void {
    if (api.getPanel(panelId)) {
        return;
    }
    const defaults = getMapEditorFloatableDockPanelDefaults(panelId);
    if (!defaults) {
        return;
    }
    addMapEditorDockPanelRestoredOrDefault(api, panelId, defaults, host);
}
