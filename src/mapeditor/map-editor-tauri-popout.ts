import { isTauriRuntime } from "../lib/tauri/is-tauri";

const runtimeImport = new Function("m", "return import(m)") as (moduleId: string) => Promise<unknown>;

export function getMapEditorPopoutWindowLabel(panelId: string): string {
    return `map-editor-popout-${panelId}`;
}

export function getMapEditorPopoutUrl(panelId: string): string {
    return `/map/editor/popout?panel=${encodeURIComponent(panelId)}`;
}

const tauriPopoutOpenByPanelId = new Set<string>();

export function isTauriMapEditorPopoutOpen(panelId: string): boolean {
    return tauriPopoutOpenByPanelId.has(panelId);
}

export function markTauriMapEditorPopoutClosed(panelId: string): void {
    tauriPopoutOpenByPanelId.delete(panelId);
}

export async function openTauriMapEditorPopout(
    panelId: string,
    options?: { width?: number; height?: number; title?: string },
    onClosed?: () => void,
): Promise<boolean> {
    if (!isTauriRuntime()) {
        return false;
    }
    const label = getMapEditorPopoutWindowLabel(panelId);
    try {
        const { WebviewWindow } = (await runtimeImport("@tauri-apps/api/webviewWindow")) as {
            WebviewWindow: typeof import("@tauri-apps/api/webviewWindow").WebviewWindow;
        };
        const existing = await WebviewWindow.getByLabel(label);
        if (existing) {
            await existing.close();
            tauriPopoutOpenByPanelId.delete(panelId);
        }
        const width = options?.width ?? 380;
        const height = options?.height ?? 520;
        const webview = new WebviewWindow(label, {
            url: getMapEditorPopoutUrl(panelId),
            title: options?.title ?? "Panel",
            width,
            height,
            minWidth: 260,
            minHeight: 180,
            decorations: false,
            resizable: true,
            focus: true,
            center: true,
            parent: "main",
        });
        tauriPopoutOpenByPanelId.add(panelId);
        void webview.once("tauri://destroyed", () => {
            markTauriMapEditorPopoutClosed(panelId);
            onClosed?.();
        });
        return true;
    } catch {
        markTauriMapEditorPopoutClosed(panelId);
        return false;
    }
}

export async function closeTauriMapEditorPopout(panelId: string): Promise<void> {
    if (!isTauriRuntime()) {
        return;
    }
    const label = getMapEditorPopoutWindowLabel(panelId);
    try {
        const { WebviewWindow, getCurrentWebviewWindow } = (await runtimeImport(
            "@tauri-apps/api/webviewWindow",
        )) as typeof import("@tauri-apps/api/webviewWindow");
        const current = getCurrentWebviewWindow();
        if (current.label === label) {
            await current.close();
            markTauriMapEditorPopoutClosed(panelId);
            return;
        }
        const existing = await WebviewWindow.getByLabel(label);
        if (existing) {
            await existing.close();
        }
        markTauriMapEditorPopoutClosed(panelId);
    } catch {
        markTauriMapEditorPopoutClosed(panelId);
    }
}
