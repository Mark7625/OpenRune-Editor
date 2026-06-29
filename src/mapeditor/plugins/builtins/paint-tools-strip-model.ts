import type { IEditorPluginHost } from "../editor-plugin-host";
import {
    clampPaintToolsStripPositionToBounds,
    PAINT_TOOLS_STRIP_VIEWPORT_DEFAULT,
    type PaintToolsStripPosition,
} from "../../paint-tools-strip-floating-bounds";

export type { PaintToolsStripPosition };

export type PaintToolsStripOrientation = "vertical" | "horizontal";

export type PaintToolsStripDockSide = "none" | "left";

type PaintToolsStripState = {
    floatingPanelVisible: boolean;
    position: PaintToolsStripPosition;
    orientation: PaintToolsStripOrientation;
    dockSide: PaintToolsStripDockSide;
};

export type PaintToolsStripModel = PaintToolsStripState & {
    setFloatingPanelVisible: (visible: boolean) => void;
    toggleFloatingPanelVisible: () => void;
    setPosition: (position: PaintToolsStripPosition) => void;
    setOrientation: (orientation: PaintToolsStripOrientation) => void;
    toggleOrientation: () => void;
    setDockSide: (dockSide: PaintToolsStripDockSide) => void;
    toggleDockSide: () => void;
};

const PAINT_TOOLS_STRIP_STORAGE_KEY = "map-editor-paint-tools-strip-v3";

function getFallbackDefaultPosition(): PaintToolsStripPosition {
    return { ...PAINT_TOOLS_STRIP_VIEWPORT_DEFAULT };
}

const paintToolsStripStateByHost = new WeakMap<IEditorPluginHost, PaintToolsStripState>();

function parseDockSide(value: unknown): PaintToolsStripDockSide {
    return value === "left" ? "left" : "none";
}

function loadLegacyPaintToolsStripState(raw: string): PaintToolsStripState | null {
    try {
        const parsed = JSON.parse(raw) as Partial<{
            visible: boolean;
            orientation: PaintToolsStripOrientation;
            position: Partial<PaintToolsStripPosition>;
            dockSide: PaintToolsStripDockSide;
            rect: { x?: number; y?: number };
        }>;
        const fallback = getFallbackDefaultPosition();
        return {
            floatingPanelVisible: parsed.visible !== false,
            orientation: parsed.orientation === "horizontal" ? "horizontal" : "vertical",
            dockSide: parseDockSide(parsed.dockSide),
            position: {
                x:
                    typeof parsed.position?.x === "number"
                        ? parsed.position.x
                        : typeof parsed.rect?.x === "number"
                          ? parsed.rect.x
                          : fallback.x,
                y:
                    typeof parsed.position?.y === "number"
                        ? parsed.position.y
                        : typeof parsed.rect?.y === "number"
                          ? parsed.rect.y
                          : fallback.y,
            },
        };
    } catch {
        return null;
    }
}

function loadPaintToolsStripState(): PaintToolsStripState {
    const fallbackState: PaintToolsStripState = {
        floatingPanelVisible: true,
        position: getFallbackDefaultPosition(),
        orientation: "vertical",
        dockSide: "none",
    };
    if (typeof localStorage === "undefined") {
        return fallbackState;
    }
    try {
        const raw = localStorage.getItem(PAINT_TOOLS_STRIP_STORAGE_KEY);
        if (raw) {
            const parsed = loadLegacyPaintToolsStripState(raw);
            return parsed ?? fallbackState;
        }
        for (const legacyKey of ["map-editor-paint-tools-strip-v2", "map-editor-paint-tools-strip-v1"]) {
            const legacyRaw = localStorage.getItem(legacyKey);
            if (legacyRaw) {
                const parsed = loadLegacyPaintToolsStripState(legacyRaw);
                if (parsed) {
                    return parsed;
                }
            }
        }
        return fallbackState;
    } catch {
        return fallbackState;
    }
}

function persistPaintToolsStripState(state: PaintToolsStripState): void {
    if (typeof localStorage === "undefined") {
        return;
    }
    try {
        localStorage.setItem(
            PAINT_TOOLS_STRIP_STORAGE_KEY,
            JSON.stringify({
                visible: state.floatingPanelVisible,
                orientation: state.orientation,
                position: state.position,
                dockSide: state.dockSide,
            }),
        );
    } catch {
        /* ignore */
    }
}

function getOrCreateState(host: IEditorPluginHost): PaintToolsStripState {
    const existing = paintToolsStripStateByHost.get(host);
    if (existing) {
        return existing;
    }
    const next = loadPaintToolsStripState();
    paintToolsStripStateByHost.set(host, next);
    return next;
}

function notify(host: IEditorPluginHost): void {
    host.notifyWorkbenchStateChanged();
}

export function getPaintToolsStripModel(host: IEditorPluginHost): PaintToolsStripModel {
    const state = getOrCreateState(host);
    return {
        floatingPanelVisible: state.floatingPanelVisible,
        position: state.position,
        orientation: state.orientation,
        dockSide: state.dockSide,
        setFloatingPanelVisible(visible) {
            state.floatingPanelVisible = visible;
            persistPaintToolsStripState(state);
            notify(host);
        },
        toggleFloatingPanelVisible() {
            state.floatingPanelVisible = !state.floatingPanelVisible;
            persistPaintToolsStripState(state);
            notify(host);
        },
        setPosition(position) {
            state.position = { ...position };
            persistPaintToolsStripState(state);
            notify(host);
        },
        setOrientation(orientation) {
            if (state.orientation === orientation) {
                return;
            }
            state.orientation = orientation;
            persistPaintToolsStripState(state);
            notify(host);
        },
        toggleOrientation() {
            state.orientation = state.orientation === "vertical" ? "horizontal" : "vertical";
            persistPaintToolsStripState(state);
            notify(host);
        },
        setDockSide(dockSide) {
            if (state.dockSide === dockSide) {
                return;
            }
            const wasDocked = state.dockSide === "left";
            state.dockSide = dockSide;
            if (dockSide === "left") {
                state.orientation = "vertical";
            } else if (wasDocked) {
                state.position = getFallbackDefaultPosition();
            }
            persistPaintToolsStripState(state);
            notify(host);
        },
        toggleDockSide() {
            const next = state.dockSide === "left" ? "none" : "left";
            if (state.dockSide === next) {
                return;
            }
            const wasDocked = state.dockSide === "left";
            state.dockSide = next;
            if (next === "left") {
                state.orientation = "vertical";
            } else if (wasDocked) {
                state.position = getFallbackDefaultPosition();
            }
            persistPaintToolsStripState(state);
            notify(host);
        },
    };
}

export function bootstrapPaintToolsStripModel(host: IEditorPluginHost): void {
    getOrCreateState(host);
}

export function getPaintToolsStripWorkbenchSnapshot(host: IEditorPluginHost): string {
    const state = getOrCreateState(host);
    return JSON.stringify({
        visible: state.floatingPanelVisible,
        orientation: state.orientation,
        position: state.position,
        dockSide: state.dockSide,
    });
}

export function clampPaintToolsStripPosition(
    position: PaintToolsStripPosition,
    panelWidth: number,
    panelHeight: number,
): PaintToolsStripPosition {
    return clampPaintToolsStripPositionToBounds(position, panelWidth, panelHeight);
}
