import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

export type PaintToolsStripPosition = {
    x: number;
    y: number;
};

/** Default undocked position: top-left of workbench floating layer (below sticky nav). */
export const PAINT_TOOLS_STRIP_VIEWPORT_DEFAULT: PaintToolsStripPosition = { x: 8, y: 40 };

export function clampPaintToolsStripPositionInViewport(
    position: PaintToolsStripPosition,
    panelWidth: number,
    panelHeight: number,
    viewportWidth: number,
    viewportHeight: number,
): PaintToolsStripPosition {
    const maxX = Math.max(0, viewportWidth - panelWidth);
    const maxY = Math.max(0, viewportHeight - panelHeight);
    return {
        x: Math.min(Math.max(0, position.x), maxX),
        y: Math.min(Math.max(0, position.y), maxY),
    };
}

export function positionsEqual(a: PaintToolsStripPosition, b: PaintToolsStripPosition): boolean {
    return a.x === b.x && a.y === b.y;
}

export function usePaintToolsStripViewportSize(
    viewportRef: RefObject<HTMLElement | null>,
): { width: number; height: number } {
    const [size, setSize] = useState({ width: 0, height: 0 });

    const refresh = useCallback(() => {
        const el = viewportRef.current;
        if (!el) {
            return;
        }
        setSize((prev) => {
            const width = el.clientWidth;
            const height = el.clientHeight;
            if (prev.width === width && prev.height === height) {
                return prev;
            }
            return { width, height };
        });
    }, [viewportRef]);

    useLayoutEffect(() => {
        refresh();
        const el = viewportRef.current;
        if (!el) {
            return;
        }
        const resizeObserver = new ResizeObserver(refresh);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, [refresh, viewportRef]);

    return size;
}

export function clampPaintToolsStripPositionToBounds(
    position: PaintToolsStripPosition,
    panelWidth: number,
    panelHeight: number,
): PaintToolsStripPosition {
    return clampPaintToolsStripPositionInViewport(
        position,
        panelWidth,
        panelHeight,
        typeof window !== "undefined" ? window.innerWidth : panelWidth,
        typeof window !== "undefined" ? window.innerHeight : panelHeight,
    );
}

export function getDefaultPaintToolsStripPosition(): PaintToolsStripPosition {
    return { ...PAINT_TOOLS_STRIP_VIEWPORT_DEFAULT };
}
