import type { FloorType } from "../rs/config/floortype/FloorType";

/** Underlays panel: classic swatches vs gradient builder. */
export type UnderlayPanelTab = "swatches" | "gradient";

/** How world X/Y maps to a swatch index when painting with a gradient palette. */
export type UnderlayGradientPattern =
    | "stable_random"
    | "stripe_x"
    | "stripe_y"
    | "checker"
    | "noise";

export function underlayGradientPatternLabel(p: UnderlayGradientPattern): string {
    switch (p) {
        case "stable_random":
            return "Random (stable)";
        case "stripe_x":
            return "Stripes (east–west)";
        case "stripe_y":
            return "Stripes (north–south)";
        case "checker":
            return "Checker";
        case "noise":
            return "Noise patches";
        default:
            return p;
    }
}

export const UNDERLAY_GRADIENT_PATTERNS: readonly UnderlayGradientPattern[] = [
    "stable_random",
    "stripe_x",
    "stripe_y",
    "checker",
    "noise",
];

function colorDistanceSq(a: number, b: number): number {
    const ar = (a >> 16) & 0xff;
    const ag = (a >> 8) & 0xff;
    const ab = a & 0xff;
    const br = (b >> 16) & 0xff;
    const bg = (b >> 8) & 0xff;
    const bb = b & 0xff;
    const dr = ar - br;
    const dg = ag - bg;
    const db = ab - bb;
    return dr * dr + dg * dg + db * db;
}

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a += 0x6d2b79f5;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hash2i(x: number, y: number, seed: number): number {
    let h = x * 374761393 + y * 668265263 + seed * 1442695041;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return h >>> 0;
}

/**
 * Closest matching underlay type ids to a base RGB (packed 0xRRGGBB), best first.
 */
export function pickSimilarUnderlayIdsSorted(
    baseRgb: number,
    floors: readonly FloorType[],
    maxCount: number,
): number[] {
    const scored = floors.map((f) => ({ id: f.id, d: colorDistanceSq(baseRgb, f.getRgb()) }));
    scored.sort((a, b) => a.d - b.d || a.id - b.id);
    const n = Math.max(0, Math.min(maxCount, scored.length));
    return scored.slice(0, n).map((s) => s.id);
}

/**
 * Pick `paletteSize` ids from the closest `candidatePool` colors, shuffled by `mixSeed`
 * (same inputs → same output; bump seed for a new mix).
 */
export function pickSimilarUnderlayIdsMixed(
    baseRgb: number,
    floors: readonly FloorType[],
    paletteSize: number,
    candidatePool: number,
    mixSeed: number,
): number[] {
    const scored = floors.map((f) => ({ id: f.id, d: colorDistanceSq(baseRgb, f.getRgb()) }));
    scored.sort((a, b) => a.d - b.d || a.id - b.id);
    const poolN = Math.min(candidatePool, scored.length);
    const pool = scored.slice(0, poolN);
    const rng = mulberry32(mixSeed);
    const idx = pool.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = idx[i]!;
        idx[i] = idx[j]!;
        idx[j] = t;
    }
    const take = Math.min(paletteSize, pool.length);
    const out: number[] = [];
    for (let k = 0; k < take; k++) {
        out.push(pool[idx[k]!]!.id);
    }
    return out;
}

export function shuffleUnderlayIdsInPlace(ids: number[], shuffleSeed: number): void {
    const rng = mulberry32(shuffleSeed);
    for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = ids[i]!;
        ids[i] = ids[j]!;
        ids[j] = t;
    }
}

/**
 * Resolve packed underlay type id (as used with `selectedUnderlayId`) for a world tile.
 */
export function resolveUnderlayGradientId(
    worldX: number,
    worldY: number,
    pattern: UnderlayGradientPattern,
    paintSeed: number,
    ids: readonly number[],
): number {
    if (ids.length === 0) {
        return 0;
    }
    if (ids.length === 1) {
        return ids[0]!;
    }
    const len = ids.length;
    const mod = (n: number) => ((n % len) + len) % len;
    switch (pattern) {
        case "stripe_x":
            return ids[mod(worldX + paintSeed)]!;
        case "stripe_y":
            return ids[mod(worldY + paintSeed)]!;
        case "checker":
            return ids[mod(worldX + worldY + paintSeed)]!;
        case "noise": {
            const gx = Math.floor(worldX / 2);
            const gy = Math.floor(worldY / 2);
            return ids[mod(hash2i(gx, gy, paintSeed))]!;
        }
        case "stable_random":
        default:
            return ids[mod(hash2i(worldX, worldY, paintSeed))]!;
    }
}
