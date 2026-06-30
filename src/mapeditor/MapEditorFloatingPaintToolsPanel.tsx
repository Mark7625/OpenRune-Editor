import {
    memo,
    useCallback,
    useLayoutEffect,
    useRef,
    useSyncExternalStore,
} from "react";
import { GripHorizontal, GripVertical } from "lucide-react";

import { TooltipProvider } from "../components/ui/tooltip";
import { cn } from "../util/cn";
import { useMapEditorPanelContextMenu } from "./MapEditorPanelContextMenu";
import { buildPaintToolsContextMenuItems } from "./map-editor-panel-placement-menu";
import { mapEditorStripChrome } from "./map-editor-workbench-chrome";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { EditorPaintControlsPluginPanel } from "./plugins/builtins/paint-controls.plugin";
import {
    clampPositionInWorkbenchFloatingLayer,
    floatingLayerPositionsEqual,
    useWorkbenchFloatingLayerSize,
    useWorkbenchFloatingPanelDrag,
} from "./map-editor-workbench-floating-layer";
import { useMapEditorWorkbenchFloatingLayerRef } from "./map-editor-workbench-floating-layer-context";
import { getPaintToolsStripModel } from "./plugins/builtins/paint-tools-strip-model";

export interface MapEditorFloatingPaintToolsPanelProps {
    pluginHost: IEditorPluginHost;
}

export const MapEditorFloatingPaintToolsPanel = memo(function MapEditorFloatingPaintToolsPanel({
    pluginHost,
}: MapEditorFloatingPaintToolsPanelProps): JSX.Element | null {
    useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );

    const model = getPaintToolsStripModel(pluginHost);
    const panelRef = useRef<HTMLDivElement>(null);
    const layerRef = useMapEditorWorkbenchFloatingLayerRef();
    const layerSize = useWorkbenchFloatingLayerSize(layerRef ?? { current: null });
    const isVertical = model.orientation === "vertical";
    const GripIcon = isVertical ? GripVertical : GripHorizontal;

    const visible =
        pluginHost.isWorkbenchUiPluginEnabled("paint_tools_strip") &&
        model.floatingPanelVisible &&
        model.dockSide !== "left";

    const onPositionChange = useCallback((position: { x: number; y: number }) => model.setPosition(position), [model]);

    const { onDragPointerDown, isDraggingRef } = useWorkbenchFloatingPanelDrag({
        position: model.position,
        onPositionChange,
        panelRef,
        layerSize,
        disabled: !visible,
    });

    const getMenuItems = useCallback(() => buildPaintToolsContextMenuItems(model), [model]);
    const { onContextMenu, menuPortal } = useMapEditorPanelContextMenu(
        "map-editor-paint-tools-context-menu",
        "Paint tools",
        getMenuItems,
    );

    useLayoutEffect(() => {
        if (!visible || isDraggingRef.current || layerSize.width <= 0 || layerSize.height <= 0) {
            return;
        }
        const el = panelRef.current;
        if (!el) {
            return;
        }
        const next = clampPositionInWorkbenchFloatingLayer(
            model.position,
            el.offsetWidth,
            el.offsetHeight,
            layerSize.width,
            layerSize.height,
        );
        if (!floatingLayerPositionsEqual(next, model.position)) {
            model.setPosition(next);
        }
    }, [isDraggingRef, isVertical, layerSize.height, layerSize.width, model, visible]);

    if (!visible) {
        return null;
    }

    return (
        <TooltipProvider delayDuration={300}>
            {menuPortal}
            <div
                ref={panelRef}
                className={cn(
                    mapEditorStripChrome(),
                    "pointer-events-auto absolute z-[45] flex shadow-lg",
                    isVertical ? "flex-col items-center gap-0.5" : "flex-row items-center gap-0.5",
                )}
                style={{ left: model.position.x, top: model.position.y }}
                onContextMenu={onContextMenu}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <div
                    className={cn(
                        "flex shrink-0 cursor-move select-none text-muted-foreground",
                        isVertical
                            ? "items-center justify-center border-b border-border/70 px-0.5 py-1"
                            : "items-center justify-center border-r border-border/70 px-1 py-0.5",
                    )}
                    aria-label="Drag paint tools"
                    onPointerDown={onDragPointerDown}
                >
                    <GripIcon className="size-3.5 shrink-0" aria-hidden />
                </div>
                <EditorPaintControlsPluginPanel
                    pluginHost={pluginHost}
                    orientation={model.orientation}
                    compact
                />
            </div>
        </TooltipProvider>
    );
});
