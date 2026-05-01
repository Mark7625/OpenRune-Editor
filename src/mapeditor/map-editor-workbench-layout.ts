import type { AddPanelOptions, DockviewApi } from "dockview";

import { addMapEditorDockPanelRestoredOrDefault, extractDockPanelRestoreOptions } from "./map-editor-dock-panel-restore";
import type { MapEditorDockPanelId } from "./plugins/builtins/builtin-plugin-types";
import type { MapEditorTool } from "./map-editor-kinds";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { BUILTIN_WORKBENCH_UI_PLUGINS } from "./plugins/builtins/current-plugin-layout.builtin";

const ALL_MAP_EDITOR_TOOLS: readonly MapEditorTool[] = ["underlay", "overlay", "height"];

/** Dock panel for each paint tool’s palette tab. */
export const EDITOR_TOOL_DOCK_PANEL: Partial<Record<MapEditorTool, MapEditorDockPanelId>> = {
    underlay: "editor-underlays",
    overlay: "editor-overlays",
    height: "editor-height",
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

/**
 * Fixed slim strip: icon column (~36px) + tight horizontal padding. Dockview’s default
 * group minimum is 100px unless the panel sets its own bounds; we also cap max width so
 * the strip cannot be widened by dragging splitters.
 */
const EDITOR_PAINT_TOOLS_STRIP_WIDTH = 40;

/** Single-row brush controls; fixed height so the strip cannot be resized vertically. */
const EDITOR_BRUSH_STRIP_HEIGHT = 42;

/** Right column: Underlays / Overlays / Workspace tabs (shared width). */
const EDITOR_PALETTE_COLUMN_INITIAL_WIDTH = 380;

/** Strip below palettes: History | Minimap tabs (shared height). */
const EDITOR_HISTORY_MINIMAP_INITIAL_HEIGHT = 380;

/** Icon-only tools column: no tab header, fixed width (dockview cannot resize this sash). */
function configureEditorPaintToolsPanel(api: DockviewApi): void {
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

/** Inline brush row: no tab header, fixed height. */
function configureEditorBrushWorkspacePanel(api: DockviewApi): void {
    const panel = api.getPanel("editor-brush-workspace");
    if (!panel) {
        return;
    }

    panel.group.model.header.hidden = true;

    const h = EDITOR_BRUSH_STRIP_HEIGHT;
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
    ensure("editor-underlays", {
        id: "editor-underlays",
        component: "palette",
        title: "Underlays",
        position: { referencePanel: editorRef, direction: "right" },
        initialWidth: EDITOR_PALETTE_COLUMN_INITIAL_WIDTH,
    });
    ensure("editor-overlays", {
        id: "editor-overlays",
        component: "overlayPalette",
        title: "Overlays",
        position: { referencePanel: "editor-underlays", direction: "within" },
        inactive: true,
    });
    ensure("editor-height", {
        id: "editor-height",
        component: "heightPalette",
        title: "Height",
        position: { referencePanel: "editor-underlays", direction: "within" },
        inactive: true,
    });
    ensure("editor-paint-tools", {
        id: "editor-paint-tools",
        component: "paintTools",
        title: "Tools",
        position: { referencePanel: editorRef, direction: "left" },
        initialWidth: EDITOR_PAINT_TOOLS_STRIP_WIDTH,
        minimumWidth: EDITOR_PAINT_TOOLS_STRIP_WIDTH,
        maximumWidth: EDITOR_PAINT_TOOLS_STRIP_WIDTH,
    });
    ensure("editor-brush-workspace", {
        id: "editor-brush-workspace",
        component: "brushWorkspace",
        title: "Brush",
        position: { referencePanel: editorRef, direction: "below" },
        initialHeight: EDITOR_BRUSH_STRIP_HEIGHT,
        minimumHeight: EDITOR_BRUSH_STRIP_HEIGHT,
        maximumHeight: EDITOR_BRUSH_STRIP_HEIGHT,
    });
    ensure("editor-history", {
        id: "editor-history",
        component: "historyWorkspace",
        title: "History",
        position: { referencePanel: "editor-underlays", direction: "below" },
        initialHeight: EDITOR_HISTORY_MINIMAP_INITIAL_HEIGHT,
    });
    ensure("editor-minimap", {
        id: "editor-minimap",
        component: "minimapWorkspace",
        title: "Minimap",
        position: { referencePanel: "editor-history", direction: "within" },
        inactive: true,
    });

    configureEditorPaintToolsPanel(api);
    configureEditorBrushWorkspacePanel(api);

    if (editor) {
        syncMapEditorWorkbenchPanels(api, editor);
    }
}

export function resetMapEditorWorkbenchLayout(api: DockviewApi, editor?: IEditorPluginHost): void {
    editor?.clearDockPanelRestore();
    api.clear();
    applyMapEditorWorkbenchLayout(api, editor);
}
