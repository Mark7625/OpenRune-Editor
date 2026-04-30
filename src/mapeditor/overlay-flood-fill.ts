/** HUD token while overlay flood mode is active (not a saved `MapEditorBrushType`). */
export const OVERLAY_SAME_ID_FLOOD_BRUSH_HUD = "flood" as const;
export type OverlaySameIdFloodBrushHud = typeof OVERLAY_SAME_ID_FLOOD_BRUSH_HUD;

/** Cap same-ID overlay flood so one frame cannot scan unbounded map area. */
export const OVERLAY_FLOOD_MAX_TILES = 25_000;

/** UI copy for the brush dropdown / tooltips (flood geometry lives here; modifier gating lives on the overlay tool plugin). */
export const OVERLAY_SAME_ID_FLOOD_UI = {
    dropdownLabel: "Flood fill",
    description:
        "With Overlay flood mode enabled, paint fills all connected tiles that share the same stored overlay id as the tile under the cursor.",
} as const;

export function overlayWorldKey(worldX: number, worldY: number): string {
    return `${worldX},${worldY}`;
}

export type OverlayStoredValueLookup = (level: number, worldX: number, worldY: number) => number | undefined;

/**
 * 4-connected world tiles with the same stored overlay value as the seed (`tileOverlays` layer).
 */
export function computeOverlayMatchFlood(
    level: number,
    seedWx: number,
    seedWy: number,
    lookup: OverlayStoredValueLookup,
    maxTiles: number = OVERLAY_FLOOD_MAX_TILES,
): Set<string> {
    const target = lookup(level, seedWx, seedWy);
    if (target === undefined) {
        return new Set();
    }
    const visited = new Set<string>();
    const queue: Array<{ wx: number; wy: number }> = [{ wx: seedWx, wy: seedWy }];
    visited.add(overlayWorldKey(seedWx, seedWy));
    const dirs: ReadonlyArray<readonly [number, number]> = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ];
    let qi = 0;
    while (qi < queue.length && visited.size < maxTiles) {
        const { wx, wy } = queue[qi++]!;
        for (const [dx, dy] of dirs) {
            const nx = wx + dx;
            const ny = wy + dy;
            const k = overlayWorldKey(nx, ny);
            if (visited.has(k)) {
                continue;
            }
            const v = lookup(level, nx, ny);
            if (v !== target) {
                continue;
            }
            visited.add(k);
            queue.push({ wx: nx, wy: ny });
        }
    }
    return visited;
}
