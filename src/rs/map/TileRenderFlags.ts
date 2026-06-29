/** OSRS tile render flag bits stored in `scene.tileRenderFlags[level][x][y]`. */
export enum TileRenderFlag {
    BLOCKED_TILE = 1,
    BRIDGE_TILE = 2,
    FORCE_LOWEST_PLANE = 4,
    RENDER_ON_LOWER_Z = 8,
    DISABLE_RENDERING = 16,
}

export const ALL_TILE_RENDER_FLAGS: readonly TileRenderFlag[] = [
    TileRenderFlag.BLOCKED_TILE,
    TileRenderFlag.BRIDGE_TILE,
    TileRenderFlag.FORCE_LOWEST_PLANE,
    TileRenderFlag.RENDER_ON_LOWER_Z,
    TileRenderFlag.DISABLE_RENDERING,
];

export interface TileRenderFlagDescriptor {
    flag: TileRenderFlag;
    label: string;
    shortLabel: string;
    /** RGBA 0–1 for map overlays. */
    color: readonly [number, number, number, number];
}

export const TILE_RENDER_FLAG_DESCRIPTORS: readonly TileRenderFlagDescriptor[] = [
    {
        flag: TileRenderFlag.BLOCKED_TILE,
        label: "Unwalkable Flag (1)",
        shortLabel: "Unwalkable",
        color: [0.92, 0.22, 0.22, 0.42],
    },
    {
        flag: TileRenderFlag.BRIDGE_TILE,
        label: "Bridge Flag (2)",
        shortLabel: "Bridge",
        color: [0.25, 0.55, 0.95, 0.42],
    },
    {
        flag: TileRenderFlag.FORCE_LOWEST_PLANE,
        label: "Remove Roof Flag (4)",
        shortLabel: "Remove roof",
        color: [0.95, 0.82, 0.2, 0.42],
    },
    {
        flag: TileRenderFlag.RENDER_ON_LOWER_Z,
        label: "Render on Z - 1 (8)",
        shortLabel: "Render Z-1",
        color: [0.2, 0.85, 0.85, 0.42],
    },
    {
        flag: TileRenderFlag.DISABLE_RENDERING,
        label: "Don't Draw on Map Flag (16)",
        shortLabel: "No map draw",
        color: [0.82, 0.35, 0.92, 0.42],
    },
];

export function hasTileRenderFlag(value: number, flag: TileRenderFlag): boolean {
    return (value & flag) === flag;
}

export function toggleTileRenderFlags(value: number, flagsToToggle: Iterable<TileRenderFlag>): number {
    let next = value;
    for (const flag of flagsToToggle) {
        if (hasTileRenderFlag(next, flag)) {
            next &= ~flag;
        } else {
            next |= flag;
        }
    }
    return next & 0xff;
}

/** Apply selected paint flags: add-only by default; clear selected bits when `removeMode` is true. */
export function applyTileRenderFlags(
    value: number,
    flagsToApply: Iterable<TileRenderFlag>,
    removeMode: boolean,
): number {
    let next = value;
    for (const flag of flagsToApply) {
        if (removeMode) {
            next &= ~flag;
        } else {
            next |= flag;
        }
    }
    return next & 0xff;
}

export function formatTileRenderFlags(value: number): string {
    const active = TILE_RENDER_FLAG_DESCRIPTORS.filter((d) => hasTileRenderFlag(value, d.flag)).map(
        (d) => d.shortLabel,
    );
    if (active.length === 0) {
        return "None";
    }
    return active.join(", ");
}

export function shouldShowTileRenderFlag(
    value: number,
    flag: TileRenderFlag,
    showFlags: ReadonlySet<TileRenderFlag>,
): boolean {
    return showFlags.has(flag) && hasTileRenderFlag(value, flag);
}
