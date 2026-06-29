import {
    useCallback,
    useLayoutEffect,
    useRef,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react";
import { GripHorizontal, X } from "lucide-react";

import { Button } from "../components/ui/button";
import { cn } from "../util/cn";
import { mapEditorPanelChromeClass } from "./map-editor-workbench-chrome";
import {
    clampPositionInWorkbenchFloatingLayer,
    floatingLayerPositionsEqual,
    useWorkbenchFloatingLayerSize,
    useWorkbenchFloatingPanelDrag,
    type MapEditorFloatingLayerPosition,
} from "./map-editor-workbench-floating-layer";
import { useMapEditorWorkbenchFloatingLayerRef } from "./map-editor-workbench-floating-layer-context";

export interface MapEditorFloatingWindowProps {
    title: string;
    visible: boolean;
    position: MapEditorFloatingLayerPosition;
    onPositionChange: (position: MapEditorFloatingLayerPosition) => void;
    onClose?: () => void;
    onContextMenu?: (event: ReactMouseEvent) => void;
    contextMenuPortal?: ReactNode;
    resizable?: boolean;
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    onSizeChange?: (size: { width: number; height: number }) => void;
    autoSize?: boolean;
    className?: string;
    children: ReactNode;
}

export function MapEditorFloatingWindow({
    title,
    visible,
    position,
    onPositionChange,
    onClose,
    onContextMenu,
    contextMenuPortal,
    resizable = false,
    width,
    height,
    minWidth = 240,
    minHeight = 160,
    onSizeChange,
    autoSize = false,
    className,
    children,
}: MapEditorFloatingWindowProps): JSX.Element | null {
    const layerRef = useMapEditorWorkbenchFloatingLayerRef();
    const panelRef = useRef<HTMLDivElement>(null);
    const resizeRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        origW: number;
        origH: number;
    } | null>(null);
    const layerSize = useWorkbenchFloatingLayerSize(layerRef ?? { current: null });

    const { onDragPointerDown, isDraggingRef } = useWorkbenchFloatingPanelDrag({
        position,
        onPositionChange,
        panelRef,
        layerSize,
    });

    useLayoutEffect(() => {
        if (!visible || isDraggingRef.current || layerSize.width <= 0 || layerSize.height <= 0) {
            return;
        }
        const el = panelRef.current;
        if (!el) {
            return;
        }
        const next = clampPositionInWorkbenchFloatingLayer(
            position,
            el.offsetWidth,
            el.offsetHeight,
            layerSize.width,
            layerSize.height,
        );
        if (!floatingLayerPositionsEqual(next, position)) {
            onPositionChange(next);
        }
    }, [isDraggingRef, layerSize.height, layerSize.width, onPositionChange, position, visible, width, height]);

    const onResizePointerDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (event.button !== 0 || !resizable) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            resizeRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                origW: width ?? panelRef.current?.offsetWidth ?? minWidth,
                origH: height ?? panelRef.current?.offsetHeight ?? minHeight,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
        },
        [height, minHeight, minWidth, resizable, width],
    );

    const onResizePointerMove = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const resize = resizeRef.current;
            if (!resize || resize.pointerId !== event.pointerId || !onSizeChange) {
                return;
            }
            event.preventDefault();
            const nextW = Math.max(minWidth, resize.origW + (event.clientX - resize.startX));
            const nextH = Math.max(minHeight, resize.origH + (event.clientY - resize.startY));
            onSizeChange({ width: nextW, height: nextH });
        },
        [minHeight, minWidth, onSizeChange],
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
        <>
            {contextMenuPortal}
            <div
                ref={panelRef}
                className={cn(
                    mapEditorPanelChromeClass,
                    "pointer-events-auto absolute z-[45] flex min-h-0 min-w-0 flex-col overflow-hidden",
                    className,
                )}
                style={{
                    left: position.x,
                    top: position.y,
                    width: autoSize ? undefined : width,
                    height: autoSize ? undefined : height,
                    minWidth,
                    maxWidth: layerSize.width > 0 ? layerSize.width - 16 : undefined,
                }}
                onContextMenu={onContextMenu}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <div
                    className="flex shrink-0 cursor-move items-center gap-1 border-b border-border/70 bg-muted/40 px-1.5 py-1 select-none"
                    onPointerDown={onDragPointerDown}
                >
                    <GripHorizontal className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-tight text-foreground">
                        {title}
                    </span>
                    {onClose ? (
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-6 shrink-0 hover:bg-destructive/15 hover:text-destructive"
                            aria-label="Close panel"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={onClose}
                        >
                            <X className="size-3.5" aria-hidden />
                        </Button>
                    ) : null}
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
                {resizable && !autoSize ? (
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
                ) : null}
            </div>
        </>
    );
}
