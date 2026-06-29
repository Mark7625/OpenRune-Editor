import {
    ALL_TILE_RENDER_FLAGS,
    TileRenderFlag,
    type TileRenderFlagDescriptor,
    TILE_RENDER_FLAG_DESCRIPTORS,
} from "../../../rs/map/TileRenderFlags";
import type { IEditorPluginHost } from "../editor-plugin-host";
import type { MapEditorFloatingPanelRect } from "../../MapEditorFloatingPanel";

const TILE_FLAGS_FLOATING_PANEL_STORAGE_KEY = "map-editor-tile-flags-floating-panel-v1";

type TileFlagsToolState = {
    showFlags: Set<TileRenderFlag>;
    paintFlags: Set<TileRenderFlag>;
    floatingPanelVisible: boolean;
    floatingPanelRect: MapEditorFloatingPanelRect;
};

export type TileFlagsToolModel = TileFlagsToolState & {
    descriptors: readonly TileRenderFlagDescriptor[];
    toggleShowFlag: (flag: TileRenderFlag) => void;
    togglePaintFlag: (flag: TileRenderFlag) => void;
    setShowFlag: (flag: TileRenderFlag, enabled: boolean) => void;
    setPaintFlag: (flag: TileRenderFlag, enabled: boolean) => void;
    isShowEnabled: (flag: TileRenderFlag) => boolean;
    isPaintEnabled: (flag: TileRenderFlag) => boolean;
    setFloatingPanelVisible: (visible: boolean) => void;
    toggleFloatingPanelVisible: () => void;
    setFloatingPanelRect: (rect: MapEditorFloatingPanelRect) => void;
};

const DEFAULT_SHOW_FLAGS = new Set<TileRenderFlag>(ALL_TILE_RENDER_FLAGS);
const DEFAULT_PAINT_FLAGS = new Set<TileRenderFlag>([TileRenderFlag.BLOCKED_TILE]);
const DEFAULT_FLOATING_PANEL_RECT: MapEditorFloatingPanelRect = {
    x: 16,
    y: 56,
    width: 340,
    height: 440,
};

const tileFlagsToolStateByHost = new WeakMap<IEditorPluginHost, TileFlagsToolState>();

function cloneFlagSet(source: ReadonlySet<TileRenderFlag>): Set<TileRenderFlag> {
    return new Set(source);
}

function loadFloatingPanelState(): Pick<TileFlagsToolState, "floatingPanelVisible" | "floatingPanelRect"> {
    if (typeof localStorage === "undefined") {
        return {
            floatingPanelVisible: true,
            floatingPanelRect: { ...DEFAULT_FLOATING_PANEL_RECT },
        };
    }
    try {
        const raw = localStorage.getItem(TILE_FLAGS_FLOATING_PANEL_STORAGE_KEY);
        if (!raw) {
            return {
                floatingPanelVisible: true,
                floatingPanelRect: { ...DEFAULT_FLOATING_PANEL_RECT },
            };
        }
        const parsed = JSON.parse(raw) as Partial<{
            visible: boolean;
            rect: Partial<MapEditorFloatingPanelRect>;
        }>;
        const rect = parsed.rect ?? {};
        return {
            floatingPanelVisible: parsed.visible !== false,
            floatingPanelRect: {
                x: typeof rect.x === "number" ? rect.x : DEFAULT_FLOATING_PANEL_RECT.x,
                y: typeof rect.y === "number" ? rect.y : DEFAULT_FLOATING_PANEL_RECT.y,
                width: typeof rect.width === "number" ? rect.width : DEFAULT_FLOATING_PANEL_RECT.width,
                height: typeof rect.height === "number" ? rect.height : DEFAULT_FLOATING_PANEL_RECT.height,
            },
        };
    } catch {
        return {
            floatingPanelVisible: true,
            floatingPanelRect: { ...DEFAULT_FLOATING_PANEL_RECT },
        };
    }
}

function persistFloatingPanelState(state: TileFlagsToolState): void {
    if (typeof localStorage === "undefined") {
        return;
    }
    try {
        localStorage.setItem(
            TILE_FLAGS_FLOATING_PANEL_STORAGE_KEY,
            JSON.stringify({
                visible: state.floatingPanelVisible,
                rect: state.floatingPanelRect,
            }),
        );
    } catch {
        /* ignore quota / private mode */
    }
}

function getOrCreateState(host: IEditorPluginHost): TileFlagsToolState {
    const existing = tileFlagsToolStateByHost.get(host);
    if (existing) {
        return existing;
    }
    const floating = loadFloatingPanelState();
    const next: TileFlagsToolState = {
        showFlags: cloneFlagSet(DEFAULT_SHOW_FLAGS),
        paintFlags: cloneFlagSet(DEFAULT_PAINT_FLAGS),
        floatingPanelVisible: floating.floatingPanelVisible,
        floatingPanelRect: floating.floatingPanelRect,
    };
    tileFlagsToolStateByHost.set(host, next);
    return next;
}

function notify(host: IEditorPluginHost): void {
    host.notifyWorkbenchStateChanged();
}

export function getTileFlagsToolModel(host: IEditorPluginHost): TileFlagsToolModel {
    const state = getOrCreateState(host);
    return {
        showFlags: state.showFlags,
        paintFlags: state.paintFlags,
        floatingPanelVisible: state.floatingPanelVisible,
        floatingPanelRect: state.floatingPanelRect,
        descriptors: TILE_RENDER_FLAG_DESCRIPTORS,
        toggleShowFlag(flag) {
            if (state.showFlags.has(flag)) {
                state.showFlags.delete(flag);
            } else {
                state.showFlags.add(flag);
            }
            notify(host);
        },
        togglePaintFlag(flag) {
            if (state.paintFlags.has(flag)) {
                state.paintFlags.delete(flag);
            } else {
                state.paintFlags.add(flag);
            }
            notify(host);
        },
        setShowFlag(flag, enabled) {
            if (enabled) {
                state.showFlags.add(flag);
            } else {
                state.showFlags.delete(flag);
            }
            notify(host);
        },
        setPaintFlag(flag, enabled) {
            if (enabled) {
                state.paintFlags.add(flag);
            } else {
                state.paintFlags.delete(flag);
            }
            notify(host);
        },
        isShowEnabled(flag) {
            return state.showFlags.has(flag);
        },
        isPaintEnabled(flag) {
            return state.paintFlags.has(flag);
        },
        setFloatingPanelVisible(visible) {
            state.floatingPanelVisible = visible;
            persistFloatingPanelState(state);
            notify(host);
        },
        toggleFloatingPanelVisible() {
            state.floatingPanelVisible = !state.floatingPanelVisible;
            persistFloatingPanelState(state);
            notify(host);
        },
        setFloatingPanelRect(rect) {
            state.floatingPanelRect = { ...rect };
            persistFloatingPanelState(state);
            notify(host);
        },
    };
}

export function bootstrapTileFlagsToolModel(host: IEditorPluginHost): void {
    getOrCreateState(host);
}

export function getTileFlagsToolWorkbenchSnapshot(host: IEditorPluginHost): string {
    const state = getOrCreateState(host);
    return JSON.stringify({
        show: [...state.showFlags].sort((a, b) => a - b),
        paint: [...state.paintFlags].sort((a, b) => a - b),
        floatingPanelVisible: state.floatingPanelVisible,
        floatingPanelRect: state.floatingPanelRect,
    });
}
