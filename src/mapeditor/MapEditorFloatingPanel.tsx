import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { GripHorizontal } from "lucide-react";

import { cn } from "../util/cn";

export type MapEditorFloatingPanelRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export interface MapEditorFloatingPanelProps {
    title: string;
    visible: boolean;
    rect: MapEditorFloatingPanelRect;
    onRectChange: (rect: MapEditorFloatingPanelRect) => void;
    minWidth?: number;
    minHeight?: number;
    className?: string;
    headerHint?: string;
    headerActions?: ReactNode;
    children: ReactNode;
}

const DEFAULT_MIN_WIDTH = 260;
const DEFAULT_MIN_HEIGHT = 220;

function clampRect(
    rect: MapEditorFloatingPanelRect,
    minWidth: number,
    minHeight: number,
    bounds?: DOMRect | null,
): MapEditorFloatingPanelRect {
    const width = Math.max(minWidth, rect.width);
    const height = Math.max(minHeight, rect.height);
    if (!bounds) {
        return { ...rect, width, height };
    }
    const maxX = Math.max(0, bounds.width - width);
    const maxY = Math.max(0, bounds.height - height);
    return {
        x: Math.min(Math.max(0, rect.x), maxX),
        y: Math.min(Math.max(0, rect.y), maxY),
        width: Math.min(width, bounds.width),
        height: Math.min(height, bounds.height),
    };
}

export function MapEditorFloatingPanel({
    title,
    visible,
    rect,
    onRectChange,
    minWidth = DEFAULT_MIN_WIDTH,
    minHeight = DEFAULT_MIN_HEIGHT,
    className,
    headerHint,
    headerActions,
    children,
}: MapEditorFloatingPanelProps): JSX.Element | null {
    const panelRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(
        null,
    );
    const resizeRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        origW: number;
        origH: number;
    } | null>(null);

    const boundsEl = useCallback((): DOMRect | null => {
        const panel = panelRef.current;
        return panel?.offsetParent instanceof HTMLElement ? panel.offsetParent.getBoundingClientRect() : null;
    }, []);

    const onDragPointerDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            dragRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                origX: rect.x,
                origY: rect.y,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
        },
        [rect.x, rect.y],
    );

    const onDragPointerMove = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }
            event.preventDefault();
            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;
            onRectChange(
                clampRect(
                    {
                        ...rect,
                        x: drag.origX + dx,
                        y: drag.origY + dy,
                    },
                    minWidth,
                    minHeight,
                    boundsEl(),
                ),
            );
        },
        [boundsEl, minHeight, minWidth, onRectChange, rect],
    );

    const onDragPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }, []);

    const onResizePointerDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            resizeRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                origW: rect.width,
                origH: rect.height,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
        },
        [rect.height, rect.width],
    );

    const onResizePointerMove = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const resize = resizeRef.current;
            if (!resize || resize.pointerId !== event.pointerId) {
                return;
            }
            event.preventDefault();
            const dx = event.clientX - resize.startX;
            const dy = event.clientY - resize.startY;
            onRectChange(
                clampRect(
                    {
                        ...rect,
                        width: resize.origW + dx,
                        height: resize.origH + dy,
                    },
                    minWidth,
                    minHeight,
                    boundsEl(),
                ),
            );
        },
        [boundsEl, minHeight, minWidth, onRectChange, rect],
    );

    const onResizePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const resize = resizeRef.current;
        if (!resize || resize.pointerId !== event.pointerId) {
            return;
        }
        resizeRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }, []);

    if (!visible) {
        return null;
    }

    return (
        <div
            ref={panelRef}
            className={cn(
                "pointer-events-auto absolute z-40 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border/80 bg-card/95 shadow-xl backdrop-blur-sm",
                className,
            )}
            style={{
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
            }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div
                className="flex shrink-0 cursor-move items-center gap-2 border-b border-border/70 bg-muted/40 px-3 py-2 select-none"
                onPointerDown={onDragPointerDown}
                onPointerMove={onDragPointerMove}
                onPointerUp={onDragPointerUp}
                onPointerCancel={onDragPointerUp}
            >
                <GripHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-tight text-foreground">
                    {title}
                </span>
                {headerActions}
                {headerHint ? (
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{headerHint}</span>
                ) : null}
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            <div
                className="absolute right-0 bottom-0 z-10 size-4 cursor-nwse-resize"
                aria-hidden
                onPointerDown={onResizePointerDown}
                onPointerMove={onResizePointerMove}
                onPointerUp={onResizePointerUp}
                onPointerCancel={onResizePointerUp}
            >
                <svg viewBox="0 0 16 16" className="size-full text-muted-foreground/70">
                    <path
                        fill="currentColor"
                        d="M14 14h-2v-2h2v2zm-4 0h-2v-2h2v2zm-4 0H4v-2h2v2zm8-4h-2V8h2v2zm-4 0h-2V8h2v2zm-4 0H4V8h2v2zm8-4h-2V4h2v2zm-4 0h-2V4h2v2z"
                    />
                </svg>
            </div>
        </div>
    );
}
