import {
    MouseEvent,
    TouchEvent,
    WheelEvent,
    memo,
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { SingleValue } from "react-select";
import { useElementSize } from "usehooks-ts";

import { getMapSquareId } from "../../../rs/map/MapFileIndex";
import { clamp } from "../../../util/MathUtil";
import { OsrsSelect } from "../select/OsrsSelect";
import "./WorldMap.css";
import locationsImport from "./locations.json";

interface Location {
    name: string;
    coords: number[];
    size?: string;
}

function getTileSize(size?: string) {
    switch (size) {
        case "large":
            return 2;
        case "medium":
            return 3;
        default:
            return 4;
    }
}

interface LocationOption {
    value: string;
    label: string;
}

const locations: Location[] = locationsImport.locations;
const locationsMap: Record<string, Location> = {};
const locationOptions: LocationOption[] = [];

for (const location of locations) {
    const key = `${location.name} ${location.coords.join(",")}`;
    locationsMap[key] = location;
    locationOptions.push({
        value: key,
        label: location.name,
    });
}

interface Position {
    x: number;
    y: number;
}

interface RegionLabel {
    id: number;
    mapX: number;
    mapY: number;
    left: number;
    bottom: number;
}

const TILE_SIZES = [0.25, 0.375, 0.5, 0.75, 1, 2, 3, 4, 5, 6, 8, 10];

const DEFAULT_TILE_SIZE = 3;

const MAX_X = 100 * 64;
const MAX_Y = 200 * 64;

// TODO: Optimize by writing to 1 image

export interface WorldMapProps {
    onDoubleClick: (x: number, y: number) => void;
    onRegionSelect?: (mapX: number, mapY: number, regionId: number) => void;

    getPosition: () => Position;
    loadMapImageUrl: (mapX: number, mapY: number) => string | undefined;
}

export const WorldMap = memo(function WorldMap(props: WorldMapProps) {
    const { getPosition, loadMapImageUrl } = props;

    const [ref, { width = 0, height = 0 }] = useElementSize();
    const dragRef = useRef<HTMLDivElement>(null);

    const [isDragging, setIsDragging] = useState(false);
    const [startPos, setStartPos] = useState<Position>({ x: 0, y: 0 });
    const [hoverRegion, setHoverRegion] = useState<{ mapX: number; mapY: number } | undefined>();
    const [selectedRegion, setSelectedRegion] = useState<{ mapX: number; mapY: number } | undefined>();

    const [pos, setPos] = useState(getPosition);
    const [tileSizeIndex, setTileSizeIndex] = useState(TILE_SIZES.indexOf(DEFAULT_TILE_SIZE));

    const [images, setImages] = useState<JSX.Element[]>([]);
    const [regionLabels, setRegionLabels] = useState<RegionLabel[]>([]);

    const requestRef = useRef<number | undefined>();

    const tileSize = TILE_SIZES[tileSizeIndex];

    const cameraX = pos.x | 0;
    const cameraY = pos.y | 0;

    const halfWidth = (width / 2) | 0;
    const halfHeight = (height / 2) | 0;

    const animate = (time: DOMHighResTimeStamp) => {
        const halfTileSize = tileSize / 2;
        const imageSize = 64 * tileSize;

        const mapX = pos.x >> 6;
        const mapY = pos.y >> 6;

        const x = halfWidth - (cameraX % 64) * tileSize - halfTileSize;
        const y = halfHeight - (cameraY % 64) * tileSize - halfTileSize;

        const renderStartX = -Math.ceil(x / imageSize) - 1;
        const renderStartY = -Math.ceil(y / imageSize) - 1;

        const renderEndX = Math.ceil((width - x) / imageSize) + 1;
        const renderEndY = Math.ceil((height - y) / imageSize) + 1;

        const images: JSX.Element[] = [];
        const labels: RegionLabel[] = [];

        for (let rx = renderStartX; rx < renderEndX; rx++) {
            for (let ry = renderStartY; ry < renderEndY; ry++) {
                const imageMapX = mapX + rx;
                const imageMapY = mapY + ry;
                const mapId = getMapSquareId(imageMapX, imageMapY);
                const mapUrl = loadMapImageUrl(imageMapX, imageMapY);
                if (mapUrl) {
                    labels.push({
                        id: mapId,
                        mapX: imageMapX,
                        mapY: imageMapY,
                        left: x + rx * imageSize,
                        bottom: y + ry * imageSize,
                    });
                    images.push(
                        <img
                            key={mapId}
                            className={`worldmap-image ${imageMapX}_${imageMapY}`}
                            src={mapUrl}
                            style={{
                                left: x + rx * imageSize,
                                bottom: y + ry * imageSize,
                                width: imageSize,
                                height: imageSize,
                            }}
                        />,
                    );
                }
            }
        }

        setImages(images);
        setRegionLabels(labels);

        requestRef.current = requestAnimationFrame(animate);
    };

    useLayoutEffect(() => {
        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current!);
    }, [width, height, pos, tileSize]);

    const onDoubleClick = (event: MouseEvent) => {
        setIsDragging(false);

        const offsetX = event.nativeEvent.offsetX;
        const offsetY = event.nativeEvent.offsetY;

        const deltaX = (offsetX - halfWidth) / tileSize + 0.5;
        const deltaY = (halfHeight - offsetY) / tileSize + 0.5;

        props.onDoubleClick(cameraX + deltaX, cameraY + deltaY);
    };

    const getRegionFromOffsets = useCallback(
        (offsetX: number, offsetY: number) => {
            const deltaX = (offsetX - halfWidth) / tileSize + 0.5;
            const deltaY = (halfHeight - offsetY) / tileSize + 0.5;
            const tileX = cameraX + deltaX;
            const tileY = cameraY + deltaY;
            const mapX = Math.floor(tileX / 64);
            const mapY = Math.floor(tileY / 64);
            if (mapX < 0 || mapY < 0) {
                return undefined;
            }
            return { mapX, mapY, regionId: getMapSquareId(mapX, mapY) };
        },
        [cameraX, cameraY, halfHeight, halfWidth, tileSize],
    );

    function startDragging(startX: number, startY: number) {
        setIsDragging(true);
        setStartPos({
            x: startX,
            y: startY,
        });
        // setStartX(startX);
        // setStartY(startY);
    }

    const onMouseDown = (event: MouseEvent) => {
        const rect = dragRef.current?.getBoundingClientRect();
        const offsetX = rect?.left ?? 0;
        const offsetY = rect?.top ?? 0;

        startDragging(event.clientX - offsetX, event.clientY - offsetY);
    };

    const onTouchStart = (event: TouchEvent) => {
        const touch = event.touches[0];
        const rect = dragRef.current?.getBoundingClientRect();
        const offsetX = rect?.left ?? 0;
        const offsetY = rect?.top ?? 0;
        startDragging(touch.clientX - offsetX, touch.clientY - offsetY);
    };

    const drag = (x: number, y: number) => {
        const { x: startX, y: startY } = startPos;

        const deltaX = (startX - x) / tileSize;
        const deltaY = (y - startY) / tileSize;

        startPos.x = x;
        startPos.y = y;
        setPos((pos) => {
            return {
                x: clamp(pos.x + deltaX, 0, MAX_X),
                y: clamp(pos.y + deltaY, 0, MAX_Y),
            };
        });
    };

    const onMouseMove = (event: MouseEvent) => {
        const rect = dragRef.current?.getBoundingClientRect();
        const offsetLeft = rect?.left ?? 0;
        const offsetTop = rect?.top ?? 0;
        const mouseX = event.clientX - offsetLeft;
        const mouseY = event.clientY - offsetTop;
        const hovered = getRegionFromOffsets(mouseX, mouseY);
        setHoverRegion(hovered ? { mapX: hovered.mapX, mapY: hovered.mapY } : undefined);

        if (isDragging) {
            drag(mouseX, mouseY);
        }
    };

    const onTouchMove = (event: TouchEvent) => {
        if (isDragging) {
            const touch = event.touches[0];
            const rect = dragRef.current?.getBoundingClientRect();
            const offsetX = rect?.left ?? 0;
            const offsetY = rect?.top ?? 0;
            drag(touch.clientX - offsetX, touch.clientY - offsetY);
        }
    };

    const stopDragging = (event: MouseEvent | TouchEvent) => {
        setIsDragging(false);
    };

    const onMapClick = (event: MouseEvent) => {
        const offsetX = event.nativeEvent.offsetX;
        const offsetY = event.nativeEvent.offsetY;
        const region = getRegionFromOffsets(offsetX, offsetY);
        if (!region) {
            return;
        }
        setSelectedRegion({ mapX: region.mapX, mapY: region.mapY });
        props.onRegionSelect?.(region.mapX, region.mapY, region.regionId);
    };

    const zoom = (delta: number) => {
        const newIndex = clamp(tileSizeIndex + delta, 0, TILE_SIZES.length - 1);
        setTileSizeIndex(newIndex);
        return TILE_SIZES[newIndex];
    };

    const onMouseWheel = (event: WheelEvent) => {
        const offsetX = event.nativeEvent.offsetX;
        const offsetY = event.nativeEvent.offsetY;

        const deltaX = (offsetX - halfWidth) / tileSize;
        const deltaY = (halfHeight - offsetY) / tileSize;

        const newSize = zoom(-Math.sign(event.deltaY));

        const newDeltaX = (offsetX - halfWidth) / newSize;
        const newDeltaY = (halfHeight - offsetY) / newSize;

        setPos((pos) => {
            return {
                x: clamp(pos.x + deltaX - newDeltaX, 0, MAX_X),
                y: clamp(pos.y + deltaY - newDeltaY, 0, MAX_Y),
            };
        });
    };

    const zoomOut = () => {
        zoom(-1);
    };

    const zoomIn = () => {
        zoom(1);
    };

    const onLocationSelected = useCallback((value: SingleValue<LocationOption>) => {
        if (value) {
            const location = locationsMap[value.value];
            setPos({
                x: location.coords[0],
                y: location.coords[1],
            });
            setTileSizeIndex(TILE_SIZES.indexOf(getTileSize(location.size)));
        }
    }, []);

    const borderWidth = MAX_X * tileSize;
    const borderHeight = MAX_Y * tileSize;

    const borderOffsetX = cameraX * tileSize;
    const borderOffsetY = cameraY * tileSize;
    const mapToScreen = useCallback(
        (mapX: number, mapY: number) => {
            const cameraMapX = cameraX >> 6;
            const cameraMapY = cameraY >> 6;
            const baseLeft = halfWidth - (cameraX % 64) * tileSize - tileSize / 2;
            const baseBottom = halfHeight - (cameraY % 64) * tileSize - tileSize / 2;
            return {
                left: baseLeft + (mapX - cameraMapX) * 64 * tileSize,
                bottom: baseBottom + (mapY - cameraMapY) * 64 * tileSize,
            };
        },
        [cameraX, cameraY, halfHeight, halfWidth, tileSize],
    );
    const selectedMapX = selectedRegion?.mapX;
    const selectedMapY = selectedRegion?.mapY;
    const hasSelectedRegion = selectedMapX !== undefined && selectedMapY !== undefined;
    const hoverMapX = hoverRegion?.mapX;
    const hoverMapY = hoverRegion?.mapY;
    const hasHoverRegion = hoverMapX !== undefined && hoverMapY !== undefined;
    const hoverRegionLeft =
        hasHoverRegion && hoverMapX !== undefined && hoverMapY !== undefined
            ? mapToScreen(hoverMapX, hoverMapY).left
            : 0;
    const hoverRegionBottom =
        hasHoverRegion && hoverMapX !== undefined && hoverMapY !== undefined
            ? mapToScreen(hoverMapX, hoverMapY).bottom
            : 0;
    const hoverRegionSize = 64 * tileSize;
    const selectedRegionLeft =
        hasSelectedRegion && selectedMapX !== undefined && selectedMapY !== undefined
            ? mapToScreen(selectedMapX, selectedMapY).left
            : 0;
    const selectedRegionBottom =
        hasSelectedRegion && selectedMapX !== undefined && selectedMapY !== undefined
            ? mapToScreen(selectedMapX, selectedMapY).bottom
            : 0;
    const selectedRegionSize = 64 * tileSize;

    return (
        <div className="worldmap-container">
            <div className="worldmap" ref={ref}>
                {images}
                {regionLabels.map((label) => (
                    <div
                        key={`grid-${label.id}`}
                        style={{
                            position: "absolute",
                            left: label.left,
                            bottom: label.bottom,
                            width: 64 * tileSize,
                            height: 64 * tileSize,
                            border: "1px solid rgba(248, 250, 252, 0.35)",
                            pointerEvents: "none",
                            zIndex: 2,
                        }}
                    />
                ))}
                {regionLabels.map((label) => {
                    const isSelected =
                        selectedRegion?.mapX === label.mapX && selectedRegion?.mapY === label.mapY;
                    return (
                        <div
                            key={`label-${label.id}`}
                            style={{
                                position: "absolute",
                                left: label.left,
                                bottom: label.bottom,
                                width: 64 * tileSize,
                                height: 64 * tileSize,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: Math.max(9, Math.min(12, tileSize * 2.6)),
                                lineHeight: 1,
                                fontWeight: isSelected ? 700 : 600,
                                color: "rgba(248, 250, 252, 0.96)",
                                textShadow: "0 1px 2px rgba(0, 0, 0, 0.9)",
                                pointerEvents: "none",
                                zIndex: 4,
                            }}
                        >
                            <span
                                style={{
                                    background: "rgba(15, 23, 42, 0.55)",
                                    borderRadius: 4,
                                    padding: "2px 4px",
                                }}
                            >
                                {label.id}
                            </span>
                        </div>
                    );
                })}
                {/* <div className=""
                style={{
                    position: "absolute",
                    left: halfWidth - 2,
                    bottom: halfHeight - 2,
                    width: 4,
                    height: 4,
                    backgroundColor: "cyan",
                    // zIndex: 10,
                }}
            ></div> */}
                <div
                    className="worldmap-border"
                    style={{
                        position: "absolute",
                        left: halfWidth - borderOffsetX,
                        bottom: halfHeight - borderOffsetY,
                        width: borderWidth,
                        height: borderHeight,
                    }}
                ></div>
                {hasHoverRegion ? (
                    <div
                        style={{
                            position: "absolute",
                            left: hoverRegionLeft,
                            bottom: hoverRegionBottom,
                            width: hoverRegionSize,
                            height: hoverRegionSize,
                            border: "1px solid rgba(248, 250, 252, 0.9)",
                            background: "rgba(0, 0, 0, 0.28)",
                            pointerEvents: "none",
                            zIndex: 2,
                        }}
                    />
                ) : null}
                {hasSelectedRegion ? (
                    <div
                        style={{
                            position: "absolute",
                            left: selectedRegionLeft,
                            bottom: selectedRegionBottom,
                            width: selectedRegionSize,
                            height: selectedRegionSize,
                            border: "2px solid rgba(248, 250, 252, 0.95)",
                            boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.65) inset",
                            pointerEvents: "none",
                            zIndex: 3,
                        }}
                    />
                ) : null}
                <div
                    className={`worldmap-drag ${isDragging ? "dragging" : ""}`}
                    onDoubleClick={onDoubleClick}
                    onClick={onMapClick}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={stopDragging}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={stopDragging}
                    onWheel={onMouseWheel}
                    onMouseLeave={stopDragging}
                    title="Double click to teleport"
                    ref={dragRef}
                ></div>
            </div>
            <div className="worldmap-footer rs-border rs-background">
                <span className="flex hide-mobile text-xs text-muted-foreground">
                    {hoverRegion
                        ? `Hover: ${getMapSquareId(hoverRegion.mapX, hoverRegion.mapY)} (${hoverRegion.mapX}, ${hoverRegion.mapY})`
                        : "Click a region to select"}
                </span>
                <div className="worldmap-location-select">
                    <OsrsSelect
                        options={locationOptions}
                        onChange={onLocationSelected}
                    ></OsrsSelect>
                </div>
                <span className="worldmap-zoom-buttons flex align-right">
                    <div className="worldmap-zoom-button worldmap-zoom-out" onClick={zoomOut}></div>
                    <div className="worldmap-zoom-button worldmap-zoom-in" onClick={zoomIn}></div>
                </span>
            </div>
        </div>
    );
});
