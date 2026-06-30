import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
    DockviewReact,
    DockviewReadyEvent,
    type DockviewApi,
    IDockviewPanelProps,
    themeDark,
} from "dockview";
import "dockview/dist/styles/dockview.css";

import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { RendererCanvas } from "../components/renderer/RendererCanvas";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { RS_TO_DEGREES } from "../rs/MathConstants";
import { MapEditorMinimap } from "./MapEditorMinimap";
import { MapEditorBottomBarStrip } from "./MapEditorBottomBarStrip";
import { MapEditorFloatingBottomBarPanel } from "./MapEditorFloatingBottomBarPanel";
import { MapEditorFloatingDockPanels } from "./MapEditorFloatingDockPanels";
import { MapEditorFloatingPaintToolsPanel } from "./MapEditorFloatingPaintToolsPanel";
import { MapEditorHistoryWorkspacePanel } from "./MapEditorHistoryWorkspacePanel";
import { MapEditorWorkbenchFloatingLayer } from "./MapEditorWorkbenchFloatingLayer";
import { MapEditorDockPanelPlacementFrame } from "./MapEditorDockPanelPlacementFrame";
import { MapEditorDockTab } from "./MapEditorDockTab";
import { syncMapEditorFloatableDockPanels } from "./map-editor-panel-display";
import { syncEditorBottomBarDockPanel } from "./editor-bottom-bar-dock-sync";
import {
    BUILTIN_EDITOR_VIEW_FLOATING_NAV_PLUGINS,
    BUILTIN_EDITOR_VIEW_STICKY_NAV_PLUGINS,
    heightEditorTool,
    objectSelectorEditorTool,
    objectDeleteEditorTool,
    regionStampEditorTool,
    overlayEditorTool,
    tileFlagsEditorTool,
    underlayEditorTool,
} from "./plugins/builtins/current-plugin-runtime.builtin";
import {
    MapEditorHudContext,
    MapEditorWorkbenchContext,
    type MapEditorHudState,
} from "./map-editor-workbench-context";
import { getActivePaintModifiers } from "./editor-tool-input";
import { applyMapEditorWorkbenchLayout } from "./map-editor-workbench-layout";
import { OVERLAY_SAME_ID_FLOOD_BRUSH_HUD } from "./overlay-flood-fill";
import { syncPaintToolsDockPanel } from "./paint-tools-strip-dock-sync";
import { shouldQuickControlsUseStickyNav } from "./map-editor-quick-controls";
import { SquareArrowOutUpRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import { useMapEditorPanelContextMenu } from "./MapEditorPanelContextMenu";
import { buildPaintToolsContextMenuItems } from "./map-editor-panel-placement-menu";
import { getPaintToolsStripModel } from "./plugins/builtins/paint-tools-strip-model";
import { syncEditorBottomBarExternalWindow, getEditorBottomBarModel } from "./plugins/builtins/editor-bottom-bar-model";
import { EditorPaintControlsPluginPanel } from "./plugins/builtins/paint-controls.plugin";
import { SandboxTerrainWorkspacePanel } from "./SandboxTerrainWorkspacePanel";
import type { EditorToolPlugin, MapEditorDockPanelId } from "./plugins/builtins/builtin-plugin-types";
import { cn } from "../util/cn";
import {
    mapEditorDockPanelFrameClassName,
    mapEditorDockPanelShellClassName,
} from "./map-editor-workbench-chrome";
import "./MapEditorWorkbenchDock.css";

function MapEditorRuntimeLoop({
    pluginHost,
    children,
}: {
    pluginHost: IEditorPluginHost;
    children: React.ReactNode;
}): JSX.Element {
    const [hud, setHud] = useState<MapEditorHudState>(() => ({
        fps: "",
        debugText: "",
        cameraYaw: pluginHost.camera.getYaw(),
        brushSize: pluginHost.brushSize,
        brushType: pluginHost.brushType,
        brushTypeActive: pluginHost.brushType,
    }));
    const hudThrottleRef = useRef(0);

    useEffect(() => {
        const requestRef = { current: 0 };
        const animate = (time: DOMHighResTimeStamp) => {
            const floodHeld = getActivePaintModifiers(pluginHost).overlaySameIdFloodWithControlAlt;
            const brushTypeActive = floodHeld ? OVERLAY_SAME_ID_FLOOD_BRUSH_HUD : pluginHost.brushType;

            setHud((prev) => {
                const nextFps =
                    time - hudThrottleRef.current >= 120
                        ? (() => {
                              hudThrottleRef.current = time;
                              return Math.round(pluginHost.renderer.stats.frameTimeFps).toString();
                          })()
                        : prev.fps;
                return {
                    fps: nextFps,
                    debugText: pluginHost.debugText ?? "",
                    cameraYaw: pluginHost.camera.getYaw(),
                    brushSize: pluginHost.brushSize,
                    brushType: pluginHost.brushType,
                    brushTypeActive,
                };
            });

            requestRef.current = requestAnimationFrame(animate);
        };
        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current);
    }, [pluginHost]);

    return <MapEditorHudContext.Provider value={hud}>{children}</MapEditorHudContext.Provider>;
}

/** Main 3D view: normal RendererCanvas lifecycle (single source of truth for WebGL). */
const EditorScenePanel = memo(function EditorScenePanel(_props: IDockviewPanelProps): JSX.Element {
    const pluginHost = useContext(MapEditorWorkbenchContext);
    const hud = useContext(MapEditorHudContext);
    if (!pluginHost) {
        return <></>;
    }

    useEffect(() => {
        pluginHost.setViewMode("editor");
    }, [pluginHost]);

    return (
        <div className="map-editor-viewport-panel relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-background">
            <EditorViewStickyNav pluginHost={pluginHost} />
            <EditorViewFloatingNav pluginHost={pluginHost} />
            <div className="map-editor-viewport-canvas-host relative h-full min-h-0 overflow-hidden">
                <div className="map-editor-hud">
                    <div className="fps-counter content-text">{hud.fps}</div>
                    <div className="fps-counter content-text">{hud.debugText}</div>
                </div>
                <RendererCanvas renderer={pluginHost.renderer} />
            </div>
        </div>
    );
});

const EditorViewStickyNav = memo(function EditorViewStickyNav({
    pluginHost,
}: {
    pluginHost: IEditorPluginHost;
}): JSX.Element {
    useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );
    const showQuickControlsInNav = shouldQuickControlsUseStickyNav(pluginHost);
    const navPlugins = useMemo(() => {
        return [...(BUILTIN_EDITOR_VIEW_STICKY_NAV_PLUGINS ?? [])]
            .filter((plugin) => plugin.id !== "quick-controls" || showQuickControlsInNav)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }, [showQuickControlsInNav]);
    if (navPlugins.length === 0) {
        return <></>;
    }
    return (
        <div className="pointer-events-none absolute right-2 top-2 z-20">
            <TooltipProvider delayDuration={250}>
                <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-border/70 bg-card/90 p-0.5 backdrop-blur-sm">
                    {navPlugins.map((plugin) => {
                        const Component = plugin.component;
                        return <Component key={plugin.id} pluginHost={pluginHost} />;
                    })}
                </div>
            </TooltipProvider>
        </div>
    );
});

const EditorViewFloatingNav = memo(function EditorViewFloatingNav({
    pluginHost,
}: {
    pluginHost: IEditorPluginHost;
}): JSX.Element {
    useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );
    const navPlugins = useMemo(() => {
        return [...(BUILTIN_EDITOR_VIEW_FLOATING_NAV_PLUGINS ?? [])].sort(
            (a, b) => (a.order ?? 0) - (b.order ?? 0),
        );
    }, []);
    if (navPlugins.length === 0) {
        return <></>;
    }
    return (
        <div className="pointer-events-none absolute right-2 top-10 z-20">
            <TooltipProvider delayDuration={250}>
                <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-border/80 bg-card/95 p-1 shadow-md backdrop-blur-sm">
                    {navPlugins.map((plugin) => {
                        const Component = plugin.component;
                        return <Component key={plugin.id} pluginHost={pluginHost} />;
                    })}
                </div>
            </TooltipProvider>
        </div>
    );
});

const PlaceholderScenePanel = memo(function PlaceholderScenePanel(
    props: IDockviewPanelProps<{ label: string }>,
): JSX.Element {
    const label = props.params?.label ?? "View";
    return (
        <div className="flex h-full min-h-0 items-center justify-center bg-muted/10 p-4">
            <Card className="max-w-sm border-dashed">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{label}</CardTitle>
                        <Badge variant="secondary">Soon</Badge>
                    </div>
                    <CardDescription>Use the Editor tab for the 3D scene for now.</CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
});

function createToolPaletteDockPanel(
    panelId: MapEditorDockPanelId,
    title: string,
    Panel: NonNullable<EditorToolPlugin["palettePanel"]>,
) {
    return memo(function ToolPaletteDockPanel(_props: IDockviewPanelProps): JSX.Element {
        const pluginHost = useContext(MapEditorWorkbenchContext);
        if (!pluginHost) {
            return <></>;
        }
        return (
            <MapEditorDockPanelPlacementFrame>
                <Panel pluginHost={pluginHost} />
            </MapEditorDockPanelPlacementFrame>
        );
    });
}

const EditorPalettePanel = createToolPaletteDockPanel("editor-underlays", "Underlays", underlayEditorTool.palettePanel!);
const EditorOverlayPalettePanel = createToolPaletteDockPanel("editor-overlays", "Overlays", overlayEditorTool.palettePanel!);
const EditorHeightPalettePanel = createToolPaletteDockPanel("editor-height", "Height", heightEditorTool.palettePanel!);
const EditorObjectSelectorPalettePanel = createToolPaletteDockPanel(
    "editor-object-selector",
    "Objects",
    objectSelectorEditorTool.palettePanel!,
);
const EditorObjectDeletePalettePanel = createToolPaletteDockPanel(
    "editor-object-delete",
    "Delete objects",
    objectDeleteEditorTool.palettePanel!,
);
const EditorRegionStampPalettePanel = createToolPaletteDockPanel(
    "editor-region-stamp",
    "Region stamp",
    regionStampEditorTool.palettePanel!,
);
const EditorTileFlagsPalettePanel = createToolPaletteDockPanel(
    "editor-tile-flags",
    "Tile flags",
    tileFlagsEditorTool.palettePanel!,
);
const EditorSmoothPalettePanel = EditorHeightPalettePanel;

const EditorPaintToolsPanel = memo(function EditorPaintToolsPanel(_props: IDockviewPanelProps): JSX.Element {
    const pluginHost = useContext(MapEditorWorkbenchContext);
    const emptySubscribe = useCallback(() => () => {}, []);
    const emptySnapshot = useCallback((): string => "", []);
    useSyncExternalStore(
        pluginHost?.subscribeWorkbenchPlugins ?? emptySubscribe,
        pluginHost?.getWorkbenchPluginsStateSnapshot ?? emptySnapshot,
        pluginHost?.getWorkbenchPluginsStateSnapshot ?? emptySnapshot,
    );
    if (!pluginHost) {
        return (
            <div className="flex h-full min-h-0 items-center justify-center p-3 text-center text-xs text-muted-foreground">
                Map editor is not ready.
            </div>
        );
    }

    const model = getPaintToolsStripModel(pluginHost);
    const getMenuItems = useCallback(() => buildPaintToolsContextMenuItems(model), [model]);
    const { onContextMenu, menuPortal } = useMapEditorPanelContextMenu(
        "map-editor-dock-paint-tools-menu",
        "Paint tools",
        getMenuItems,
    );

    return (
        <TooltipProvider delayDuration={300}>
            <div
                className={mapEditorDockPanelFrameClassName("items-center justify-start p-1")}
                onContextMenu={onContextMenu}
            >
                {menuPortal}
                <div className="flex h-full min-h-0 w-full flex-col items-center gap-0.5 overflow-hidden">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 shrink-0"
                                aria-label="Undock paint tools"
                                onClick={() => model.setDockSide("none")}
                            >
                                <SquareArrowOutUpRight className="size-3.5" aria-hidden />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs">
                            Undock (right-click for more)
                        </TooltipContent>
                    </Tooltip>
                    <EditorPaintControlsPluginPanel
                        pluginHost={pluginHost}
                        orientation="vertical"
                        compact
                        scrollable={false}
                    />
                </div>
            </div>
        </TooltipProvider>
    );
});

const EditorBrushWorkspacePanel = memo(function EditorBrushWorkspacePanel(_props: IDockviewPanelProps): JSX.Element {
    const pluginHost = useContext(MapEditorWorkbenchContext);
    const emptySubscribe = useCallback(() => () => {}, []);
    const emptySnapshot = useCallback((): string => "", []);
    useSyncExternalStore(
        pluginHost?.subscribeWorkbenchPlugins ?? emptySubscribe,
        pluginHost?.getWorkbenchPluginsStateSnapshot ?? emptySnapshot,
        pluginHost?.getWorkbenchPluginsStateSnapshot ?? emptySnapshot,
    );
    if (!pluginHost) {
        return <></>;
    }

    const model = getEditorBottomBarModel(pluginHost);
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
        "map-editor-dock-brush-menu",
        "Brush workspace",
        getMenuItems,
    );

    return (
        <TooltipProvider delayDuration={300}>
            <div className={mapEditorDockPanelFrameClassName("p-1")} onContextMenu={onContextMenu}>
                {menuPortal}
                <div className="flex h-full min-h-0 w-full min-w-0 items-center gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 shrink-0"
                                aria-label="Undock brush bar"
                                onClick={() => model.setPlacement("floating")}
                            >
                                <SquareArrowOutUpRight className="size-3.5" aria-hidden />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                            Undock (right-click for more)
                        </TooltipContent>
                    </Tooltip>
                    <div className="min-w-0 flex-1">
                        <MapEditorBottomBarStrip pluginHost={pluginHost} className="w-full" />
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
});

const EditorHistoryWorkspacePanel = memo(function EditorHistoryWorkspacePanel(_props: IDockviewPanelProps): JSX.Element {
    return (
        <MapEditorDockPanelPlacementFrame>
            <MapEditorHistoryWorkspacePanel />
        </MapEditorDockPanelPlacementFrame>
    );
});

const EditorMinimapWorkspacePanel = memo(function EditorMinimapWorkspacePanel(_props: IDockviewPanelProps): JSX.Element {
    const pluginHost = useContext(MapEditorWorkbenchContext);
    const hud = useContext(MapEditorHudContext);
    if (!pluginHost) {
        return <></>;
    }

    const onCompass = useCallback(() => {
        pluginHost.camera.setYaw(0);
    }, [pluginHost]);

    return (
        <MapEditorDockPanelPlacementFrame shellClassName="overflow-auto">
            <div className="flex h-full min-h-0 w-full items-start justify-start overflow-auto p-2">
                <MapEditorMinimap
                    pluginHost={pluginHost}
                    yawDegrees={(2047 - hud.cameraYaw) * RS_TO_DEGREES}
                    onCompassClick={onCompass}
                />
            </div>
        </MapEditorDockPanelPlacementFrame>
    );
});

const EditorSandboxTerrainWorkspacePanel = memo(function EditorSandboxTerrainWorkspacePanel(
    _props: IDockviewPanelProps,
): JSX.Element {
    const pluginHost = useContext(MapEditorWorkbenchContext);
    if (!pluginHost) {
        return <></>;
    }
    return <SandboxTerrainWorkspacePanel pluginHost={pluginHost} />;
});

export interface MapEditorToolsDockProps {
    pluginHost: IEditorPluginHost;
    onDockReady?: (api: DockviewApi) => void;
}

export function MapEditorToolsDock({ pluginHost, onDockReady }: MapEditorToolsDockProps): JSX.Element {
    const pluginHostRef = useRef(pluginHost);
    pluginHostRef.current = pluginHost;
    const [dockApi, setDockApi] = useState<DockviewApi | null>(null);
    const workbenchSnapshot = useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );

    useEffect(() => {
        if (!dockApi) {
            return;
        }
        applyMapEditorWorkbenchLayout(dockApi, pluginHost);
        syncPaintToolsDockPanel(dockApi, pluginHost);
        syncEditorBottomBarDockPanel(dockApi, pluginHost);
        syncMapEditorFloatableDockPanels(dockApi, pluginHost);
        syncEditorBottomBarExternalWindow(pluginHost);
    }, [dockApi, pluginHost, workbenchSnapshot]);

    const components = useMemo(
        () => ({
            sceneEditor: EditorScenePanel,
            scenePlaceholder: PlaceholderScenePanel,
            palette: EditorPalettePanel,
            overlayPalette: EditorOverlayPalettePanel,
            heightPalette: EditorHeightPalettePanel,
            objectSelectorPalette: EditorObjectSelectorPalettePanel,
            objectDeletePalette: EditorObjectDeletePalettePanel,
            regionStampPalette: EditorRegionStampPalettePanel,
            tileFlagsPalette: EditorTileFlagsPalettePanel,
            smoothPalette: EditorSmoothPalettePanel,
            paintTools: EditorPaintToolsPanel,
            brushWorkspace: EditorBrushWorkspacePanel,
            historyWorkspace: EditorHistoryWorkspacePanel,
            minimapWorkspace: EditorMinimapWorkspacePanel,
            sandboxTerrainWorkspace: EditorSandboxTerrainWorkspacePanel,
        }),
        [],
    );

    const onReady = useCallback(
        (event: DockviewReadyEvent) => {
            const api = event.api;
            setDockApi(api);
            onDockReady?.(api);
            applyMapEditorWorkbenchLayout(api, pluginHostRef.current);
            // Force-remove deprecated scene tabs even when old workspace state restores them.
            api.getPanel("editor-scene-2d")?.api.close();
            api.getPanel("editor-scene-live")?.api.close();
            syncPaintToolsDockPanel(api, pluginHostRef.current);
            syncEditorBottomBarDockPanel(api, pluginHostRef.current);
        },
        [onDockReady],
    );

    return (
        <MapEditorWorkbenchContext.Provider value={pluginHost}>
            <MapEditorRuntimeLoop pluginHost={pluginHost}>
                <div className="relative h-full w-full min-h-0 min-w-0">
                    <MapEditorWorkbenchFloatingLayer pluginHost={pluginHost} dockApi={dockApi}>
                        <MapEditorFloatingPaintToolsPanel pluginHost={pluginHost} />
                        <MapEditorFloatingBottomBarPanel pluginHost={pluginHost} />
                        <MapEditorFloatingDockPanels pluginHost={pluginHost} dockApi={dockApi} />
                    </MapEditorWorkbenchFloatingLayer>
                    <DockviewReact
                        className="map-editor-workbench-dockview h-full w-full min-h-0 min-w-0"
                        theme={themeDark}
                        defaultRenderer="always"
                        defaultTabComponent={MapEditorDockTab}
                        components={components}
                        onReady={onReady}
                    />
                </div>
            </MapEditorRuntimeLoop>
        </MapEditorWorkbenchContext.Provider>
    );
}
