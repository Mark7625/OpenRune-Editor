/** Active editing tool (right-click and drag on the map). */
export type MapEditorTool = "underlay" | "overlay" | "height" | "smooth" | "object";

/** Brush footprint in tile space from center (saved type; flood is temporary while overlay fill mode is active). */
export type MapEditorBrushType = "square" | "circle" | "diamond";
