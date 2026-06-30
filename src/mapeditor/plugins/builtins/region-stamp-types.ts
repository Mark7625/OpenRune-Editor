import type { TileFieldSnapshot } from "../../map-editor-history";
import type { SceneTileLocData } from "../../webgl/sceneLocData";
import type { RegionStampCopyOptions } from "./region-stamp-copy-options";
import { DEFAULT_REGION_STAMP_COPY_OPTIONS, resolveRegionStampCopyOptions } from "./region-stamp-copy-options";

export type WorldTileBounds = {
    minWorldX: number;
    minWorldY: number;
    maxWorldX: number;
    maxWorldY: number;
};

export type RegionStampTileEntry = {
    relX: number;
    relY: number;
    level: number;
    fields: TileFieldSnapshot;
};

export type RegionStampObjectEntry = {
    relX: number;
    relY: number;
    level: number;
    captureMapX: number;
    captureMapY: number;
    captureSceneX: number;
    captureSceneY: number;
    entry: SceneTileLocData;
};

export type RegionStamp = {
    width: number;
    height: number;
    tiles: RegionStampTileEntry[];
    objects: RegionStampObjectEntry[];
    copyOptions: RegionStampCopyOptions;
};

export function normalizeWorldTileBounds(
    ax: number,
    ay: number,
    bx: number,
    by: number,
): WorldTileBounds {
    return {
        minWorldX: Math.min(ax, bx),
        minWorldY: Math.min(ay, by),
        maxWorldX: Math.max(ax, bx),
        maxWorldY: Math.max(ay, by),
    };
}

export function boundsWidth(bounds: WorldTileBounds): number {
    return bounds.maxWorldX - bounds.minWorldX + 1;
}

export function boundsHeight(bounds: WorldTileBounds): number {
    return bounds.maxWorldY - bounds.minWorldY + 1;
}

/** Rotate a stamp-local tile coordinate 90° clockwise `quarters` times. */
export function rotateStampLocalCoord(
    relX: number,
    relY: number,
    width: number,
    height: number,
    quarters: number,
): { relX: number; relY: number; width: number; height: number } {
    let x = relX;
    let y = relY;
    let w = width;
    let h = height;
    const turns = ((quarters % 4) + 4) % 4;
    for (let i = 0; i < turns; i++) {
        const nx = h - 1 - y;
        const ny = x;
        x = nx;
        y = ny;
        const nw = h;
        const nh = w;
        w = nw;
        h = nh;
    }
    return { relX: x, relY: y, width: w, height: h };
}

export function rotatedStampDimensions(
    width: number,
    height: number,
    quarters: number,
): { width: number; height: number } {
    const turns = ((quarters % 4) + 4) % 4;
    return turns % 2 === 1 ? { width: height, height: width } : { width, height };
}

export function rotateTileFields(fields: TileFieldSnapshot, quarters: number): TileFieldSnapshot {
    const turns = ((quarters % 4) + 4) % 4;
    if (turns === 0) {
        return fields;
    }
    const next = { ...fields };
    if (next.r !== undefined) {
        next.r = (next.r + turns) & 3;
    }
    if (next.hl) {
        next.hl = [...next.hl];
    }
    return next;
}

export function cloneRegionStamp(stamp: RegionStamp): RegionStamp {
    return {
        width: stamp.width,
        height: stamp.height,
        copyOptions: { ...resolveRegionStampCopyOptions(stamp.copyOptions) },
        tiles: stamp.tiles.map((tile) => ({
            ...tile,
            fields: {
                ...tile.fields,
                hl: tile.fields.hl ? [...tile.fields.hl] : tile.fields.hl,
            },
        })),
        objects: stamp.objects.map((object) => ({
            ...object,
            entry: structuredClone(object.entry),
        })),
    };
}
