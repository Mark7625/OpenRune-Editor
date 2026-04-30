import { createContext } from "react";

import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import type { MapEditorBrushType } from "./map-editor-kinds";
import type { OverlaySameIdFloodBrushHud } from "./overlay-flood-fill";

export type MapEditorHudState = {
    fps: string;
    debugText: string;
    cameraYaw: number;
    brushSize: number;
    brushType: MapEditorBrushType;
    brushTypeActive: MapEditorBrushType | OverlaySameIdFloodBrushHud;
};

export const MapEditorWorkbenchContext = createContext<IEditorPluginHost | null>(null);

export const MapEditorHudContext = createContext<MapEditorHudState>({
    fps: "",
    debugText: "",
    cameraYaw: 0,
    brushSize: 2,
    brushType: "square",
    brushTypeActive: "square",
});
