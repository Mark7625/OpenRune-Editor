import { createContext, useContext, type RefObject } from "react";

export type MapEditorWorkbenchFloatingLayerContextValue = {
    layerRef: RefObject<HTMLDivElement | null>;
};

export const MapEditorWorkbenchFloatingLayerContext =
    createContext<MapEditorWorkbenchFloatingLayerContextValue | null>(null);

export function useMapEditorWorkbenchFloatingLayerRef(): RefObject<HTMLDivElement | null> | null {
    return useContext(MapEditorWorkbenchFloatingLayerContext)?.layerRef ?? null;
}
