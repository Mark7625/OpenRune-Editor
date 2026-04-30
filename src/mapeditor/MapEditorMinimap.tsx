import { RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "../components/ui/button";
import compass from "../components/rs/minimap/compass.png";
import minimapBlack from "../components/rs/minimap/minimap-black.png";
import "./MapEditorMinimap.css";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";

/** Visible square (px) for the dock minimap. */
const VIEW_SIZE = 300;
/** Rough extent of the 3×3 tile assembly in source pixels (before scale). */
const TILE_SPACE = 765;
/** Default multiplier on top of base fit-to-view scale (same as previous fixed zoom). */
const DEFAULT_MINIMAP_ZOOM = 2.35;
const MIN_MINIMAP_ZOOM = 1.2;
const MAX_MINIMAP_ZOOM = 4.25;
const MINIMAP_ZOOM_STEP = 0.2;

interface MinimapTileSlot {
    stack: HTMLDivElement;
    layers: [HTMLImageElement, HTMLImageElement];
    activeIdx: 0 | 1;
    currentKey: string;
    desiredKey: string;
    preloadFor?: string;
    /** Last blob URL we committed for this square; shown again while a refresh has no URL yet. */
    displayedBlobUrl?: string;
    displayedForSquare?: string;
}

export interface MapEditorMinimapProps {
    pluginHost: IEditorPluginHost;
    yawDegrees: number;
    onCompassClick: () => void;
}

export const MapEditorMinimap = memo(function MapEditorMinimap({
    pluginHost,
    yawDegrees,
    onCompassClick,
}: MapEditorMinimapProps): JSX.Element {
    const compassSrc = typeof compass === "string" ? compass : compass.src;
    const imagesWrapRef = useRef<HTMLDivElement>(null);
    const [zoomMultiplier, setZoomMultiplier] = useState(DEFAULT_MINIMAP_ZOOM);

    const scale = (VIEW_SIZE / TILE_SPACE) * zoomMultiplier;

    const rebuildMinimapTiles = useCallback(() => {
        pluginHost.refreshMinimapAroundCamera();
        const cameraX = pluginHost.camera.getPosX();
        const cameraY = pluginHost.camera.getPosZ();
        const cameraMapX = cameraX >> 6;
        const cameraMapY = cameraY >> 6;
        for (let mx = 0; mx < 3; mx++) {
            for (let my = 0; my < 3; my++) {
                const mapX = cameraMapX - 1 + mx;
                const mapY = cameraMapY - 1 + my;
                pluginHost.getMinimapImageUrl(mapX, mapY);
            }
        }
    }, [pluginHost]);

    useEffect(() => {
        const wrap = imagesWrapRef.current;
        if (!wrap) {
            return;
        }

        const blackSrc = typeof minimapBlack === "string" ? minimapBlack : minimapBlack.src;

        const slots: MinimapTileSlot[] = [];
        for (let i = 0; i < 9; i++) {
            const stack = document.createElement("div");
            stack.className = "map-editor-minimap-stack";

            const a = document.createElement("img");
            const b = document.createElement("img");
            for (const el of [a, b]) {
                el.className = "map-editor-minimap-layer";
                el.alt = "";
                el.width = 256;
                el.height = 256;
                el.src = blackSrc;
            }
            a.classList.add("map-editor-minimap-layer--on");
            b.classList.add("map-editor-minimap-layer--off");

            stack.appendChild(a);
            stack.appendChild(b);
            wrap.appendChild(stack);

            slots.push({
                stack,
                layers: [a, b],
                activeIdx: 0,
                currentKey: "",
                desiredKey: "",
                displayedBlobUrl: undefined,
                displayedForSquare: undefined,
            });
        }

        let raf = 0;

        const animate = () => {
            const wrapEl = imagesWrapRef.current;
            if (!wrapEl) {
                return;
            }

            const cameraX = pluginHost.camera.getPosX();
            const cameraY = pluginHost.camera.getPosZ();
            const cameraMapX = cameraX >> 6;
            const cameraMapY = cameraY >> 6;

            const offsetX = (-128 + (cameraX % 64) * 4) | 0;
            const offsetY = (-128 + (cameraY % 64) * 4) | 0;

            let slotIdx = 0;
            for (let mx = 0; mx < 3; mx++) {
                for (let my = 0; my < 3; my++) {
                    const slot = slots[slotIdx]!;
                    slotIdx++;

                    const mapX = cameraMapX - 1 + mx;
                    const mapY = cameraMapY - 1 + my;

                    const x = mx * 255 - offsetX;
                    const y = 255 * 2 - my * 255 + offsetY;
                    slot.stack.style.left = `${x}px`;
                    slot.stack.style.top = `${y}px`;

                    const minimapUrl = pluginHost.getMinimapImageUrl(mapX, mapY);
                    const squareKey = `${mapX},${mapY}`;
                    const canHoldPrevious =
                        !minimapUrl &&
                        slot.displayedBlobUrl !== undefined &&
                        slot.displayedForSquare === squareKey;
                    const urlToShow = minimapUrl ?? (canHoldPrevious ? slot.displayedBlobUrl : undefined);
                    const targetUrl = urlToShow ?? blackSrc;
                    const slotKey = `${squareKey}:${targetUrl}`;

                    if (slot.currentKey === slotKey) {
                        continue;
                    }

                    slot.desiredKey = slotKey;

                    if (!urlToShow) {
                        const active = slot.layers[slot.activeIdx];
                        active.src = blackSrc;
                        slot.displayedBlobUrl = undefined;
                        slot.displayedForSquare = undefined;
                        slot.currentKey = slotKey;
                        delete slot.preloadFor;
                        continue;
                    }

                    if (!minimapUrl) {
                        slot.currentKey = slotKey;
                        continue;
                    }

                    if (slot.preloadFor !== undefined) {
                        continue;
                    }

                    slot.preloadFor = slotKey;

                    const standbyIdx = (1 - slot.activeIdx) as 0 | 1;
                    const standby = slot.layers[standbyIdx];
                    const active = slot.layers[slot.activeIdx];

                    const pre = new Image();
                    pre.onload = () => {
                        if (slot.desiredKey !== slotKey) {
                            return;
                        }
                        standby.src = minimapUrl;

                        const crossfade = () => {
                            if (slot.desiredKey !== slotKey) {
                                return;
                            }
                            active.classList.remove("map-editor-minimap-layer--on");
                            active.classList.add("map-editor-minimap-layer--off");
                            standby.classList.remove("map-editor-minimap-layer--off");
                            standby.classList.add("map-editor-minimap-layer--on");
                            slot.activeIdx = standbyIdx;
                            slot.currentKey = slotKey;
                            slot.displayedBlobUrl = minimapUrl;
                            slot.displayedForSquare = squareKey;
                            delete slot.preloadFor;
                        };

                        if (standby.complete) {
                            requestAnimationFrame(() => requestAnimationFrame(crossfade));
                        } else {
                            standby.onload = () => {
                                if (slot.desiredKey !== slotKey) {
                                    return;
                                }
                                requestAnimationFrame(() => requestAnimationFrame(crossfade));
                            };
                        }
                    };
                    pre.onerror = () => {
                        if (slot.desiredKey !== slotKey) {
                            return;
                        }
                        slot.layers[slot.activeIdx].src = blackSrc;
                        slot.displayedBlobUrl = undefined;
                        slot.displayedForSquare = undefined;
                        slot.currentKey = `${squareKey}:${blackSrc}`;
                        delete slot.preloadFor;
                    };
                    pre.src = minimapUrl;
                }
            }

            raf = requestAnimationFrame(animate);
        };

        raf = requestAnimationFrame(animate);
        return () => {
            cancelAnimationFrame(raf);
            wrap.replaceChildren();
        };
    }, [pluginHost]);

    return (
        <div className="map-editor-minimap-root">
            <div
                className="map-editor-minimap-square border border-border bg-black"
                style={{ width: VIEW_SIZE, height: VIEW_SIZE }}
            >
                <div className="map-editor-minimap-rotate-outer">
                    <div
                        className="map-editor-minimap-rotate"
                        style={{
                            transform: `rotate(${yawDegrees}deg)`,
                        }}
                    >
                        <div
                            className="map-editor-minimap-scale"
                            style={{
                                transform: `scale(${scale})`,
                            }}
                        >
                            <div
                                ref={imagesWrapRef}
                                className="map-editor-minimap-images"
                                style={{ width: TILE_SPACE, height: TILE_SPACE }}
                            />
                        </div>
                    </div>
                </div>

                <img
                    className="map-editor-minimap-compass"
                    src={compassSrc}
                    alt=""
                    style={{ transform: `rotate(${yawDegrees}deg)` }}
                    onClick={onCompassClick}
                />

                <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute right-1 top-1 z-[2] h-7 w-7 shadow-sm"
                    title="Refresh minimap tiles"
                    aria-label="Refresh minimap tiles"
                    onClick={rebuildMinimapTiles}
                >
                    <RefreshCw className="size-3.5" aria-hidden />
                </Button>

                <div className="map-editor-minimap-zoom-controls">
                    <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="h-7 w-7 shadow-sm"
                        title="Zoom out"
                        aria-label="Zoom out minimap"
                        disabled={zoomMultiplier <= MIN_MINIMAP_ZOOM + 1e-6}
                        onClick={() =>
                            setZoomMultiplier((z) =>
                                Math.max(MIN_MINIMAP_ZOOM, z - MINIMAP_ZOOM_STEP),
                            )
                        }
                    >
                        <ZoomOut className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="h-7 w-7 shadow-sm"
                        title="Zoom in"
                        aria-label="Zoom in minimap"
                        disabled={zoomMultiplier >= MAX_MINIMAP_ZOOM - 1e-6}
                        onClick={() =>
                            setZoomMultiplier((z) =>
                                Math.min(MAX_MINIMAP_ZOOM, z + MINIMAP_ZOOM_STEP),
                            )
                        }
                    >
                        <ZoomIn className="size-3.5" aria-hidden />
                    </Button>
                </div>
            </div>
        </div>
    );
});
