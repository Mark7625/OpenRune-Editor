import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { isTauriRuntime } from "../lib/tauri/is-tauri";
import {
    closeTauriMapEditorPopout,
    isTauriMapEditorPopoutOpen,
    markTauriMapEditorPopoutClosed,
    openTauriMapEditorPopout,
} from "./map-editor-tauri-popout";

declare global {
    interface Window {
        openRuneMapEditorHost?: IEditorPluginHost;
        openRuneMapEditorExternalPanels?: Map<string, Window>;
    }
}

const externalWindowsByPanelId = new Map<string, Window>();

type ExternalPanelCloseHandler = (panelId: string) => void;

let externalPanelCloseHandler: ExternalPanelCloseHandler | null = null;

export function setMapEditorExternalPanelCloseHandler(handler: ExternalPanelCloseHandler | null): void {
    externalPanelCloseHandler = handler;
}

function getExternalWindowMap(): Map<string, Window> {
    if (typeof window === "undefined") {
        return externalWindowsByPanelId;
    }
    if (!window.openRuneMapEditorExternalPanels) {
        window.openRuneMapEditorExternalPanels = externalWindowsByPanelId;
    }
    return window.openRuneMapEditorExternalPanels;
}

function notifyExternalPanelClosed(panelId: string): void {
    externalPanelCloseHandler?.(panelId);
}

export function registerMapEditorExternalHost(host: IEditorPluginHost): void {
    if (typeof window !== "undefined") {
        window.openRuneMapEditorHost = host;
    }
}

export function unregisterMapEditorExternalHost(): void {
    if (typeof window !== "undefined") {
        delete window.openRuneMapEditorHost;
    }
    for (const win of externalWindowsByPanelId.values()) {
        try {
            if (!win.closed) {
                win.close();
            }
        } catch {
            /* ignore */
        }
    }
    externalWindowsByPanelId.clear();
}

export function isMapEditorExternalPanelOpen(panelId: string): boolean {
    if (isTauriMapEditorPopoutOpen(panelId)) {
        return true;
    }
    const win = getExternalWindowMap().get(panelId);
    return !!win && !win.closed;
}

export function closeMapEditorExternalPanel(panelId: string): void {
    if (isTauriRuntime()) {
        void closeTauriMapEditorPopout(panelId);
        return;
    }
    const win = getExternalWindowMap().get(panelId);
    if (!win) {
        return;
    }
    try {
        if (!win.closed) {
            win.close();
        }
    } catch {
        /* ignore */
    }
    getExternalWindowMap().delete(panelId);
}

export function openMapEditorExternalPanel(
    panelId: string,
    options?: { width?: number; height?: number; title?: string },
): Window | null {
    if (typeof window === "undefined") {
        return null;
    }
    closeMapEditorExternalPanel(panelId);

    if (isTauriRuntime()) {
        void openTauriMapEditorPopout(panelId, options, () => {
            markTauriMapEditorPopoutClosed(panelId);
            notifyExternalPanelClosed(panelId);
        });
        return null;
    }

    const width = options?.width ?? 380;
    const height = options?.height ?? 520;
    const features = [
        "popup=1",
        `width=${width}`,
        `height=${height}`,
        "menubar=no",
        "toolbar=no",
        "location=no",
        "status=no",
        "resizable=yes",
    ].join(",");
    const url = `${window.location.origin}/map/editor/popout?panel=${encodeURIComponent(panelId)}`;
    const win = window.open(url, `openrune-panel-${panelId}`, features);
    if (!win) {
        return null;
    }
    getExternalWindowMap().set(panelId, win);
    const timer = window.setInterval(() => {
        if (win.closed) {
            window.clearInterval(timer);
            getExternalWindowMap().delete(panelId);
            notifyExternalPanelClosed(panelId);
        }
    }, 500);
    return win;
}

export function getMapEditorExternalHost(): IEditorPluginHost | null {
    if (typeof window === "undefined") {
        return null;
    }
    if (window.openRuneMapEditorHost) {
        return window.openRuneMapEditorHost;
    }
    try {
        return window.opener?.openRuneMapEditorHost ?? null;
    } catch {
        return null;
    }
}
