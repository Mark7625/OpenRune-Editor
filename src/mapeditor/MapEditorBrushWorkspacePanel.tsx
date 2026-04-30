import { useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
    BUILTIN_BRUSH_TYPE_PLUGINS,
    getBuiltinEditorToolPlugin,
} from "./plugins/builtins/current-plugin-layout.builtin";
import { OVERLAY_SAME_ID_FLOOD_BRUSH_HUD, OVERLAY_SAME_ID_FLOOD_UI } from "./overlay-flood-fill";
import type { MapEditorBrushType } from "./map-editor-kinds";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { MapEditorHudContext } from "./map-editor-workbench-context";

export interface MapEditorBrushWorkspacePanelProps {
    pluginHost: IEditorPluginHost;
}

/**
 * Single-row brush strip under the 3D map; truncates at the end so it does not spill into other docks.
 */
export function MapEditorBrushWorkspacePanel({ pluginHost }: MapEditorBrushWorkspacePanelProps): JSX.Element {
    const hud = useContext(MapEditorHudContext);

    const editorTool = useSyncExternalStore(
        pluginHost.subscribeEditorTool,
        pluginHost.getEditorTool,
        pluginHost.getEditorTool,
    );

    const workbenchSnap = useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );
    const [brushSize, setBrushSize] = useState<number>(pluginHost.brushSize);
    const [brushType, setBrushType] = useState<MapEditorBrushType>(pluginHost.brushType);

    useEffect(() => {
        setBrushType(pluginHost.brushType);
        setBrushSize(pluginHost.brushSize);
    }, [pluginHost]);

    useEffect(() => {
        setBrushSize(hud.brushSize);
        setBrushType(hud.brushType);
    }, [hud.brushSize, hud.brushType]);

    const setFootprintType = (t: MapEditorBrushType) => {
        pluginHost.brushType = t;
        setBrushType(t);
    };

    const floodActive = hud.brushTypeActive === OVERLAY_SAME_ID_FLOOD_BRUSH_HUD;
    const toolPlugin = getBuiltinEditorToolPlugin(editorTool);
    const brushStripHint = toolPlugin.brushStripHint;

    const visibleBrushShapes = useMemo(
        () => BUILTIN_BRUSH_TYPE_PLUGINS.filter((p) => pluginHost.isBrushShapePluginEnabled(p.id)),
        [pluginHost, workbenchSnap],
    );

    return (
        <div className="flex h-full min-h-0 w-full min-w-0 items-center gap-x-3 gap-y-0 overflow-hidden px-2 py-0.5">
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="whitespace-nowrap">Brush type</span>
                <select
                    id="dock-brush-type"
                    className="h-8 max-w-[7.5rem] shrink-0 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={floodActive ? "__flood__" : brushType}
                    disabled={floodActive}
                    onChange={(e) => {
                        const v = e.target.value as MapEditorBrushType | "__flood__";
                        if (v === "__flood__") {
                            return;
                        }
                        setFootprintType(v);
                    }}
                >
                    {floodActive ? (
                        <option value="__flood__" title={OVERLAY_SAME_ID_FLOOD_UI.description}>
                            {OVERLAY_SAME_ID_FLOOD_UI.dropdownLabel}
                        </option>
                    ) : (
                        visibleBrushShapes.map(({ id, name, description }) => (
                            <option key={id} value={id} title={description}>
                                {name}
                            </option>
                        ))
                    )}
                </select>
            </label>

            <div className="flex shrink-0 items-center gap-2">
                <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">Radius</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{brushSize}</span>
                <input
                    id="dock-brush-radius"
                    type="range"
                    min={0}
                    max={16}
                    step={1}
                    value={brushSize}
                    className="map-editor-panel-slider h-1.5 w-24 shrink-0 cursor-pointer accent-primary"
                    onChange={(e) => {
                        const v = Number(e.target.value);
                        pluginHost.brushSize = v;
                        setBrushSize(v);
                    }}
                />
            </div>

            <p
                className="min-w-0 flex-1 basis-0 truncate text-[10px] leading-tight text-muted-foreground"
                title={brushStripHint}
            >
                {brushStripHint}
            </p>
        </div>
    );
}
