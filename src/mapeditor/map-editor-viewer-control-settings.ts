/** Persisted camera / pointer settings for the map editor (not keybinds). */

export const MAP_EDITOR_VIEWER_CONTROL_SETTINGS_KEY = "map-editor-viewer-controls-v1";

export type MapEditorViewerControlSettings = {
    /** When false, dragging the mouse does not pan (2D) or orbit (3D). Scroll wheel zoom still applies. */
    mouseCameraEnabled: boolean;
    /** When false, mouse wheel no longer changes zoom. */
    mouseWheelZoomEnabled: boolean;
    /** Multiplier applied to zoom speed (wheel + zoom keybinds). 1 = legacy default. */
    mouseWheelZoomSensitivity: number;
    /** Multiplier on mouse look (3D / non-ortho-pan modes). 1 = legacy default. */
    mouseLookSensitivity: number;
    /** Multiplier on ortho 2D drag-pan. 1 = legacy default. */
    mousePanSensitivity: number;
    /** Scales WASD / vertical movement (not arrow look). 1 = legacy default. */
    keyboardMoveSpeed: number;
};

export const DEFAULT_MAP_EDITOR_VIEWER_CONTROL_SETTINGS: MapEditorViewerControlSettings = {
    mouseCameraEnabled: true,
    mouseWheelZoomEnabled: true,
    mouseWheelZoomSensitivity: 1,
    mouseLookSensitivity: 1,
    mousePanSensitivity: 1,
    keyboardMoveSpeed: 1,
};

export function clampViewerControlSettings(
    partial: Partial<MapEditorViewerControlSettings>,
): MapEditorViewerControlSettings {
    const base = { ...DEFAULT_MAP_EDITOR_VIEWER_CONTROL_SETTINGS, ...partial };
    return {
        mouseCameraEnabled: !!base.mouseCameraEnabled,
        mouseWheelZoomEnabled: !!base.mouseWheelZoomEnabled,
        mouseWheelZoomSensitivity: clamp01to4(base.mouseWheelZoomSensitivity),
        mouseLookSensitivity: clamp01to4(base.mouseLookSensitivity),
        mousePanSensitivity: clamp01to4(base.mousePanSensitivity),
        keyboardMoveSpeed: clamp01to4(base.keyboardMoveSpeed),
    };
}

function clamp01to4(n: number): number {
    if (!Number.isFinite(n)) {
        return 1;
    }
    return Math.min(4, Math.max(0.1, n));
}

export function loadViewerControlSettingsFromStorage(): MapEditorViewerControlSettings {
    if (typeof localStorage === "undefined") {
        return DEFAULT_MAP_EDITOR_VIEWER_CONTROL_SETTINGS;
    }
    try {
        const raw = localStorage.getItem(MAP_EDITOR_VIEWER_CONTROL_SETTINGS_KEY);
        if (!raw) {
            return DEFAULT_MAP_EDITOR_VIEWER_CONTROL_SETTINGS;
        }
        const parsed = JSON.parse(raw) as Partial<MapEditorViewerControlSettings>;
        if (!parsed || typeof parsed !== "object") {
            return DEFAULT_MAP_EDITOR_VIEWER_CONTROL_SETTINGS;
        }
        return clampViewerControlSettings(parsed);
    } catch {
        return DEFAULT_MAP_EDITOR_VIEWER_CONTROL_SETTINGS;
    }
}

export function saveViewerControlSettingsToStorage(settings: MapEditorViewerControlSettings): void {
    if (typeof localStorage === "undefined") {
        return;
    }
    try {
        localStorage.setItem(MAP_EDITOR_VIEWER_CONTROL_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        /* ignore */
    }
}
