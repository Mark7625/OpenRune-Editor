export const MAP_EDITOR_GIZMO_STORAGE_KEY = "map-editor-gizmo-appearance";

/** RGBA in 0–1 range, compatible with `gl-matrix` vec4 usage in the renderer. */
export type Rgba = readonly [number, number, number, number];

/** Tile brush hover preview: filled interior + edge outline (screen-space via barycentrics). */
export interface BrushOutlineAppearance {
    fill: Rgba;
    outline: Rgba;
    /** Edge threshold in barycentric space (~0.03–0.35). Larger = thicker outline band. */
    outlineThickness: number;
}

export interface ObjectSelectorAppearance {
    hover: Rgba;
    selected: Rgba;
}

export interface MapEditorGizmoAppearance {
    mapSquareGrid: Rgba;
    chunkGrid: Rgba;
    brushOutline: BrushOutlineAppearance;
    objectSelector: ObjectSelectorAppearance;
}

export const DEFAULT_BRUSH_OUTLINE: BrushOutlineAppearance = {
    fill: [0, 0, 0, 0.52],
    outline: [0, 1, 1, 1],
    outlineThickness: 0.02 + (2 / 100) * 0.33,
};

export const DEFAULT_OBJECT_SELECTOR: ObjectSelectorAppearance = {
    hover: [1, 0.55, 0.1, 1],
    selected: [0.2, 0.55, 1, 1],
};

export const DEFAULT_GIZMO_APPEARANCE: MapEditorGizmoAppearance = {
    mapSquareGrid: [1, 0, 0, 1],
    chunkGrid: [0, 1, 0, 1],
    brushOutline: { ...DEFAULT_BRUSH_OUTLINE },
    objectSelector: { ...DEFAULT_OBJECT_SELECTOR },
};

function pickRgba(o: Record<string, unknown>, key: string): Rgba | undefined {
    const v = o[key];
    if (!Array.isArray(v) || v.length !== 4) {
        return undefined;
    }
    const n = v.map((x) => Number(x));
    if (n.some((x) => !Number.isFinite(x))) {
        return undefined;
    }
    return [n[0], n[1], n[2], n[3]] as Rgba;
}

function parseBrushOutline(raw: unknown): BrushOutlineAppearance | undefined {
    if (!raw || typeof raw !== "object") {
        return undefined;
    }
    const o = raw as Record<string, unknown>;
    const fill = pickRgba(o, "fill");
    const outline = pickRgba(o, "outline");
    const t = o.outlineThickness;
    const thickness = typeof t === "number" && Number.isFinite(t) ? t : undefined;
    if (!fill || !outline || thickness === undefined) {
        return undefined;
    }
    return { fill, outline, outlineThickness: clampThickness(thickness) };
}

export function clampThickness(v: number): number {
    if (!Number.isFinite(v)) {
        return DEFAULT_BRUSH_OUTLINE.outlineThickness;
    }
    return Math.min(0.45, Math.max(0.02, v));
}

/** UI slider 1–100 → shader thickness scale. */
export function thicknessFromSlider(slider: number): number {
    const s = Math.min(100, Math.max(1, slider));
    return 0.02 + (s / 100) * 0.33;
}

export function sliderFromThickness(thickness: number): number {
    const t = clampThickness(thickness);
    return Math.round(((t - 0.02) / 0.33) * 100) || 1;
}

export function loadGizmoAppearanceFromStorage(): Partial<MapEditorGizmoAppearance> | null {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        const raw = localStorage.getItem(MAP_EDITOR_GIZMO_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const o = JSON.parse(raw) as Record<string, unknown>;
        const out: Partial<MapEditorGizmoAppearance> = {};

        const a = pickRgba(o, "mapSquareGrid");
        const b = pickRgba(o, "chunkGrid");
        if (a) {
            out.mapSquareGrid = a;
        }
        if (b) {
            out.chunkGrid = b;
        }

        const bo = parseBrushOutline(o.brushOutline);
        if (bo) {
            out.brushOutline = bo;
        } else {
            const legacyFill = pickRgba(o, "brushHighlightDefault");
            const legacyOutline = pickRgba(o, "brushHighlightOverlay");
            if (legacyFill || legacyOutline) {
                out.brushOutline = {
                    fill: legacyFill ?? DEFAULT_BRUSH_OUTLINE.fill,
                    outline: legacyOutline ?? DEFAULT_BRUSH_OUTLINE.outline,
                    outlineThickness: DEFAULT_BRUSH_OUTLINE.outlineThickness,
                };
            }
        }

        const os = o.objectSelector;
        if (os && typeof os === "object") {
            const hover = pickRgba(os as Record<string, unknown>, "hover");
            const selected = pickRgba(os as Record<string, unknown>, "selected");
            if (hover && selected) {
                out.objectSelector = { hover, selected };
            }
        } else {
            const legacyHover = pickRgba(o, "objectSelectorHover");
            const legacySelected = pickRgba(o, "objectSelectorSelected");
            if (legacyHover || legacySelected) {
                out.objectSelector = {
                    hover: legacyHover ?? DEFAULT_OBJECT_SELECTOR.hover,
                    selected: legacySelected ?? DEFAULT_OBJECT_SELECTOR.selected,
                };
            }
        }

        return Object.keys(out).length ? out : null;
    } catch {
        return null;
    }
}

export function saveGizmoAppearanceToStorage(appearance: MapEditorGizmoAppearance): void {
    if (typeof window === "undefined") {
        return;
    }
    try {
        localStorage.setItem(MAP_EDITOR_GIZMO_STORAGE_KEY, JSON.stringify(appearance));
    } catch {
        /* ignore quota */
    }
}
