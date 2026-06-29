import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";

import { TooltipProvider } from "../components/ui/tooltip";
import { RS_TO_DEGREES } from "../rs/MathConstants";
import { MapEditorBrushWorkspacePanel } from "./MapEditorBrushWorkspacePanel";
import { MapEditorHistoryWorkspacePanel } from "./MapEditorHistoryWorkspacePanel";
import { MapEditorMinimap } from "./MapEditorMinimap";
import { getMapEditorExternalHost } from "./map-editor-external-panel";
import { MAP_EDITOR_FLOATABLE_DOCK_PANELS } from "./map-editor-panel-display";
import { useMapEditorPanelContextMenu } from "./MapEditorPanelContextMenu";
import { buildMapEditorDockTabMenuItems } from "./map-editor-dock-tab-menu";
import type { MapEditorExternalPanelId } from "./map-editor-popout-actions";
import { MapEditorPopoutProvider, useMapEditorPopout } from "./map-editor-popout-context";
import { MapEditorPopoutTitleBar } from "./MapEditorPopoutTitleBar";
import { MapEditorHudContext, MapEditorWorkbenchContext } from "./map-editor-workbench-context";
import {
    heightEditorTool,
    objectSelectorEditorTool,
    overlayEditorTool,
    tileFlagsEditorTool,
    underlayEditorTool,
} from "./plugins/builtins/current-plugin-runtime.builtin";
import "./MapEditorContainer.css";

const POPOUT_MINIMAP_MIN_SIZE = 180;
const POPOUT_MINIMAP_MAX_SIZE = 640;

function PopoutMinimap({
    pluginHost,
}: {
    pluginHost: NonNullable<ReturnType<typeof getMapEditorExternalHost>>;
}): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewSize, setViewSize] = useState(300);
    const cameraYaw = pluginHost.camera.getYaw();

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }
        const updateSize = (): void => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            const next = Math.floor(Math.min(width, height) - 16);
            setViewSize(Math.max(POPOUT_MINIMAP_MIN_SIZE, Math.min(POPOUT_MINIMAP_MAX_SIZE, next)));
        };
        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={containerRef}
            className="flex h-full min-h-0 w-full items-center justify-center overflow-auto p-2"
        >
            <MapEditorMinimap
                pluginHost={pluginHost}
                viewSize={viewSize}
                yawDegrees={(2047 - cameraYaw) * RS_TO_DEGREES}
                onCompassClick={() => pluginHost.camera.setYaw(0)}
            />
        </div>
    );
}

function PopoutPanelBody({ panelId }: { panelId: MapEditorExternalPanelId }): JSX.Element {
    const host = getMapEditorExternalHost();
    if (!host) {
        return (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                Parent editor window is not available.
            </div>
        );
    }

    const UnderlayPanel = underlayEditorTool.palettePanel;
    const OverlayPanel = overlayEditorTool.palettePanel;
    const HeightPanel = heightEditorTool.palettePanel;
    const ObjectPanel = objectSelectorEditorTool.palettePanel;
    const TileFlagsPanel = tileFlagsEditorTool.palettePanel;

    if (panelId === "editor-brush-workspace") {
        return (
            <div className="h-full min-h-0 w-full min-w-0 overflow-auto">
                <MapEditorBrushWorkspacePanel pluginHost={host} variant="window" />
            </div>
        );
    }

    const panelBody = (() => {
        switch (panelId) {
            case "editor-underlays":
                return UnderlayPanel ? <UnderlayPanel pluginHost={host} /> : <></>;
            case "editor-overlays":
                return OverlayPanel ? <OverlayPanel pluginHost={host} /> : <></>;
            case "editor-height":
                return HeightPanel ? <HeightPanel pluginHost={host} /> : <></>;
            case "editor-object-selector":
                return ObjectPanel ? <ObjectPanel pluginHost={host} /> : <></>;
            case "editor-tile-flags":
                return TileFlagsPanel ? <TileFlagsPanel pluginHost={host} /> : <></>;
            case "editor-history":
                return <MapEditorHistoryWorkspacePanel />;
            case "editor-minimap":
                return <PopoutMinimap pluginHost={host} />;
            default:
                return <div className="p-4 text-sm text-muted-foreground">Unknown panel.</div>;
        }
    })();

    return <div className="h-full min-h-0 w-full min-w-0 overflow-hidden">{panelBody}</div>;
}

function PopoutPanelShell({
    panelId,
    title,
    children,
}: {
    panelId: MapEditorExternalPanelId;
    title: string;
    children: React.ReactNode;
}): JSX.Element {
    const host = getMapEditorExternalHost();
    useSyncExternalStore(
        host?.subscribeWorkbenchPlugins ?? (() => () => {}),
        host?.getWorkbenchPluginsStateSnapshot ?? (() => ""),
        host?.getWorkbenchPluginsStateSnapshot ?? (() => ""),
    );

    const getMenuItems = useCallback(() => {
        if (!host) {
            return [];
        }
        return buildMapEditorDockTabMenuItems(host, panelId, title);
    }, [host, panelId, title]);

    const { onContextMenu, menuPortal } = useMapEditorPanelContextMenu(
        `map-editor-popout-menu-${panelId}`,
        title,
        getMenuItems,
    );

    return (
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden" onContextMenu={onContextMenu}>
            {menuPortal}
            {children}
        </div>
    );
}

function PopoutChrome({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}): JSX.Element {
    const popout = useMapEditorPopout();

    return (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
            <MapEditorPopoutTitleBar title={title} onClose={() => popout?.close()} />
            {children}
        </div>
    );
}

export function MapEditorPopoutPage(): JSX.Element {
    const [searchParams] = useSearchParams();
    const panelId = (searchParams.get("panel") ?? "editor-brush-workspace") as MapEditorExternalPanelId;
    const host = getMapEditorExternalHost();

    const title = useMemo(() => {
        if (panelId === "editor-brush-workspace") {
            return "Brush workspace";
        }
        return MAP_EDITOR_FLOATABLE_DOCK_PANELS.find((row) => row.panelId === panelId)?.title ?? "Panel";
    }, [panelId]);

    useEffect(() => {
        document.documentElement.classList.add("dark");
        document.body.classList.add("map-editor-popout-body");
        return () => {
            document.body.classList.remove("map-editor-popout-body");
        };
    }, []);

    useEffect(() => {
        document.title = `${title} – OpenRune Editor`;
    }, [title]);

    if (!host) {
        return (
            <div className="flex h-screen items-center justify-center bg-background p-6 text-sm text-muted-foreground">
                Open this window from the map editor.
            </div>
        );
    }

    return (
        <MapEditorWorkbenchContext.Provider value={host}>
            <MapEditorHudContext.Provider
                value={{
                    fps: "",
                    debugText: "",
                    cameraYaw: host.camera.getYaw(),
                    brushSize: host.brushSize,
                    brushType: host.brushType,
                    brushTypeActive: host.brushType,
                }}
            >
                <MapEditorPopoutProvider panelId={panelId}>
                    <TooltipProvider delayDuration={300}>
                        <div className="map-editor-popout-root flex h-screen min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background">
                            <PopoutChrome title={title}>
                                <PopoutPanelShell panelId={panelId} title={title}>
                                    <PopoutPanelBody panelId={panelId} />
                                </PopoutPanelShell>
                            </PopoutChrome>
                        </div>
                    </TooltipProvider>
                </MapEditorPopoutProvider>
            </MapEditorHudContext.Provider>
        </MapEditorWorkbenchContext.Provider>
    );
}
