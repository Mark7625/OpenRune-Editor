import {
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
} from "react";

/** Minimal top padding for floating panels in the workbench layer. */
export const MAP_EDITOR_WORKBENCH_FLOATING_TOP_INSET = 8;

export type MapEditorFloatingLayerSize = {
    width: number;
    height: number;
};

export type MapEditorFloatingLayerPosition = {
    x: number;
    y: number;
};

export function clampPositionInWorkbenchFloatingLayer(
    position: MapEditorFloatingLayerPosition,
    panelWidth: number,
    panelHeight: number,
    layerWidth: number,
    layerHeight: number,
    topInset = MAP_EDITOR_WORKBENCH_FLOATING_TOP_INSET,
): MapEditorFloatingLayerPosition {
    if (layerWidth <= 0 || layerHeight <= 0) {
        return {
            x: Math.max(0, position.x),
            y: Math.max(topInset, position.y),
        };
    }
    const maxX = Math.max(0, layerWidth - panelWidth);
    const maxY = Math.max(topInset, layerHeight - panelHeight);
    return {
        x: Math.min(Math.max(0, position.x), maxX),
        y: Math.min(Math.max(topInset, position.y), maxY),
    };
}

export function floatingLayerPositionsEqual(
    a: MapEditorFloatingLayerPosition,
    b: MapEditorFloatingLayerPosition,
): boolean {
    return a.x === b.x && a.y === b.y;
}

export function useWorkbenchFloatingLayerSize(
    layerRef: RefObject<HTMLElement | null>,
): MapEditorFloatingLayerSize {
    const [size, setSize] = useState<MapEditorFloatingLayerSize>({ width: 0, height: 0 });

    const refresh = useCallback(() => {
        const el = layerRef.current;
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
    }, [layerRef]);

    useLayoutEffect(() => {
        refresh();
        const el = layerRef.current;
        if (!el) {
            return;
        }
        const resizeObserver = new ResizeObserver(refresh);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, [refresh, layerRef]);

    return size;
}

export function useWorkbenchFloatingPanelDrag({
    position,
    onPositionChange,
    panelRef,
    layerSize,
    disabled = false,
}: {
    position: MapEditorFloatingLayerPosition;
    onPositionChange: (position: MapEditorFloatingLayerPosition) => void;
    panelRef: RefObject<HTMLElement | null>;
    layerSize: MapEditorFloatingLayerSize;
    disabled?: boolean;
}): {
    onDragPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    isDraggingRef: RefObject<boolean>;
} {
    const isDraggingRef = useRef(false);
    const positionRef = useRef(position);
    positionRef.current = position;

    const commitPosition = useCallback(
        (x: number, y: number) => {
            const el = panelRef.current;
            const w = el?.offsetWidth ?? 0;
            const h = el?.offsetHeight ?? 0;
            const next = clampPositionInWorkbenchFloatingLayer(
                { x, y },
                w,
                h,
                layerSize.width,
                layerSize.height,
            );
            if (!floatingLayerPositionsEqual(next, positionRef.current)) {
                onPositionChange(next);
            }
        },
        [layerSize.height, layerSize.width, onPositionChange, panelRef],
    );

    const onDragPointerDown = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            if (disabled || event.button !== 0) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            isDraggingRef.current = true;
            const pointerId = event.pointerId;
            const startX = event.clientX;
            const startY = event.clientY;
            const origX = positionRef.current.x;
            const origY = positionRef.current.y;

            const onMove = (moveEvent: PointerEvent) => {
                if (moveEvent.pointerId !== pointerId) {
                    return;
                }
                moveEvent.preventDefault();
                commitPosition(
                    origX + (moveEvent.clientX - startX),
                    origY + (moveEvent.clientY - startY),
                );
            };
            const onUp = (upEvent: PointerEvent) => {
                if (upEvent.pointerId !== pointerId) {
                    return;
                }
                isDraggingRef.current = false;
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.removeEventListener("pointercancel", onUp);
            };

            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
            document.addEventListener("pointercancel", onUp);
        },
        [commitPosition, disabled],
    );

    return { onDragPointerDown, isDraggingRef };
}

/** Default floating position anchored toward bottom-left of the workbench layer. */
export function getWorkbenchFloatingFallbackPosition(
    layerHeight: number,
    panelHeight: number,
    topInset = MAP_EDITOR_WORKBENCH_FLOATING_TOP_INSET,
): MapEditorFloatingLayerPosition {
    return {
        x: 12,
        y: Math.max(topInset, layerHeight - panelHeight - 12),
    };
}
