import type { AddPanelOptions, DockviewApi } from "dockview";

import { addMapEditorDockPanelRestoredOrDefault, extractDockPanelRestoreOptions } from "./map-editor-dock-panel-restore";
import { getMapEditorFloatableDockPanelDefaults } from "./map-editor-floatable-dock-defaults";
import { getMapEditorPanelDisplay, MAP_EDITOR_FLOATABLE_DOCK_PANELS } from "./map-editor-panel-display";
import type { MapEditorDockPanelId } from "./plugins/builtins/builtin-plugin-types";
import type { MapEditorTool } from "./map-editor-kinds";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { BUILTIN_WORKBENCH_UI_PLUGINS } from "./plugins/builtins/current-plugin-layout.builtin";

const ALL_MAP_EDITOR_TOOLS: readonly MapEditorTool[] = [
    "underlay",
    "overlay",
    "height",
    "tile-flags",
    "object-selector",
];

/** Dock panel for each paint tool’s palette tab. */
export const EDITOR_TOOL_DOCK_PANEL: Partial<Record<MapEditorTool, MapEditorDockPanelId>> = {
    underlay: "editor-underlays",
    overlay: "editor-overlays",
    height: "editor-height",
    "tile-flags": "editor-tile-flags",
    "object-selector": "editor-object-selector",
};

/** Extra workbench regions (not tied to a single paint tool). */
export const WORKBENCH_UI_PLUGINS = BUILTIN_WORKBENCH_UI_PLUGINS;

export type MapEditorWorkbenchUiPluginId = (typeof WORKBENCH_UI_PLUGINS)[number]["id"];

/** Closes dock panels whose plugins are turned off in `MapEditor`. */
export function syncMapEditorWorkbenchPanels(api: DockviewApi, editor: IEditorPluginHost): void {
    const layoutSnapshot = api.toJSON();
    const toClose: string[] = [];

    for (const tool of ALL_MAP_EDITOR_TOOLS) {
        if (!editor.isEditorToolPluginEnabled(tool)) {
            const pid = EDITOR_TOOL_DOCK_PANEL[tool];
            if (pid && api.getPanel(pid)) {
                toClose.push(pid);
            }
        }
    }
    for (const row of WORKBENCH_UI_PLUGINS) {
        if (row.id === "paint_tools_strip" || row.id === "brush_workspace") {
            continue;
        }
        if (!editor.isWorkbenchUiPluginEnabled(row.id)) {
            if (api.getPanel(row.panelId)) {
                toClose.push(row.panelId);
            }
        }
    }

    for (const pid of toClose) {
        const stash = extractDockPanelRestoreOptions(layoutSnapshot, pid);
        if (stash) {
            editor.saveDockPanelRestore(pid, stash);
        }
        api.getPanel(pid)?.api.close();
    }
}

/** Recreate missing panels, then remove panels disabled in editor state. */
export function refreshMapEditorWorkbench(api: DockviewApi | null, editor: IEditorPluginHost | null): void {
    if (!api || !editor) {
        return;
    }
    applyMapEditorWorkbenchLayout(api, editor);
}


function shouldEnsureFloatableDockPanel(editor: IEditorPluginHost, panelId: MapEditorDockPanelId): boolean {
    return getMapEditorPanelDisplay(editor, panelId).placement === "docked";
}

/** Ensures all default map editor dock panels exist (idempotent). Pass `editor` to close panels for disabled plugins. */
export function applyMapEditorWorkbenchLayout(api: DockviewApi, editor?: IEditorPluginHost): void {
    const anchorId = (): string => {
        const first = api.panels[0];
        return first?.id ?? "editor-scene-editor";
    };

    if (!api.getPanel("editor-scene-editor")) {
        if (api.panels.length === 0) {
            api.addPanel({
                id: "editor-scene-editor",
                component: "sceneEditor",
                title: "Editor",
            });
        } else {
            api.addPanel({
                id: "editor-scene-editor",
                component: "sceneEditor",
                title: "Editor",
                position: { referencePanel: anchorId(), direction: "left" },
            });
        }
    }

    const editorRef = "editor-scene-editor";
    const restoreSink = editor;

    const ensure = (panelId: string, defaults: AddPanelOptions) =>
        addMapEditorDockPanelRestoredOrDefault(api, panelId, defaults, restoreSink);

    const ensureFloatable = (panelId: MapEditorDockPanelId) => {
        if (editor && !shouldEnsureFloatableDockPanel(editor, panelId)) {
            return;
        }
        const defaults = getMapEditorFloatableDockPanelDefaults(panelId);
        if (defaults) {
            ensure(panelId, defaults);
        }
    };

    ensure("editor-scene-2d", {
        id: "editor-scene-2d",
        component: "scenePlaceholder",
        title: "2D",
        params: { label: "2D view" },
        position: { referencePanel: editorRef, direction: "within" },
        inactive: true,
    });
    ensure("editor-scene-live", {
        id: "editor-scene-live",
        component: "scenePlaceholder",
        title: "Live",
        params: { label: "Live view" },
        position: { referencePanel: editorRef, direction: "within" },
        inactive: true,
    });
    for (const config of MAP_EDITOR_FLOATABLE_DOCK_PANELS) {
        ensureFloatable(config.panelId);
    }

    if (editor) {
        syncMapEditorWorkbenchPanels(api, editor);
    }
}

export function resetMapEditorWorkbenchLayout(api: DockviewApi, editor?: IEditorPluginHost): void {
    editor?.clearDockPanelRestore();
    api.clear();
    applyMapEditorWorkbenchLayout(api, editor);
}
