import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";
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
import { TooltipProvider } from "../components/ui/tooltip";
import { RendererCanvas } from "../components/renderer/RendererCanvas";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { RS_TO_DEGREES } from "../rs/MathConstants";
import { MapEditorMinimap } from "./MapEditorMinimap";
import { MapEditorBrushWorkspacePanel } from "./MapEditorBrushWorkspacePanel";
import { MapEditorHistoryWorkspacePanel } from "./MapEditorHistoryWorkspacePanel";
import { SandboxTerrainWorkspacePanel } from "./SandboxTerrainWorkspacePanel";
import { EditorPaintControlsPluginPanel } from "./plugins/builtins/paint-controls.plugin";
import {
    BUILTIN_EDITOR_VIEW_FLOATING_NAV_PLUGINS,
    BUILTIN_EDITOR_VIEW_STICKY_NAV_PLUGINS,
    heightEditorTool,
    overlayEditorTool,
    underlayEditorTool,
} from "./plugins/builtins/current-plugin-runtime.builtin";
import type { EditorToolPlugin } from "./plugins/builtins/builtin-plugin-types";
import {
    MapEditorHudContext,
    MapEditorWorkbenchContext,
    type MapEditorHudState,
} from "./map-editor-workbench-context";
import { getActivePaintModifiers } from "./editor-tool-input";
import { applyMapEditorWorkbenchLayout } from "./map-editor-workbench-layout";
import { OVERLAY_SAME_ID_FLOOD_BRUSH_HUD } from "./overlay-flood-fill";

function MapEditorRuntimeLoop({
    pluginHost,
    children,
}: {
    pluginHost: IEditorPluginHost;
    children: React.ReactNode;
}): JSX.Element {
    const [, setSearchParams] = useSearchParams();
    const [hud, setHud] = useState<MapEditorHudState>(() => ({
        fps: "",
        debugText: "",
        cameraYaw: pluginHost.camera.getYaw(),
        brushSize: pluginHost.brushSize,
        brushType: pluginHost.brushType,
        brushTypeActive: pluginHost.brushType,
    }));
    const hudThrottleRef = useRef(0);

    // Omit `searchParams` from deps: it updates when we sync the camera to the URL and would restart rAF.
    useEffect(() => {
        const requestRef = { current: 0 };
        const animate = (time: DOMHighResTimeStamp) => {
            if (
                pluginHost.needsSearchParamUpdate &&
                performance.now() - pluginHost.lastTimeSearchParamsUpdated > 200
            ) {
                setSearchParams(pluginHost.getSearchParams(), { replace: true });
                pluginHost.needsSearchParamUpdate = false;
            }

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
    }, [pluginHost, setSearchParams]);

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

const WorkspaceHeaderStickyNav = memo(function WorkspaceHeaderStickyNav({
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
        return [...(BUILTIN_EDITOR_VIEW_STICKY_NAV_PLUGINS ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }, []);
    if (navPlugins.length === 0) {
        return <></>;
    }
    return (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-8">
            <TooltipProvider delayDuration={250}>
                <div className="flex h-full items-center px-2" style={{ width: "calc(100% - 21rem)" }}>
                    <div className="pointer-events-auto ml-auto flex items-center gap-1 rounded-md border border-border/70 bg-card/90 p-0.5 backdrop-blur-sm">
                        {navPlugins.map((plugin) => {
                            const Component = plugin.component;
                            return <Component key={plugin.id} pluginHost={pluginHost} />;
                        })}
                    </div>
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

function createToolPaletteDockPanel(Panel: NonNullable<EditorToolPlugin["palettePanel"]>) {
    return memo(function ToolPaletteDockPanel(_props: IDockviewPanelProps): JSX.Element {
        const pluginHost = useContext(MapEditorWorkbenchContext);
        if (!pluginHost) {
            return <></>;
        }
        return (
            <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-card text-card-foreground shadow-none">
                <Panel pluginHost={pluginHost} />
            </Card>
        );
    });
}

const EditorPalettePanel = createToolPaletteDockPanel(underlayEditorTool.palettePanel!);
const EditorOverlayPalettePanel = createToolPaletteDockPanel(overlayEditorTool.palettePanel!);
const EditorHeightPalettePanel = createToolPaletteDockPanel(heightEditorTool.palettePanel!);
const EditorSmoothPalettePanel = EditorHeightPalettePanel;

function createEditorPaintToolsPanel(getPluginHost: () => IEditorPluginHost | null) {
    return memo(function EditorPaintToolsPanel(_props: IDockviewPanelProps): JSX.Element {
        const host = getPluginHost();
        if (!host) {
            return (
                <div className="flex h-full min-h-0 items-center justify-center p-3 text-center text-xs text-muted-foreground">
                    Map editor is not ready.
                </div>
            );
        }
        return (
            <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-card text-card-foreground">
                <div className="flex min-h-0 flex-1 items-start justify-center px-0.5 pb-2 pt-1">
                    <EditorPaintControlsPluginPanel pluginHost={host} />
                </div>
            </div>
        );
    });
}

const EditorBrushWorkspacePanel = memo(function EditorBrushWorkspacePanel(_props: IDockviewPanelProps): JSX.Element {
    const pluginHost = useContext(MapEditorWorkbenchContext);
    if (!pluginHost) {
        return <></>;
    }
    return (
        <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden border-t border-border/60 bg-card text-card-foreground">
            <MapEditorBrushWorkspacePanel pluginHost={pluginHost} />
        </div>
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
        <div className="flex h-full min-h-0 w-full items-start justify-start overflow-auto bg-card p-2">
            <MapEditorMinimap
                pluginHost={pluginHost}
                yawDegrees={(2047 - hud.cameraYaw) * RS_TO_DEGREES}
                onCompassClick={onCompass}
            />
        </div>
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

    const components = useMemo(
        () => ({
            sceneEditor: EditorScenePanel,
            scenePlaceholder: PlaceholderScenePanel,
            palette: EditorPalettePanel,
            overlayPalette: EditorOverlayPalettePanel,
            heightPalette: EditorHeightPalettePanel,
            smoothPalette: EditorSmoothPalettePanel,
            paintTools: createEditorPaintToolsPanel(() => pluginHostRef.current),
            brushWorkspace: EditorBrushWorkspacePanel,
            historyWorkspace: MapEditorHistoryWorkspacePanel,
            minimapWorkspace: EditorMinimapWorkspacePanel,
            sandboxTerrainWorkspace: EditorSandboxTerrainWorkspacePanel,
        }),
        [],
    );

    const onReady = useCallback(
        (event: DockviewReadyEvent) => {
            const api = event.api;
            onDockReady?.(api);
            applyMapEditorWorkbenchLayout(api, pluginHostRef.current);
            // Force-remove deprecated scene tabs even when old workspace state restores them.
            api.getPanel("editor-scene-2d")?.api.close();
            api.getPanel("editor-scene-live")?.api.close();
        },
        [onDockReady],
    );

    return (
        <MapEditorWorkbenchContext.Provider value={pluginHost}>
            <MapEditorRuntimeLoop pluginHost={pluginHost}>
                <div className="relative h-full w-full min-h-0 min-w-0">
                    <WorkspaceHeaderStickyNav pluginHost={pluginHost} />
                    <DockviewReact
                        className="map-editor-workbench-dockview h-full w-full min-h-0 min-w-0"
                        theme={themeDark}
                        defaultRenderer="always"
                        components={components}
                        onReady={onReady}
                    />
                </div>
            </MapEditorRuntimeLoop>
        </MapEditorWorkbenchContext.Provider>
    );
}
