import { useCallback, useEffect, useRef, useState } from "react";
import { Joystick } from "react-joystick-component";
import { useSearchParams } from "react-router-dom";

import { RendererCanvas } from "../components/renderer/RendererCanvas";
import { OsrsMenu, OsrsMenuProps } from "../components/rs/menu/OsrsMenu";
import { WorldMapModal } from "../components/rs/worldmap/WorldMapModal";
import { isTouchDevice } from "../util/DeviceUtil";
import { MapViewer } from "./MapViewer";
import "./MapViewerContainer.css";
import { MapViewerRenderer } from "./MapViewerRenderer";
import { MapViewerToolsDock } from "./MapViewerToolsDock";

interface MapViewerContainerProps {
    mapViewer: MapViewer;
}

export function MapViewerContainer({ mapViewer }: MapViewerContainerProps): JSX.Element {
    const [, setSearchParams] = useSearchParams();

    const [renderer, setRenderer] = useState<MapViewerRenderer>(mapViewer.renderer);

    const [hideUi, setHideUi] = useState(false);
    const [fps, setFps] = useState(0);
    const [cameraYaw, setCameraYaw] = useState(mapViewer.camera.getYaw());
    const [isWorldMapOpen, setWorldMapOpen] = useState<boolean>(false);

    const [menuProps, setMenuProps] = useState<OsrsMenuProps | undefined>(undefined);

    const requestRef = useRef<number | undefined>();

    const animate = (time: DOMHighResTimeStamp) => {
        // Wait for 200ms before updating search params
        if (
            mapViewer.needsSearchParamUpdate &&
            performance.now() - mapViewer.lastTimeSearchParamsUpdated > 200
        ) {
            setSearchParams(mapViewer.getSearchParams(), { replace: true });
            mapViewer.needsSearchParamUpdate = false;
        }

        if (!hideUi) {
            setFps(Math.round(renderer.stats.frameTimeFps));
            setCameraYaw(mapViewer.camera.getYaw());
        }

        if (mapViewer.menuEntries.length > 0 && mapViewer.menuX !== -1 && mapViewer.menuY !== -1) {
            setMenuProps({
                x: mapViewer.menuX,
                y: mapViewer.menuY,
                tooltip: !mapViewer.menuOpen,
                entries: mapViewer.menuEntries,
                debugId: mapViewer.debugId,
            });
        } else {
            setMenuProps(undefined);
        }

        requestRef.current = requestAnimationFrame(animate);
    };

    // Omit URL/searchParams from deps: camera sync updates the query string and would restart rAF constantly.
    useEffect(() => {
        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current!);
    }, [hideUi, mapViewer, renderer, setSearchParams]);

    const resetCameraYaw = useCallback(() => {
        mapViewer.camera.setYaw(0);
    }, [mapViewer]);

    const openWorldMap = useCallback(() => {
        setWorldMapOpen(true);
    }, []);

    const closeWorldMap = useCallback(() => {
        setWorldMapOpen(false);
        renderer.canvas.focus();
    }, [renderer]);

    const onMapClicked = useCallback(
        (x: number, y: number) => {
            mapViewer.camera.pos[0] = x;
            mapViewer.camera.pos[2] = y;
            mapViewer.camera.updated = true;
            closeWorldMap();
        },
        [mapViewer, closeWorldMap],
    );

    const getMapPosition = useCallback(() => {
        const x = mapViewer.camera.getPosX();
        const y = mapViewer.camera.getPosZ();

        return {
            x,
            y,
        };
    }, [mapViewer]);

    const loadMapImageUrl = useCallback(
        (mapX: number, mapY: number) => {
            return mapViewer.getMapImageUrl(mapX, mapY, false);
        },
        [mapViewer],
    );

    const loadMinimapImageUrl = useCallback(
        (mapX: number, mapY: number) => {
            return mapViewer.getMapImageUrl(mapX, mapY, true);
        },
        [mapViewer],
    );

    return (
        <div className="map-viewer-root max-height h-full min-h-0 w-full min-w-0 flex-1">
            <div className="map-viewer-viewport">
                {menuProps && <OsrsMenu {...menuProps} />}

                {!hideUi && (
                    <div className="map-viewer-hud-layer">
                        <WorldMapModal
                            isOpen={isWorldMapOpen}
                            onRequestClose={closeWorldMap}
                            onDoubleClick={onMapClicked}
                            getPosition={getMapPosition}
                            loadMapImageUrl={loadMapImageUrl}
                        />
                    </div>
                )}

                {!hideUi && isTouchDevice && (
                    <div className="joystick-container left">
                        <Joystick
                            size={75}
                            baseColor="#181C20"
                            stickColor="#007BFF"
                            stickSize={40}
                            move={mapViewer.inputManager.onPositionJoystickMove}
                            stop={mapViewer.inputManager.onPositionJoystickStop}
                        ></Joystick>
                    </div>
                )}
                {!hideUi && isTouchDevice && (
                    <div className="joystick-container right">
                        <Joystick
                            size={75}
                            baseColor="#181C20"
                            stickColor="#007BFF"
                            stickSize={40}
                            move={mapViewer.inputManager.onCameraJoystickMove}
                            stop={mapViewer.inputManager.onCameraJoystickStop}
                        ></Joystick>
                    </div>
                )}

                <RendererCanvas renderer={renderer} />
            </div>

            {!hideUi ? (
                <div className="map-viewer-tools-dock border-l border-border bg-background">
                    <MapViewerToolsDock
                        renderer={renderer}
                        setRenderer={setRenderer}
                        setHideUi={setHideUi}
                        cameraYaw={cameraYaw}
                        onCompassClick={resetCameraYaw}
                        onWorldMapClick={openWorldMap}
                        getPosition={getMapPosition}
                        loadMinimapImageUrl={loadMinimapImageUrl}
                        fps={fps}
                        debugText={mapViewer.debugText}
                    />
                </div>
            ) : null}
        </div>
    );
}
