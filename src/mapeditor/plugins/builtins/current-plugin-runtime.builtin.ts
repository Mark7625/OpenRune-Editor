import type { DockviewApi } from "dockview";

import type {
    EditorHeaderPlugin,
    EditorToolWorkspaceBinding,
    EditorViewFloatingNavPlugin,
    EditorViewStickyNavPlugin,
    MapEditorDockPanelId,
} from "./builtin-plugin-types";
import { EditorLayoutRegion } from "./builtin-plugin-types";
import { quickControlsNavPlugin } from "./editor-view-nav.plugin";
import { heightEditorTool } from "./height.plugin";
import { overlayEditorTool } from "./overlay.plugin";
import { underlayEditorTool } from "./underlay.plugin";
import type { IEditorPluginHost } from "../editor-plugin-host";
import type { MapEditorTool } from "../../map-editor-kinds";
import { getBuiltinEditorToolPlugin } from "./current-plugin-layout.builtin";

export { heightEditorTool, overlayEditorTool, underlayEditorTool };

export const BUILTIN_EDITOR_VIEW_STICKY_NAV_PLUGINS: readonly EditorViewStickyNavPlugin[] = [
    quickControlsNavPlugin,
];
export const BUILTIN_EDITOR_VIEW_FLOATING_NAV_PLUGINS: readonly EditorViewFloatingNavPlugin[] = [];
export const BUILTIN_EDITOR_HEADER_PLUGINS: readonly EditorHeaderPlugin[] = [];

function resolveWorkspaceBindingPanelId(binding: EditorToolWorkspaceBinding): MapEditorDockPanelId | null {
    if (binding.panelId) {
        return binding.panelId;
    }
    if (!binding.target) {
        return null;
    }
    const { region } = binding.target;
    switch (region) {
        case EditorLayoutRegion.LEFT_TOOL_PANEL:
            return "editor-paint-tools";
        case EditorLayoutRegion.BOTTOM:
            return "editor-brush-workspace";
        case EditorLayoutRegion.MAP_VIEW_BAR:
            return "editor-scene-editor";
        case EditorLayoutRegion.SETTINGS_BAR:
            return "editor-underlays";
        default:
            return "editor-underlays";
    }
}

export function activateBuiltinEditorToolWorkspaces(
    api: DockviewApi | null,
    host: IEditorPluginHost,
    tool: MapEditorTool,
): void {
    if (!api) {
        return;
    }
    const plugin = getBuiltinEditorToolPlugin(tool);
    for (const w of plugin.workspaces ?? []) {
        if (w.activateTab === false) {
            continue;
        }
        const panelId = resolveWorkspaceBindingPanelId(w);
        if (!panelId) {
            continue;
        }
        const panel = api.getPanel(panelId);
        panel?.api.setActive();
    }
    plugin.onActivated?.({ host, dockApi: api });
}
