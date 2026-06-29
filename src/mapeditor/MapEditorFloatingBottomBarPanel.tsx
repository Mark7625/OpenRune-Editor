import {
    memo,
    useCallback,
    useLayoutEffect,
    useSyncExternalStore,
} from "react";

import { TooltipProvider } from "../components/ui/tooltip";
import { MapEditorBrushWorkspacePanel } from "./MapEditorBrushWorkspacePanel";
import { MapEditorFloatingWindow } from "./MapEditorFloatingWindow";
import { useMapEditorPanelContextMenu } from "./MapEditorPanelContextMenu";
import { buildMapEditorPanelPlacementMenuItems } from "./map-editor-panel-placement-menu";
import {
    getEditorBottomBarModel,
    syncEditorBottomBarExternalWindow,
} from "./plugins/builtins/editor-bottom-bar-model";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";

export interface MapEditorFloatingBottomBarPanelProps {
    pluginHost: IEditorPluginHost;
}

export const MapEditorFloatingBottomBarPanel = memo(function MapEditorFloatingBottomBarPanel({
    pluginHost,
}: MapEditorFloatingBottomBarPanelProps): JSX.Element | null {
    useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );

    const model = getEditorBottomBarModel(pluginHost);

    const visible =
        pluginHost.isWorkbenchUiPluginEnabled("brush_workspace") &&
        model.floatingPanelVisible &&
        model.placement === "floating";

    const getMenuItems = useCallback(
        () =>
            buildMapEditorPanelPlacementMenuItems({
                title: "Brush workspace",
                current: model.placement,
                dockLabel: "Dock to bottom",
                onSelect: (placement) => model.setPlacement(placement),
            }),
        [model],
    );
    const { onContextMenu, menuPortal } = useMapEditorPanelContextMenu(
        "map-editor-bottom-bar-context-menu",
        "Brush workspace",
        getMenuItems,
    );

    useLayoutEffect(() => {
        syncEditorBottomBarExternalWindow(pluginHost);
    }, [pluginHost, model.placement, model.floatingPanelVisible]);

    if (!visible) {
        return null;
    }

    return (
        <TooltipProvider delayDuration={300}>
            <MapEditorFloatingWindow
                    title="Brush workspace"
                    visible
                    position={model.position}
                    onPositionChange={(position) => model.setPosition(position)}
                onContextMenu={onContextMenu}
                    contextMenuPortal={menuPortal}
                    autoSize
                    minWidth={288}
                >
                <MapEditorBrushWorkspacePanel pluginHost={pluginHost} variant="window" />
            </MapEditorFloatingWindow>
        </TooltipProvider>
    );
});
