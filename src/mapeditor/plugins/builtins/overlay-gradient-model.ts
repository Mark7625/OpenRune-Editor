import type { IEditorPluginHost } from "../editor-plugin-host";
import type { FloorType } from "../../../rs/config/floortype/FloorType";
import {
    pickSimilarUnderlayIdsMixed,
    pickSimilarUnderlayIdsSorted,
    resolveUnderlayGradientId,
    type UnderlayGradientPattern,
    type UnderlayPanelTab,
} from "../../map-editor-underlay-gradient";

type OverlayGradientState = {
    overlayPanelTab: UnderlayPanelTab;
    overlayGradientBaseOverlayId: number;
    overlayGradientPaletteSize: number;
    overlayGradientCandidatePool: number;
    overlayGradientMixSeed: number;
    overlayGradientPaintSeed: number;
    overlayGradientPattern: UnderlayGradientPattern;
    overlayGradientIds: number[];
};

type OverlayGradientModel = OverlayGradientState & {
    setOverlayPanelTab: (tab: UnderlayPanelTab) => void;
    setOverlayGradientBaseOverlayId: (id: number) => void;
    setOverlayGradientPaletteSize: (size: number) => void;
    setOverlayGradientCandidatePool: (count: number) => void;
    setOverlayGradientPattern: (pattern: UnderlayGradientPattern) => void;
    setOverlayGradientIds: (ids: number[]) => void;
    bumpOverlayGradientMixSeed: () => void;
    bumpOverlayGradientPaintSeed: () => void;
    pickSimilarSorted: (floors: readonly FloorType[]) => number[];
    pickSimilarMixed: (floors: readonly FloorType[]) => number[];
    resolvePaintTypeId: (worldX: number, worldY: number, fallbackId: number) => number;
};

const overlayGradientStateByHost = new WeakMap<IEditorPluginHost, OverlayGradientState>();

function notify(host: IEditorPluginHost): void {
    host.notifyWorkbenchStateChanged();
}

function getOrCreateState(host: IEditorPluginHost): OverlayGradientState {
    const existing = overlayGradientStateByHost.get(host);
    if (existing) {
        return existing;
    }
    const next: OverlayGradientState = {
        overlayPanelTab: "swatches",
        overlayGradientBaseOverlayId: 0,
        overlayGradientPaletteSize: 8,
        overlayGradientCandidatePool: 24,
        overlayGradientMixSeed: 1,
        overlayGradientPaintSeed: 1,
        overlayGradientPattern: "stable_random",
        overlayGradientIds: [],
    };
    overlayGradientStateByHost.set(host, next);
    return next;
}

export function getOverlayGradientModel(host: IEditorPluginHost): OverlayGradientModel {
    const state = getOrCreateState(host);
    return {
        ...state,
        setOverlayPanelTab(tab) {
            state.overlayPanelTab = tab;
            notify(host);
        },
        setOverlayGradientBaseOverlayId(id) {
            state.overlayGradientBaseOverlayId = Math.max(0, id | 0);
            notify(host);
        },
        setOverlayGradientPaletteSize(size) {
            state.overlayGradientPaletteSize = Math.max(2, Math.min(24, size | 0));
            notify(host);
        },
        setOverlayGradientCandidatePool(count) {
            state.overlayGradientCandidatePool = Math.max(8, Math.min(64, count | 0));
            notify(host);
        },
        setOverlayGradientPattern(pattern) {
            state.overlayGradientPattern = pattern;
            notify(host);
        },
        setOverlayGradientIds(ids) {
            state.overlayGradientIds = ids.filter((id, idx, arr) => id >= 0 && arr.indexOf(id) === idx);
            notify(host);
        },
        bumpOverlayGradientMixSeed() {
            state.overlayGradientMixSeed = (state.overlayGradientMixSeed + 1) | 0;
            notify(host);
        },
        bumpOverlayGradientPaintSeed() {
            state.overlayGradientPaintSeed = (state.overlayGradientPaintSeed + 1) | 0;
            notify(host);
        },
        pickSimilarSorted(floors) {
            const base = floors.find((f) => f.id === state.overlayGradientBaseOverlayId);
            const baseRgb = base?.getRgb() ?? 0;
            return pickSimilarUnderlayIdsSorted(baseRgb, floors, state.overlayGradientPaletteSize);
        },
        pickSimilarMixed(floors) {
            const base = floors.find((f) => f.id === state.overlayGradientBaseOverlayId);
            const baseRgb = base?.getRgb() ?? 0;
            return pickSimilarUnderlayIdsMixed(
                baseRgb,
                floors,
                state.overlayGradientPaletteSize,
                state.overlayGradientCandidatePool,
                state.overlayGradientMixSeed,
            );
        },
        resolvePaintTypeId(worldX, worldY, fallbackId) {
            if (state.overlayPanelTab !== "gradient" || state.overlayGradientIds.length === 0) {
                return fallbackId;
            }
            return resolveUnderlayGradientId(
                worldX,
                worldY,
                state.overlayGradientPattern,
                state.overlayGradientPaintSeed,
                state.overlayGradientIds,
            );
        },
    };
}

export function bootstrapOverlayGradient(host: IEditorPluginHost): void {
    getOrCreateState(host);
}

export function getOverlayGradientWorkbenchSnapshot(host: IEditorPluginHost): string {
    const state = getOrCreateState(host);
    return JSON.stringify(state);
}
