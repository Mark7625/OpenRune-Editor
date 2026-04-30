import type { IEditorPluginHost } from "../editor-plugin-host";
import type { FloorType } from "../../../rs/config/floortype/FloorType";
import {
    pickSimilarUnderlayIdsMixed,
    pickSimilarUnderlayIdsSorted,
    resolveUnderlayGradientId,
    type UnderlayGradientPattern,
    type UnderlayPanelTab,
} from "../../map-editor-underlay-gradient";

type UnderlayGradientState = {
    underlayPanelTab: UnderlayPanelTab;
    underlayGradientBaseUnderlayId: number;
    underlayGradientPaletteSize: number;
    underlayGradientCandidatePool: number;
    underlayGradientMixSeed: number;
    underlayGradientPaintSeed: number;
    underlayGradientPattern: UnderlayGradientPattern;
    underlayGradientIds: number[];
};

type UnderlayGradientModel = UnderlayGradientState & {
    setUnderlayPanelTab: (tab: UnderlayPanelTab) => void;
    setUnderlayGradientBaseUnderlayId: (id: number) => void;
    setUnderlayGradientPaletteSize: (size: number) => void;
    setUnderlayGradientCandidatePool: (count: number) => void;
    setUnderlayGradientPattern: (pattern: UnderlayGradientPattern) => void;
    setUnderlayGradientIds: (ids: number[]) => void;
    bumpUnderlayGradientMixSeed: () => void;
    bumpUnderlayGradientPaintSeed: () => void;
    pickSimilarSorted: (floors: readonly FloorType[]) => number[];
    pickSimilarMixed: (floors: readonly FloorType[]) => number[];
    resolvePaintTypeId: (worldX: number, worldY: number, fallbackId: number) => number;
};

const underlayGradientStateByHost = new WeakMap<IEditorPluginHost, UnderlayGradientState>();

function notify(host: IEditorPluginHost): void {
    host.notifyWorkbenchStateChanged();
}

function getOrCreateState(host: IEditorPluginHost): UnderlayGradientState {
    const existing = underlayGradientStateByHost.get(host);
    if (existing) {
        return existing;
    }
    const next: UnderlayGradientState = {
        underlayPanelTab: "swatches",
        underlayGradientBaseUnderlayId: 0,
        underlayGradientPaletteSize: 8,
        underlayGradientCandidatePool: 24,
        underlayGradientMixSeed: 1,
        underlayGradientPaintSeed: 1,
        underlayGradientPattern: "stable_random",
        underlayGradientIds: [],
    };
    underlayGradientStateByHost.set(host, next);
    return next;
}

export function getUnderlayGradientModel(host: IEditorPluginHost): UnderlayGradientModel {
    const state = getOrCreateState(host);
    return {
        ...state,
        setUnderlayPanelTab(tab) {
            state.underlayPanelTab = tab;
            notify(host);
        },
        setUnderlayGradientBaseUnderlayId(id) {
            state.underlayGradientBaseUnderlayId = Math.max(0, id | 0);
            notify(host);
        },
        setUnderlayGradientPaletteSize(size) {
            state.underlayGradientPaletteSize = Math.max(2, Math.min(24, size | 0));
            notify(host);
        },
        setUnderlayGradientCandidatePool(count) {
            state.underlayGradientCandidatePool = Math.max(8, Math.min(64, count | 0));
            notify(host);
        },
        setUnderlayGradientPattern(pattern) {
            state.underlayGradientPattern = pattern;
            notify(host);
        },
        setUnderlayGradientIds(ids) {
            state.underlayGradientIds = ids.filter((id, idx, arr) => id >= 0 && arr.indexOf(id) === idx);
            notify(host);
        },
        bumpUnderlayGradientMixSeed() {
            state.underlayGradientMixSeed = (state.underlayGradientMixSeed + 1) | 0;
            notify(host);
        },
        bumpUnderlayGradientPaintSeed() {
            state.underlayGradientPaintSeed = (state.underlayGradientPaintSeed + 1) | 0;
            notify(host);
        },
        pickSimilarSorted(floors) {
            const base = floors.find((f) => f.id === state.underlayGradientBaseUnderlayId);
            const baseRgb = base?.getRgb() ?? 0;
            return pickSimilarUnderlayIdsSorted(baseRgb, floors, state.underlayGradientPaletteSize);
        },
        pickSimilarMixed(floors) {
            const base = floors.find((f) => f.id === state.underlayGradientBaseUnderlayId);
            const baseRgb = base?.getRgb() ?? 0;
            return pickSimilarUnderlayIdsMixed(
                baseRgb,
                floors,
                state.underlayGradientPaletteSize,
                state.underlayGradientCandidatePool,
                state.underlayGradientMixSeed,
            );
        },
        resolvePaintTypeId(worldX, worldY, fallbackId) {
            if (state.underlayPanelTab !== "gradient" || state.underlayGradientIds.length === 0) {
                return fallbackId;
            }
            return resolveUnderlayGradientId(
                worldX,
                worldY,
                state.underlayGradientPattern,
                state.underlayGradientPaintSeed,
                state.underlayGradientIds,
            );
        },
    };
}

export function bootstrapUnderlayGradient(host: IEditorPluginHost): void {
    getOrCreateState(host);
}

export function getUnderlayGradientWorkbenchSnapshot(host: IEditorPluginHost): string {
    const state = getOrCreateState(host);
    return JSON.stringify(state);
}
