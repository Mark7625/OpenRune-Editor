import type { IEditorPluginHost } from "../editor-plugin-host";
import {
    clampPositionInWorkbenchFloatingLayer,
    type MapEditorFloatingLayerPosition,
} from "../../map-editor-workbench-floating-layer";
import {
    closeMapEditorExternalPanel,
    isMapEditorExternalPanelOpen,
    openMapEditorExternalPanel,
} from "../../map-editor-external-panel";

export type EditorBottomBarPosition = MapEditorFloatingLayerPosition;

export type EditorBottomBarPlacement = "docked" | "floating" | "external";

/** @deprecated Use placement === "docked" */
export type EditorBottomBarDockSide = "none" | "bottom";

type EditorBottomBarState = {
    floatingPanelVisible: boolean;
    placement: EditorBottomBarPlacement;
    placementBeforeExternal: EditorBottomBarPlacement | null;
    position: EditorBottomBarPosition;
    minimized: boolean;
    size: { width: number; height: number };
};

export type EditorBottomBarModel = EditorBottomBarState & {
    /** @deprecated Use placement */
    dockSide: EditorBottomBarDockSide;
    setFloatingPanelVisible: (visible: boolean) => void;
    toggleFloatingPanelVisible: () => void;
    setPosition: (position: EditorBottomBarPosition) => void;
    setPlacement: (placement: EditorBottomBarPlacement) => void;
    /** @deprecated Use setPlacement */
    setDockSide: (dockSide: EditorBottomBarDockSide) => void;
    /** @deprecated Use setPlacement */
    toggleDockSide: () => void;
    setMinimized: (minimized: boolean) => void;
    setSize: (size: { width: number; height: number }) => void;
};

const EDITOR_BOTTOM_BAR_STORAGE_KEY = "map-editor-bottom-bar-v2";

const DEFAULT_SIZE = { width: 288, height: 420 };

export function getEditorBottomBarFallbackPosition(): EditorBottomBarPosition {
    return { x: 12, y: 100_000 };
}

const editorBottomBarStateByHost = new WeakMap<IEditorPluginHost, EditorBottomBarState>();

function placementToDockSide(placement: EditorBottomBarPlacement): EditorBottomBarDockSide {
    return placement === "docked" ? "bottom" : "none";
}

function dockSideToPlacement(dockSide: EditorBottomBarDockSide): EditorBottomBarPlacement {
    return dockSide === "bottom" ? "docked" : "floating";
}

function loadEditorBottomBarState(): EditorBottomBarState {
    const fallbackState: EditorBottomBarState = {
        floatingPanelVisible: true,
        placement: "docked",
        placementBeforeExternal: null,
        position: getEditorBottomBarFallbackPosition(),
        minimized: false,
        size: { ...DEFAULT_SIZE },
    };
    if (typeof localStorage === "undefined") {
        return fallbackState;
    }
    try {
        const rawV2 = localStorage.getItem(EDITOR_BOTTOM_BAR_STORAGE_KEY);
        if (rawV2) {
            const parsed = JSON.parse(rawV2) as Partial<{
                visible: boolean;
                placement: EditorBottomBarPlacement;
                position: Partial<EditorBottomBarPosition>;
                minimized: boolean;
                size: Partial<{ width: number; height: number }>;
            }>;
            const fallback = getEditorBottomBarFallbackPosition();
            return {
                floatingPanelVisible: parsed.visible !== false,
                placement:
                    parsed.placement === "floating" || parsed.placement === "external"
                        ? parsed.placement
                        : "docked",
                placementBeforeExternal: null,
                position: {
                    x: typeof parsed.position?.x === "number" ? parsed.position.x : fallback.x,
                    y: typeof parsed.position?.y === "number" ? parsed.position.y : fallback.y,
                },
                minimized: parsed.minimized === true,
                size: {
                    width: typeof parsed.size?.width === "number" ? parsed.size.width : DEFAULT_SIZE.width,
                    height: typeof parsed.size?.height === "number" ? parsed.size.height : DEFAULT_SIZE.height,
                },
            };
        }
        const rawV1 = localStorage.getItem("map-editor-bottom-bar-v1");
        if (rawV1) {
            const parsed = JSON.parse(rawV1) as Partial<{
                visible: boolean;
                position: Partial<EditorBottomBarPosition>;
                dockSide: EditorBottomBarDockSide;
            }>;
            const fallback = getEditorBottomBarFallbackPosition();
            return {
                floatingPanelVisible: parsed.visible !== false,
                placement: parsed.dockSide === "bottom" ? "docked" : "floating",
                placementBeforeExternal: null,
                position: {
                    x: typeof parsed.position?.x === "number" ? parsed.position.x : fallback.x,
                    y: typeof parsed.position?.y === "number" ? parsed.position.y : fallback.y,
                },
                minimized: false,
                size: { ...DEFAULT_SIZE },
            };
        }
        return fallbackState;
    } catch {
        return fallbackState;
    }
}

function persistEditorBottomBarState(state: EditorBottomBarState): void {
    if (typeof localStorage === "undefined") {
        return;
    }
    try {
        localStorage.setItem(
            EDITOR_BOTTOM_BAR_STORAGE_KEY,
            JSON.stringify({
                visible: state.floatingPanelVisible,
                placement: state.placement,
                position: state.position,
                minimized: state.minimized,
                size: state.size,
            }),
        );
    } catch {
        /* ignore */
    }
}

function getOrCreateState(host: IEditorPluginHost): EditorBottomBarState {
    const existing = editorBottomBarStateByHost.get(host);
    if (existing) {
        return existing;
    }
    const next = loadEditorBottomBarState();
    editorBottomBarStateByHost.set(host, next);
    return next;
}

function notify(host: IEditorPluginHost): void {
    host.notifyWorkbenchStateChanged();
}

const BRUSH_EXTERNAL_PANEL_ID = "editor-brush-workspace";

function applyExternalWindow(state: EditorBottomBarState): void {
    if (state.placement === "external") {
        openMapEditorExternalPanel(BRUSH_EXTERNAL_PANEL_ID, {
            width: state.size.width,
            height: Math.max(280, state.size.height),
            title: "Brush workspace",
        });
        return;
    }
    if (isMapEditorExternalPanelOpen(BRUSH_EXTERNAL_PANEL_ID)) {
        closeMapEditorExternalPanel(BRUSH_EXTERNAL_PANEL_ID);
    }
}

export function getEditorBottomBarModel(host: IEditorPluginHost): EditorBottomBarModel {
    const state = getOrCreateState(host);
    return {
        floatingPanelVisible: state.floatingPanelVisible,
        placement: state.placement,
        position: state.position,
        minimized: state.minimized,
        size: state.size,
        dockSide: placementToDockSide(state.placement),
        setFloatingPanelVisible(visible) {
            state.floatingPanelVisible = visible;
            persistEditorBottomBarState(state);
            notify(host);
        },
        toggleFloatingPanelVisible() {
            state.floatingPanelVisible = !state.floatingPanelVisible;
            persistEditorBottomBarState(state);
            notify(host);
        },
        setPosition(position) {
            state.position = { ...position };
            persistEditorBottomBarState(state);
            notify(host);
        },
        setPlacement(placement) {
            if (state.placement === placement) {
                return;
            }
            const wasDocked = state.placement === "docked";
            if (state.placement === "external" && placement !== "external") {
                closeMapEditorExternalPanel(BRUSH_EXTERNAL_PANEL_ID);
                state.placementBeforeExternal = null;
            }
            if (placement === "external" && state.placement !== "external") {
                state.placementBeforeExternal =
                    state.placement === "docked" || state.placement === "floating" ? state.placement : "docked";
            }
            state.placement = placement;
            if (wasDocked || placement === "floating") {
                state.position = getEditorBottomBarFallbackPosition();
            }
            persistEditorBottomBarState(state);
            applyExternalWindow(state);
            notify(host);
        },
        setDockSide(dockSide) {
            this.setPlacement(dockSideToPlacement(dockSide));
        },
        toggleDockSide() {
            this.setPlacement(state.placement === "docked" ? "floating" : "docked");
        },
        setMinimized(minimized) {
            state.minimized = minimized;
            persistEditorBottomBarState(state);
            notify(host);
        },
        setSize(size) {
            state.size = { ...size };
            persistEditorBottomBarState(state);
            notify(host);
        },
    };
}

export function bootstrapEditorBottomBarModel(host: IEditorPluginHost): void {
    getOrCreateState(host);
}

export function getEditorBottomBarWorkbenchSnapshot(host: IEditorPluginHost): string {
    const state = getOrCreateState(host);
    return JSON.stringify({
        visible: state.floatingPanelVisible,
        placement: state.placement,
        position: state.position,
        minimized: state.minimized,
        size: state.size,
    });
}

export function clampEditorBottomBarPosition(
    position: EditorBottomBarPosition,
    panelWidth: number,
    panelHeight: number,
    layerWidth: number,
    layerHeight: number,
): EditorBottomBarPosition {
    return clampPositionInWorkbenchFloatingLayer(position, panelWidth, panelHeight, layerWidth, layerHeight);
}

export function syncEditorBottomBarExternalWindow(host: IEditorPluginHost): void {
    const state = getOrCreateState(host);
    if (
        state.placement === "external" &&
        state.floatingPanelVisible &&
        host.isWorkbenchUiPluginEnabled("brush_workspace") &&
        !isMapEditorExternalPanelOpen(BRUSH_EXTERNAL_PANEL_ID)
    ) {
        openMapEditorExternalPanel(BRUSH_EXTERNAL_PANEL_ID, {
            width: state.size.width,
            height: Math.max(280, state.size.height),
            title: "Brush workspace",
        });
    }
}

export function restoreEditorBottomBarFromExternal(host: IEditorPluginHost): void {
    const state = getOrCreateState(host);
    if (state.placement !== "external") {
        return;
    }
    const restore = state.placementBeforeExternal ?? "docked";
    state.placementBeforeExternal = null;
    state.placement = restore;
    if (restore === "floating") {
        state.position = getEditorBottomBarFallbackPosition();
    }
    persistEditorBottomBarState(state);
    notify(host);
}
