import { createContext, memo, useCallback, useContext, useMemo } from "react";
import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
    themeDark,
} from "dockview";
import "dockview/dist/styles/dockview.css";

import { MinimapContainer } from "../components/rs/minimap/MinimapContainer";
import { RS_TO_DEGREES } from "../rs/MathConstants";
import { MapViewerControls } from "./MapViewerControls";
import { MapViewerRenderer } from "./MapViewerRenderer";

export interface MapViewerToolsDockProps {
    renderer: MapViewerRenderer;
    setRenderer: (renderer: MapViewerRenderer) => void;
    setHideUi: (hideUi: boolean | ((hideUi: boolean) => boolean)) => void;
    cameraYaw: number;
    onCompassClick: () => void;
    onWorldMapClick: () => void;
    getPosition: () => { x: number; y: number };
    loadMinimapImageUrl: (mapX: number, mapY: number) => string | undefined;
    fps: number;
    debugText: string | undefined;
}

const MapViewerToolsDockContext = createContext<MapViewerToolsDockProps | null>(null);

const ControlsDockPanel = memo(function ControlsDockPanel(_props: IDockviewPanelProps): JSX.Element {
    const ctx = useContext(MapViewerToolsDockContext);
    if (!ctx) {
        return <></>;
    }
    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card text-card-foreground">
            <MapViewerControls
                renderer={ctx.renderer}
                hideUi={false}
                setRenderer={ctx.setRenderer}
                setHideUi={ctx.setHideUi}
            />
            <div className="content-text text-[11px] px-2 pb-2">{ctx.debugText ?? ""}</div>
        </div>
    );
});

const MinimapDockPanel = memo(function MinimapDockPanel(_props: IDockviewPanelProps): JSX.Element {
    const ctx = useContext(MapViewerToolsDockContext);
    if (!ctx) {
        return <></>;
    }
    return (
        <div className="flex h-full min-h-0 flex-col gap-2 overflow-auto bg-card/95 p-2 text-card-foreground">
            <MinimapContainer
                yawDegrees={(2047 - ctx.cameraYaw) * RS_TO_DEGREES}
                onCompassClick={ctx.onCompassClick}
                onWorldMapClick={ctx.onWorldMapClick}
                getPosition={ctx.getPosition}
                loadMapImageUrl={ctx.loadMinimapImageUrl}
            />
            <div className="fps-counter content-text text-[11px]">{ctx.fps}</div>
            <div className="fps-counter content-text text-[11px]">{ctx.debugText ?? ""}</div>
        </div>
    );
});

export function MapViewerToolsDock(props: MapViewerToolsDockProps): JSX.Element {
    const components = useMemo(
        () => ({
            controls: ControlsDockPanel,
            minimap: MinimapDockPanel,
        }),
        [],
    );

    const onReady = useCallback((event: DockviewReadyEvent) => {
        const api = event.api;
        if (api.getPanel("map-controls")) {
            return;
        }
        api.addPanel({
            id: "map-controls",
            component: "controls",
            title: "Controls",
        });
        api.addPanel({
            id: "map-minimap",
            component: "minimap",
            title: "Minimap",
            position: { referencePanel: "map-controls", direction: "within" },
            inactive: true,
        });
    }, []);

    return (
        <MapViewerToolsDockContext.Provider value={props}>
            <DockviewReact
                className="map-viewer-tools-dockview h-full w-full min-h-0 min-w-0"
                theme={themeDark}
                components={components}
                onReady={onReady}
            />
        </MapViewerToolsDockContext.Provider>
    );
}
