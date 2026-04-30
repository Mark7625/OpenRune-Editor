import type { MapEditorTool } from "../../map-editor-kinds";
import type { EditorToolPlugin } from "./builtin-plugin-types";
import {
    BUILTIN_BRUSH_TYPE_PLUGINS,
    getBuiltinBrushTypePlugin,
    isInBuiltinBrushShape,
} from "./brushes/brushes.registry";
import { heightEditorTool } from "./height.plugin";
import { objectEditorTool } from "./object.plugin";
import { overlayEditorTool } from "./overlay.plugin";
import { underlayEditorTool } from "./underlay.plugin";

export const BUILTIN_EDITOR_TOOL_PLUGINS: readonly EditorToolPlugin[] = [
    underlayEditorTool,
    overlayEditorTool,
    heightEditorTool,
    objectEditorTool,
];

const editorToolPluginById: Record<MapEditorTool, EditorToolPlugin> = {
    underlay: underlayEditorTool,
    overlay: overlayEditorTool,
    height: heightEditorTool,
    smooth: heightEditorTool,
    object: objectEditorTool,
};

export function getBuiltinEditorToolPlugin(tool: MapEditorTool): EditorToolPlugin {
    return editorToolPluginById[tool];
}

export { BUILTIN_BRUSH_TYPE_PLUGINS, getBuiltinBrushTypePlugin, isInBuiltinBrushShape };

export const BUILTIN_WORKBENCH_UI_PLUGINS: readonly {
    id:
        | "paint_tools_strip"
        | "brush_workspace"
        | "scene_2d"
        | "scene_live"
        | "history"
        | "minimap";
    panelId: string;
    name: string;
    description: string;
}[] = [
    {
        id: "paint_tools_strip",
        panelId: "editor-paint-tools",
        name: "Tools strip",
        description: "Left column with paint tool icons.",
    },
    {
        id: "brush_workspace",
        panelId: "editor-brush-workspace",
        name: "Brush bar",
        description: "Brush shape, radius, and hints under the map view.",
    },
    {
        id: "scene_2d",
        panelId: "editor-scene-2d",
        name: "2D view tab",
        description: "Placeholder 2D scene tab (Editor group).",
    },
    {
        id: "scene_live",
        panelId: "editor-scene-live",
        name: "Live view tab",
        description: "Placeholder Live scene tab (Editor group).",
    },
    {
        id: "history",
        panelId: "editor-history",
        name: "History",
        description: "Edit history panel below palettes.",
    },
    {
        id: "minimap",
        panelId: "editor-minimap",
        name: "Minimap",
        description: "Sector minimap tab next to History.",
    },
];
