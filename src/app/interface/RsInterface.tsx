"use client";

import Image from "next/image";
import * as React from "react";



import { InterfaceManager, Interpreter, nudgeScrollY, setInterfaceMousePosition } from "../../lib/interfaces/InterfaceManager";
import { ComponentType } from "../../rs/config/components/ComponentType";
import { InterfaceType } from "../../rs/config/components/InterfaceType";


const FIXED_CANVAS_WIDTH = 765;
const FIXED_CANVAS_HEIGHT = 503;
const FIXED_VIEWPORT_WIDTH = 512;
const FIXED_VIEWPORT_HEIGHT = 334;
const FIXED_VIEWPORT_OFFSET_X = 4;
const FIXED_VIEWPORT_OFFSET_Y = 4;

export type RsInterfaceMode = "fixed" | "resizable";

export type RsInterfaceProps = {
    interfaceId: number | null;
    mode: RsInterfaceMode;
    isInterfaceLoaded?: boolean;
    interfaceData?: InterfaceType | null;
    revision?: string | number;
    cacheHeaders?: HeadersInit;
    className?: string;
    viewportColor?: string;
    showOverlays?: boolean;
    showViewportBorder?: boolean;
    showPixelGrid?: boolean;
    selectedComponentId?: number | null;
    selectedComponent?: ComponentType | null;
    interactiveMode?: boolean;
};

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>): {
    width: number;
    height: number;
} {
    const [size, setSize] = React.useState({ width: 0, height: 0 });

    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            setSize({
                width: Math.floor(entry.contentRect.width),
                height: Math.floor(entry.contentRect.height),
            });
        });
        observer.observe(el);
        setSize({ width: Math.floor(el.clientWidth), height: Math.floor(el.clientHeight) });
        return () => observer.disconnect();
    }, [ref]);

    return size;
}

function componentRuntimeId(comp: ComponentType): number {
    return comp.internalId;
}


function canvasLocalFromClient(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width || 1;
    const scaleY = canvas.height / rect.height || 1;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
    };
}



function collectAllComponents(entry: InterfaceType): ComponentType[] {
    const out: ComponentType[] = [];
    const visit = (c: ComponentType) => {
        out.push(c);
    };
    for (const c of Object.values(entry.components)) {
        visit(c);
    }
    return out;
}


function useInterfaceRenderer(
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    interfaceId: number | null,
    interfaceData: InterfaceType | null | undefined,
    revision: string | number,
    viewportOffsetX: number,
    viewportOffsetY: number,
    viewportWidth: number,
    viewportHeight: number,
    selectedComponentId: number | null,
    selectedComponent: ComponentType | null,
    redrawTick: number,
    managerOutRef: React.MutableRefObject<InterfaceManager | null>,
) {
    const renderRedrawRef = React.useRef<(() => void) | null>(null);
    const interfaceDataRef = React.useRef(interfaceData);
    const interfaceIdRef = React.useRef(interfaceId);
    React.useLayoutEffect(() => {
        interfaceDataRef.current = interfaceData;
        interfaceIdRef.current = interfaceId;
    });

    React.useEffect(() => {
        const canvas = canvasRef.current;

        if (!canvas || !interfaceData || interfaceId == null) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const manager = new InterfaceManager(ctx, revision);
        managerOutRef.current = manager;
        render(ctx, manager);

        function render(ctx: CanvasRenderingContext2D, mgr: InterfaceManager) {
            //setCs1SimState(cs1SimStateRef.current ?? null);
            const data = interfaceDataRef.current;
            const iid = interfaceIdRef.current;
            if (!data || iid == null) {
                return;
            }

            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, canvas!.width, canvas!.height);

            mgr.drawWidgets(
                data,
                iid,
                viewportOffsetX,
                viewportOffsetY,
                viewportOffsetX + viewportWidth,
                viewportOffsetY + viewportHeight,
                viewportOffsetX,
                viewportOffsetY,
                -1,
            );

            if (selectedComponent != null || selectedComponentId != null) {
                const bounds =
                    selectedComponent != null
                        ? mgr.getComponentDrawBoundsFor(selectedComponent)
                        : mgr.getComponentDrawBounds(selectedComponentId!);
                if (bounds) {
                    ctx.save();
                    ctx.globalAlpha = 1;
                    ctx.strokeStyle = "#00e5ff";
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 2]);
                    ctx.strokeRect(bounds.x + 0.5, bounds.y + 0.5, bounds.width, bounds.height);
                    ctx.fillStyle = "rgba(0,229,255,0.15)";
                    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
                    ctx.restore();
                }
            }
        }

        let rafId: number | null = null;
        const frame = () => {
            render(ctx, manager);
            rafId = window.requestAnimationFrame(frame);
        };

        render(ctx, manager);
        rafId = window.requestAnimationFrame(frame);

        renderRedrawRef.current = () => {
            render(ctx, manager);
        };

        return () => {
            if (rafId != null) {
                window.cancelAnimationFrame(rafId);
            }
            managerOutRef.current = null;
            renderRedrawRef.current = null;
        };
    }, [
        canvasRef,
        interfaceId,
        interfaceData,
        revision,
        viewportOffsetX,
        viewportOffsetY,
        viewportWidth,
        viewportHeight,
        selectedComponentId,
        selectedComponent,
        managerOutRef
    ]);

    React.useEffect(() => {
        if (redrawTick === 0) return;
        renderRedrawRef.current?.();
    }, [redrawTick]);
}

export function RsInterface({
    interfaceId,
    mode,
    interfaceData,
    revision = "latest",
    className,
    viewportColor = "rgb(76,68,32)",
    showOverlays = true,
    showViewportBorder = false,
    showPixelGrid = false,
    selectedComponentId = null,
    selectedComponent = null,
    interactiveMode = false
}: RsInterfaceProps) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const managerOutRef = React.useRef<InterfaceManager | null>(null);

    const [redrawTick, setRedrawTick] = React.useState(0);
    const bumpRedraw = React.useCallback(() => {
        setRedrawTick((t) => t + 1);
    }, []);
    const hoverPickRef = React.useRef<ComponentType | null>(null);
    const [displayScale, setDisplayScale] = React.useState<{ x: number; y: number }>({
        x: 1,
        y: 1,
    });
    const { width: containerWidth, height: containerHeight } = useContainerSize(containerRef);

    const viewportWidth = mode === "fixed" ? FIXED_VIEWPORT_WIDTH : containerWidth;
    const viewportHeight = mode === "fixed" ? FIXED_VIEWPORT_HEIGHT : containerHeight;
    const viewportOffsetX = mode === "fixed" ? FIXED_VIEWPORT_OFFSET_X : 0;
    const viewportOffsetY = mode === "fixed" ? FIXED_VIEWPORT_OFFSET_Y : 0;

    const canvasW = mode === "fixed" ? FIXED_CANVAS_WIDTH : containerWidth;
    const canvasH = mode === "fixed" ? FIXED_CANVAS_HEIGHT : containerHeight;

    const fixedStyle: React.CSSProperties =
        mode === "fixed" ? { width: FIXED_CANVAS_WIDTH, height: FIXED_CANVAS_HEIGHT } : {};

    useInterfaceRenderer(
        canvasRef,
        interfaceId,
        interfaceData,
        revision,
        viewportOffsetX,
        viewportOffsetY,
        viewportWidth,
        viewportHeight,
        selectedComponentId,
        selectedComponent,
        redrawTick,
        managerOutRef
    );

    React.useEffect(() => {
        if (interactiveMode) return;
        Interpreter.mousedOverWidgetIf1 = null;
        Interpreter.clickedWidget = null;
        hoverPickRef.current = null;
    }, [interactiveMode]);

    React.useEffect(() => {
        if (!interactiveMode || !interfaceData || interfaceId == null) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onMove = (e: MouseEvent) => {
            const { x, y } = canvasLocalFromClient(canvas, e.clientX, e.clientY);
            setInterfaceMousePosition(x, y);
            const mgr = managerOutRef.current;
            if (!mgr) return;
            const next = pickComponentAt(interfaceData, x, y, mgr);
            if (next !== hoverPickRef.current) {
                hoverPickRef.current = next;
                Interpreter.mousedOverWidgetIf1 = next;
                bumpRedraw();
            }
        };

        const onLeave = () => {
            setInterfaceMousePosition(0, 0);
            if (hoverPickRef.current !== null) {
                hoverPickRef.current = null;
                Interpreter.mousedOverWidgetIf1 = null;
                bumpRedraw();
            }
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const mgr = managerOutRef.current;
            if (!mgr) return;
            const { x, y } = canvasLocalFromClient(canvas, e.clientX, e.clientY);
            const picked = pickScrollableAt(interfaceData, x, y, mgr);
            if (!picked) return;
            nudgeScrollY(picked.runtimeId, e.deltaY, picked.scrollHeight, picked.tempHeight);
            bumpRedraw();
        };

        const onDown = (e: MouseEvent) => {
            const mgr = managerOutRef.current;
            if (!mgr) return;
            const { x, y } = canvasLocalFromClient(canvas, e.clientX, e.clientY);
            Interpreter.clickedWidget = pickComponentAt(interfaceData, x, y, mgr);
            bumpRedraw();
        };

        const onUp = () => {
            if (Interpreter.clickedWidget !== null) {
                Interpreter.clickedWidget = null;
                bumpRedraw();
            }
        };

        canvas.addEventListener("mousemove", onMove);
        canvas.addEventListener("mouseleave", onLeave);
        canvas.addEventListener("wheel", onWheel, { passive: false });
        canvas.addEventListener("mousedown", onDown);
        canvas.addEventListener("mouseup", onUp);
        window.addEventListener("mouseup", onUp);
        return () => {
            canvas.removeEventListener("mousemove", onMove);
            canvas.removeEventListener("mouseleave", onLeave);
            canvas.removeEventListener("wheel", onWheel);
            canvas.removeEventListener("mousedown", onDown);
            canvas.removeEventListener("mouseup", onUp);
            window.removeEventListener("mouseup", onUp);
        };
    }, [interactiveMode, interfaceData, interfaceId, bumpRedraw]);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || mode !== "fixed") return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;
        setDisplayScale({ x: scaleX, y: scaleY });
    }, [mode, canvasW, canvasH]);

    const handleCanvasMouseMove = React.useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const c = e.currentTarget;
        const { x, y } = canvasLocalFromClient(c, e.clientX, e.clientY);
        setInterfaceMousePosition(x, y);
    }, []);

    return (
        <div
            ref={containerRef}
            className={`relative overflow-hidden bg-black ${className ?? ""}`}
            style={{
                ...fixedStyle,
                flexShrink: 0,
                minWidth: mode === "fixed" ? FIXED_CANVAS_WIDTH : undefined,
                minHeight: mode === "fixed" ? FIXED_CANVAS_HEIGHT : undefined,
            }}
            data-display-scale={`${displayScale.x.toFixed(3)}x${displayScale.y.toFixed(3)}`}
        >
            <div
                className="absolute z-0"
                style={{
                    left: viewportOffsetX,
                    top: viewportOffsetY,
                    width: viewportWidth,
                    height: viewportHeight,
                    backgroundColor: viewportColor,
                    backgroundImage: showPixelGrid
                        ? "linear-gradient(to right, rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.16) 1px, transparent 1px)"
                        : "none",
                    backgroundSize: showPixelGrid ? "4px 4px" : undefined,
                    border: showViewportBorder ? "1px solid rgba(255,255,255,0.45)" : "none",
                }}
            />

            <canvas
                ref={canvasRef}
                width={canvasW}
                height={canvasH}
                onMouseMove={interactiveMode ? undefined : handleCanvasMouseMove}
                className={`absolute left-0 top-0 z-10 ${
                    interactiveMode ? "" : "pointer-events-none"
                }`}
                style={{
                    imageRendering: "pixelated",
                    width: `${canvasW}px`,
                    height: `${canvasH}px`,
                    minWidth: `${canvasW}px`,
                    minHeight: `${canvasH}px`,
                    maxWidth: "none",
                    maxHeight: "none",
                    flexShrink: 0,
                }}
            />

            {showOverlays && mode === "fixed" ? (
                <Image
                    src="/ui/fixed_ui.png"
                    alt="Fixed UI overlay"
                    width={FIXED_CANVAS_WIDTH}
                    height={FIXED_CANVAS_HEIGHT}
                    className="pointer-events-none absolute left-0 top-0 z-20"
                    priority
                    unoptimized
                />
            ) : showOverlays ? (
                <>
                    <Image
                        src="/ui/resized_chat.png"
                        alt="Chat overlay"
                        className="pointer-events-none absolute bottom-0 left-0 z-20 object-contain"
                        width={519}
                        height={142}
                        unoptimized
                    />
                    <Image
                        src="/ui/resized_map.png"
                        alt="Map overlay"
                        className="pointer-events-none absolute right-0 top-0 z-20 object-contain"
                        width={211}
                        height={194}
                        unoptimized
                    />
                    <Image
                        src="/ui/resized_tab.png"
                        alt="Tab overlay"
                        className="pointer-events-none absolute bottom-0 right-0 z-20 object-contain"
                        width={249}
                        height={336}
                        unoptimized
                    />
                </>
            ) : null}
        </div>
    );
}
