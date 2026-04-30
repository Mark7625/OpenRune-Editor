import type { IEditorPluginHost } from "../editor-plugin-host";

export type HeightPaintMode = "raise-lower" | "smooth" | "slope" | "blend" | "flatten" | "terrace";

type HeightToolState = {
    mode: HeightPaintMode;
    slopeStrength: number;
    blendStrength: number;
    flattenStrength: number;
    terraceStep: number;
};

export type HeightToolModel = HeightToolState & {
    setMode: (mode: HeightPaintMode) => void;
    setSlopeStrength: (strength: number) => void;
    setBlendStrength: (strength: number) => void;
    setFlattenStrength: (strength: number) => void;
    setTerraceStep: (step: number) => void;
};

const DEFAULT_HEIGHT_TOOL_STATE: HeightToolState = {
    mode: "raise-lower",
    slopeStrength: 0.6,
    blendStrength: 0.45,
    flattenStrength: 0.5,
    terraceStep: 16,
};

const heightToolStateByHost = new WeakMap<IEditorPluginHost, HeightToolState>();

function getOrCreateState(host: IEditorPluginHost): HeightToolState {
    const existing = heightToolStateByHost.get(host);
    if (existing) {
        return existing;
    }
    const next: HeightToolState = { ...DEFAULT_HEIGHT_TOOL_STATE };
    heightToolStateByHost.set(host, next);
    return next;
}

function notify(host: IEditorPluginHost): void {
    host.notifyWorkbenchStateChanged();
}

export function getHeightToolModel(host: IEditorPluginHost): HeightToolModel {
    const state = getOrCreateState(host);
    return {
        ...state,
        setMode(mode) {
            state.mode = mode;
            notify(host);
        },
        setSlopeStrength(strength) {
            state.slopeStrength = Math.max(0.1, Math.min(1, strength));
            notify(host);
        },
        setBlendStrength(strength) {
            state.blendStrength = Math.max(0.05, Math.min(1, strength));
            notify(host);
        },
        setFlattenStrength(strength) {
            state.flattenStrength = Math.max(0.05, Math.min(1, strength));
            notify(host);
        },
        setTerraceStep(step) {
            state.terraceStep = Math.max(2, Math.min(96, Math.round(step) || 2));
            notify(host);
        },
    };
}

export function bootstrapHeightToolModel(host: IEditorPluginHost): void {
    getOrCreateState(host);
}

export function getHeightToolWorkbenchSnapshot(host: IEditorPluginHost): string {
    const state = getOrCreateState(host);
    return JSON.stringify(state);
}
