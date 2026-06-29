import { memo, useCallback, useSyncExternalStore } from "react";
import type { DockviewApi } from "dockview";

import { MapEditorFloatingWindow } from "./MapEditorFloatingWindow";
import { MapEditorHistoryWorkspacePanel } from "./MapEditorHistoryWorkspacePanel";
import { MapEditorMinimap } from "./MapEditorMinimap";
import { useMapEditorPanelContextMenu } from "./MapEditorPanelContextMenu";
import { buildMapEditorPanelPlacementMenuItems } from "./map-editor-panel-placement-menu";
import {
    getMapEditorPanelDisplay,
    MAP_EDITOR_FLOATABLE_DOCK_PANELS,
    setMapEditorPanelFloatingPosition,
    setMapEditorPanelFloatingSize,
    setMapEditorPanelPlacement,
} from "./map-editor-panel-display";
import { MapEditorHudContext } from "./map-editor-workbench-context";
import { RS_TO_DEGREES } from "../rs/MathConstants";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import type { MapEditorDockPanelId } from "./plugins/builtins/builtin-plugin-types";
import {
    heightEditorTool,
    objectSelectorEditorTool,
    overlayEditorTool,
    tileFlagsEditorTool,
    underlayEditorTool,
} from "./plugins/builtins/current-plugin-runtime.builtin";
import { mapEditorDockPanelFrameClassName, mapEditorDockPanelShellClassName } from "./map-editor-workbench-chrome";
import { useContext } from "react";

function FloatingMinimapPanel({ pluginHost }: { pluginHost: IEditorPluginHost }): JSX.Element {
    const hud = useContext(MapEditorHudContext);
    return (
        <div className="flex h-full min-h-0 items-start justify-start overflow-auto p-2">
            <MapEditorMinimap
                pluginHost={pluginHost}
                yawDegrees={(2047 - hud.cameraYaw) * RS_TO_DEGREES}
                onCompassClick={() => pluginHost.camera.setYaw(0)}
            />
        </div>
    );
}

function FloatingPanelContent({
    panelId,
    pluginHost,
}: {
    panelId: MapEditorDockPanelId;
    pluginHost: IEditorPluginHost;
}): JSX.Element {
    const UnderlayPanel = underlayEditorTool.palettePanel;
    const OverlayPanel = overlayEditorTool.palettePanel;
    const HeightPanel = heightEditorTool.palettePanel;
    const ObjectPanel = objectSelectorEditorTool.palettePanel;
    const TileFlagsPanel = tileFlagsEditorTool.palettePanel;

    let body: JSX.Element;
    switch (panelId) {
        case "editor-underlays":
            body = UnderlayPanel ? <UnderlayPanel pluginHost={pluginHost} /> : <></>;
            break;
        case "editor-overlays":
            body = OverlayPanel ? <OverlayPanel pluginHost={pluginHost} /> : <></>;
            break;
        case "editor-height":
            body = HeightPanel ? <HeightPanel pluginHost={pluginHost} /> : <></>;
            break;
        case "editor-object-selector":
            body = ObjectPanel ? <ObjectPanel pluginHost={pluginHost} /> : <></>;
            break;
        case "editor-tile-flags":
            body = TileFlagsPanel ? <TileFlagsPanel pluginHost={pluginHost} /> : <></>;
            break;
        case "editor-history":
            body = <MapEditorHistoryWorkspacePanel />;
            break;
        case "editor-minimap":
            body = <FloatingMinimapPanel pluginHost={pluginHost} />;
            break;
        default:
            body = <></>;
    }

    return (
        <div className={mapEditorDockPanelFrameClassName("p-0")}>
            <div className={mapEditorDockPanelShellClassName("border-0 shadow-none")}>{body}</div>
        </div>
    );
}

const FloatingDockPanelWindow = memo(function FloatingDockPanelWindow({
    panelId,
    title,
    pluginHost,
}: {
    panelId: MapEditorDockPanelId;
    title: string;
    pluginHost: IEditorPluginHost;
}): JSX.Element | null {
    useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );
    const display = getMapEditorPanelDisplay(pluginHost, panelId);
    const panelConfig = MAP_EDITOR_FLOATABLE_DOCK_PANELS.find((row) => row.panelId === panelId);
    const getMenuItems = useCallback(
        () =>
            buildMapEditorPanelPlacementMenuItems({
                title,
                current: getMapEditorPanelDisplay(pluginHost, panelId).placement,
                canExternal: panelConfig?.canExternal,
                onSelect: (placement) => setMapEditorPanelPlacement(pluginHost, panelId, placement),
            }),
        [panelConfig?.canExternal, panelId, pluginHost, title],
    );
    const { onContextMenu, menuPortal } = useMapEditorPanelContextMenu(
        `map-editor-panel-menu-${panelId}`,
        title,
        getMenuItems,
    );

    if (display.placement !== "floating") {
        return null;
    }

    return (
        <MapEditorFloatingWindow
            title={title}
            visible
            position={display.position}
            onPositionChange={(position) => setMapEditorPanelFloatingPosition(pluginHost, panelId, position)}
            onContextMenu={onContextMenu}
            contextMenuPortal={menuPortal}
            resizable
            width={display.size.width}
            height={display.size.height}
            minWidth={260}
            minHeight={180}
            onSizeChange={(size) => setMapEditorPanelFloatingSize(pluginHost, panelId, size)}
        >
            <FloatingPanelContent panelId={panelId} pluginHost={pluginHost} />
        </MapEditorFloatingWindow>
    );
});

export interface MapEditorFloatingDockPanelsProps {
    pluginHost: IEditorPluginHost;
    dockApi: DockviewApi | null;
}

export const MapEditorFloatingDockPanels = memo(function MapEditorFloatingDockPanels({
    pluginHost,
}: MapEditorFloatingDockPanelsProps): JSX.Element {
    useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );

    return (
        <>
            {MAP_EDITOR_FLOATABLE_DOCK_PANELS.map((config) => (
                <FloatingDockPanelWindow
                    key={config.panelId}
                    panelId={config.panelId}
                    title={config.title}
                    pluginHost={pluginHost}
                />
            ))}
        </>
    );
});
