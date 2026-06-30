import type { TileFieldSnapshot } from "../../map-editor-history";
import type { SceneTileLocData } from "../../webgl/sceneLocData";

export type RegionStampCopyOptions = {
    heights: boolean;
    underlay: boolean;
    overlay: boolean;
    tileFlags: boolean;
    locs: boolean;
    floorDecorations: boolean;
    walls: boolean;
    wallDecorations: boolean;
};

export const DEFAULT_REGION_STAMP_COPY_OPTIONS: RegionStampCopyOptions = {
    heights: true,
    underlay: true,
    overlay: true,
    tileFlags: true,
    locs: true,
    floorDecorations: true,
    walls: true,
    wallDecorations: true,
};

export const REGION_STAMP_COPY_OPTION_ROWS: readonly {
    key: keyof RegionStampCopyOptions;
    label: string;
    description: string;
}[] = [
    { key: "heights", label: "Heights", description: "Tile height stacks and elevation." },
    { key: "underlay", label: "Underlay", description: "Base floor paint under objects." },
    { key: "overlay", label: "Overlay", description: "Overlay paint, tile shape, and rotation." },
    { key: "tileFlags", label: "Tile flags", description: "Render / collision flags on tiles." },
    { key: "locs", label: "Game objects", description: "Interactive and decorative locs (multi-tile objects)." },
    { key: "floorDecorations", label: "Ground decorations", description: "Floor loc decorations on tiles." },
    { key: "walls", label: "Wall objects", description: "Wall locs on tile edges." },
    { key: "wallDecorations", label: "Wall decorations", description: "Decorations attached to walls." },
];

export function resolveRegionStampCopyOptions(
    options?: Partial<RegionStampCopyOptions>,
): RegionStampCopyOptions {
    return { ...DEFAULT_REGION_STAMP_COPY_OPTIONS, ...options };
}

export function regionStampObjectEntryMatchesOptions(
    entry: SceneTileLocData,
    options: RegionStampCopyOptions,
): boolean {
    if (entry.loc) {
        return options.locs;
    }
    if (entry.floorDecoration) {
        return options.floorDecorations;
    }
    if (entry.wall) {
        return options.walls;
    }
    if (entry.wallDecoration) {
        return options.wallDecorations;
    }
    return false;
}

export function mergeTileFieldsForStampApply(
    current: TileFieldSnapshot,
    stampFields: TileFieldSnapshot,
    options: RegionStampCopyOptions,
): TileFieldSnapshot {
    const next: TileFieldSnapshot = {
        ...current,
        hl: current.hl ? [...current.hl] : current.hl,
    };

    if (options.heights) {
        if (stampFields.hl !== undefined && stampFields.hl.length > 0) {
            next.hl = [...stampFields.hl];
        } else if (stampFields.h !== undefined) {
            next.h = stampFields.h;
        }
    }
    if (options.underlay && stampFields.u !== undefined) {
        next.u = stampFields.u;
    }
    if (options.overlay) {
        if (stampFields.o !== undefined) {
            next.o = stampFields.o;
        }
        if (stampFields.s !== undefined) {
            next.s = stampFields.s;
        }
        if (stampFields.r !== undefined) {
            next.r = stampFields.r;
        }
    }
    if (options.tileFlags && stampFields.f !== undefined) {
        next.f = stampFields.f;
    }

    return next;
}

export function hasAnyRegionStampCopyOption(options: RegionStampCopyOptions): boolean {
    return Object.values(options).some(Boolean);
}

export function stampHasTileCategories(options: RegionStampCopyOptions): boolean {
    return options.heights || options.underlay || options.overlay || options.tileFlags;
}

export function stampHasObjectCategories(options: RegionStampCopyOptions): boolean {
    return options.locs || options.floorDecorations || options.walls || options.wallDecorations;
}
