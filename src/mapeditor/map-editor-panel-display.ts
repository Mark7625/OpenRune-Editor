import type { DockviewApi } from "dockview";

import type { MapEditorDockPanelId } from "./plugins/builtins/builtin-plugin-types";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import {
    closeMapEditorExternalPanel,
    isMapEditorExternalPanelOpen,
    openMapEditorExternalPanel,
} from "./map-editor-external-panel";
import { extractDockPanelRestoreOptions } from "./map-editor-dock-panel-restore";
import { restoreMapEditorFloatableDockPanel } from "./map-editor-floatable-dock-defaults";
import type { MapEditorFloatingLayerPosition } from "./map-editor-workbench-floating-layer";

export type MapEditorPanelPlacement = "docked" | "floating" | "external";

export type MapEditorFloatablePanelConfig = {
    panelId: MapEditorDockPanelId;
    title: string;
    canExternal?: boolean;
    defaultWidth?: number;
    defaultHeight?: number;
};

export const MAP_EDITOR_FLOATABLE_DOCK_PANELS: readonly MapEditorFloatablePanelConfig[] = [
    { panelId: "editor-underlays", title: "Underlays", canExternal: true, defaultWidth: 380, defaultHeight: 520 },
    { panelId: "editor-overlays", title: "Overlays", canExternal: true, defaultWidth: 380, defaultHeight: 520 },
    { panelId: "editor-height", title: "Height", canExternal: true, defaultWidth: 380, defaultHeight: 520 },
    { panelId: "editor-object-selector", title: "Objects", canExternal: true, defaultWidth: 380, defaultHeight: 420 },
    { panelId: "editor-tile-flags", title: "Tile flags", canExternal: true, defaultWidth: 380, defaultHeight: 520 },
    { panelId: "editor-history", title: "History", canExternal: true, defaultWidth: 420, defaultHeight: 380 },
    { panelId: "editor-minimap", title: "Minimap", canExternal: true, defaultWidth: 360, defaultHeight: 360 },
];

type PanelDisplayState = {
    placement: MapEditorPanelPlacement;
    placementBeforeExternal: MapEditorPanelPlacement | null;
    position: MapEditorFloatingLayerPosition;
    size: { width: number; height: number };
    minimized: boolean;
};

const displayStateByHost = new WeakMap<IEditorPluginHost, Map<string, PanelDisplayState>>();

const STORAGE_KEY = "map-editor-panel-display-v1";

function getDefaultSize(panelId: string): { width: number; height: number } {
    const config = MAP_EDITOR_FLOATABLE_DOCK_PANELS.find((row) => row.panelId === panelId);
    return {
        width: config?.defaultWidth ?? 380,
        height: config?.defaultHeight ?? 480,
    };
}

function getDefaultState(panelId: string): PanelDisplayState {
    const size = getDefaultSize(panelId);
    return {
        placement: "docked",
        placementBeforeExternal: null,
        position: { x: 16, y: 48 },
        size,
        minimized: false,
    };
}

function loadPersistedStates(): Map<string, PanelDisplayState> {
    const map = new Map<string, PanelDisplayState>();
    if (typeof localStorage === "undefined") {
        return map;
    }
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return map;
        }
        const parsed = JSON.parse(raw) as Record<string, Partial<PanelDisplayState>>;
        for (const [panelId, partial] of Object.entries(parsed)) {
            const defaults = getDefaultState(panelId);
            map.set(panelId, {
                placement:
                    partial.placement === "floating" || partial.placement === "external"
                        ? partial.placement
                        : "docked",
                placementBeforeExternal: null,
                position: {
                    x: typeof partial.position?.x === "number" ? partial.position.x : defaults.position.x,
                    y: typeof partial.position?.y === "number" ? partial.position.y : defaults.position.y,
                },
                size: {
                    width: typeof partial.size?.width === "number" ? partial.size.width : defaults.size.width,
                    height: typeof partial.size?.height === "number" ? partial.size.height : defaults.size.height,
                },
                minimized: partial.minimized === true,
            });
        }
    } catch {
        /* ignore */
    }
    return map;
}

function persistStates(map: Map<string, PanelDisplayState>): void {
    if (typeof localStorage === "undefined") {
        return;
    }
    try {
        const payload: Record<string, Omit<PanelDisplayState, "placementBeforeExternal">> = {};
        for (const [panelId, state] of map.entries()) {
            const { placementBeforeExternal: _ignored, ...persisted } = state;
            payload[panelId] = persisted;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
        /* ignore */
    }
}

function getStateMap(host: IEditorPluginHost): Map<string, PanelDisplayState> {
    let map = displayStateByHost.get(host);
    if (!map) {
        map = loadPersistedStates();
        displayStateByHost.set(host, map);
    }
    return map;
}

function notify(host: IEditorPluginHost): void {
    host.notifyWorkbenchStateChanged();
}

export function getMapEditorPanelDisplay(host: IEditorPluginHost, panelId: string): PanelDisplayState {
    return getStateMap(host).get(panelId) ?? getDefaultState(panelId);
}

export function setMapEditorPanelPlacement(
    host: IEditorPluginHost,
    panelId: string,
    placement: MapEditorPanelPlacement,
): void {
    const map = getStateMap(host);
    const current = map.get(panelId) ?? getDefaultState(panelId);
    if (current.placement === placement) {
        return;
    }
    if (current.placement === "external" && placement !== "external") {
        closeMapEditorExternalPanel(panelId);
    }
    const next: PanelDisplayState = { ...current, placement };
    if (placement === "external" && current.placement !== "external") {
        next.placementBeforeExternal =
            current.placement === "docked" || current.placement === "floating" ? current.placement : "docked";
    } else if (placement !== "external") {
        next.placementBeforeExternal = null;
    }
    map.set(panelId, next);
    persistStates(map);
    if (placement === "external") {
        const config = MAP_EDITOR_FLOATABLE_DOCK_PANELS.find((row) => row.panelId === panelId);
        openMapEditorExternalPanel(panelId, {
            width: next.size.width,
            height: next.size.height,
            title: config?.title,
        });
    }
    notify(host);
}

export function restoreMapEditorPanelFromExternal(host: IEditorPluginHost, panelId: string): void {
    const map = getStateMap(host);
    const current = map.get(panelId) ?? getDefaultState(panelId);
    if (current.placement !== "external") {
        return;
    }
    const restore = current.placementBeforeExternal ?? "docked";
    map.set(panelId, {
        ...current,
        placement: restore,
        placementBeforeExternal: null,
    });
    persistStates(map);
    notify(host);
}

export function setMapEditorPanelFloatingPosition(
    host: IEditorPluginHost,
    panelId: string,
    position: MapEditorFloatingLayerPosition,
): void {
    const map = getStateMap(host);
    const current = map.get(panelId) ?? getDefaultState(panelId);
    map.set(panelId, { ...current, position: { ...position } });
    persistStates(map);
    notify(host);
}

export function setMapEditorPanelFloatingSize(
    host: IEditorPluginHost,
    panelId: string,
    size: { width: number; height: number },
): void {
    const map = getStateMap(host);
    const current = map.get(panelId) ?? getDefaultState(panelId);
    map.set(panelId, { ...current, size: { ...size } });
    persistStates(map);
    notify(host);
}

export function setMapEditorPanelMinimized(host: IEditorPluginHost, panelId: string, minimized: boolean): void {
    const map = getStateMap(host);
    const current = map.get(panelId) ?? getDefaultState(panelId);
    map.set(panelId, { ...current, minimized });
    persistStates(map);
    notify(host);
}

export function isMapEditorFloatablePanel(panelId: string): panelId is MapEditorDockPanelId {
    return MAP_EDITOR_FLOATABLE_DOCK_PANELS.some((row) => row.panelId === panelId);
}

export function syncMapEditorFloatableDockPanels(api: DockviewApi | null, host: IEditorPluginHost | null): void {
    if (!api || !host) {
        return;
    }
    const layoutSnapshot = api.toJSON();
    for (const config of MAP_EDITOR_FLOATABLE_DOCK_PANELS) {
        const display = getMapEditorPanelDisplay(host, config.panelId);
        const panel = api.getPanel(config.panelId);
        const shouldDock = display.placement === "docked";
        if (shouldDock) {
            if (!panel) {
                restoreMapEditorFloatableDockPanel(api, host, config.panelId);
            }
            continue;
        }
        if (panel) {
            const stash = extractDockPanelRestoreOptions(layoutSnapshot, config.panelId);
            if (stash) {
                host.saveDockPanelRestore(config.panelId, stash);
            }
            panel.api.close();
        }
        if (display.placement === "external" && !isMapEditorExternalPanelOpen(config.panelId)) {
            openMapEditorExternalPanel(config.panelId, {
                width: display.size.width,
                height: display.size.height,
                title: config.title,
            });
        }
    }
}

export function getMapEditorPanelDisplaySnapshot(host: IEditorPluginHost): string {
    const map = getStateMap(host);
    const payload: Record<string, PanelDisplayState> = {};
    for (const [panelId, state] of map.entries()) {
        payload[panelId] = state;
    }
    return JSON.stringify(payload);
}
