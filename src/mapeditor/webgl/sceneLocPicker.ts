import { Loc } from "../../rs/scene/Loc";
import { Scene } from "../../rs/scene/Scene";
import { SceneLoc } from "../../rs/scene/SceneLoc";
import { Entity } from "../../rs/scene/entity/Entity";
import { getIdFromTag } from "../../rs/scene/entity/EntityTag";
import { LocEntity } from "../../rs/scene/entity/LocEntity";
import { Model } from "../../rs/model/Model";
import type { EditorMapSquare } from "./EditorMapSquare";
import {
    resolveLocEntityModelParams,
    type LocEntityData,
    type LocPlacementData,
    type SceneLocData,
    type SceneTileLocData,
} from "./sceneLocData";

/** Upper-plane tile draws when viewing the plane below (bridge on L1, render-Z on L+1). */
function tileRendersOnPlaneBelow(
    scene: Scene,
    upperPlane: number,
    sceneTileX: number,
    sceneTileY: number,
): boolean {
    if (upperPlane <= 0 || upperPlane >= Scene.MAX_LEVELS) {
        return false;
    }
    const flags = scene.tileRenderFlags[upperPlane]?.[sceneTileX]?.[sceneTileY] ?? 0;
    if ((flags & 0x8) !== 0) {
        return true;
    }
    if (upperPlane === 1 && (flags & 0x2) !== 0) {
        return true;
    }
    return false;
}

export type EditorObjectKind = "loc" | "wall" | "floorDecoration" | "wallDecoration";

export type EditorObjectRef = {
    mapId: number;
    mapX: number;
    mapY: number;
    level: number;
    anchorTileX: number;
    anchorTileY: number;
    /** Stable scene entity tag — used to disambiguate locs with overlapping metadata. */
    locTag: string;
    locTypeId: number;
    locModelType: number;
    rotation: number;
    kind: EditorObjectKind;
    sceneX: number;
    sceneY: number;
    sceneZ: number;
};

const PICK_KIND_PRIORITY: Record<EditorObjectKind, number> = {
    loc: 4,
    wallDecoration: 3,
    floorDecoration: 2,
    wall: 1,
};

function pickTileKey(level: number, sceneX: number, sceneY: number): number {
    return ((level & 0xf) << 16) | ((sceneX & 0xff) << 8) | (sceneY & 0xff);
}

export class ObjectPickIndex {
    private readonly byKey = new Map<number, EditorObjectRef[]>();

    static fromSceneLocData(
        mapX: number,
        mapY: number,
        mapId: number,
        data: SceneLocData,
    ): ObjectPickIndex {
        const index = new ObjectPickIndex();
        for (const entry of data.tiles) {
            index.addEntry(mapX, mapY, mapId, entry);
        }
        return index;
    }

    private addEntry(
        mapX: number,
        mapY: number,
        mapId: number,
        entry: SceneTileLocData,
    ): void {
        const { level, tileX, tileY } = entry;

        if (entry.loc) {
            const loc = entry.loc;
            const ref = refFromLocEntityData(
                mapX,
                mapY,
                mapId,
                level,
                loc.startX,
                loc.startY,
                "loc",
                loc.tag,
                loc.x,
                loc.height,
                loc.y,
                loc.entity,
                loc.rotation,
            );
            for (let x = loc.startX; x <= loc.endX; x++) {
                for (let y = loc.startY; y <= loc.endY; y++) {
                    this.add(level, x, y, ref);
                }
            }
        }

        if (entry.floorDecoration) {
            const fd = entry.floorDecoration;
            this.add(
                level,
                tileX,
                tileY,
                refFromLocEntityData(
                    mapX,
                    mapY,
                    mapId,
                    level,
                    tileX,
                    tileY,
                    "floorDecoration",
                    fd.tag,
                    fd.x,
                    fd.height,
                    fd.y,
                    fd.entity,
                    0,
                ),
            );
        }

        if (entry.wallDecoration) {
            const wd = entry.wallDecoration;
            this.add(
                level,
                tileX,
                tileY,
                refFromLocEntityData(
                    mapX,
                    mapY,
                    mapId,
                    level,
                    tileX,
                    tileY,
                    "wallDecoration",
                    wd.tag,
                    wd.x,
                    wd.height,
                    wd.y,
                    wd.entity0,
                    0,
                ),
            );
        }

        if (entry.wall) {
            const w = entry.wall;
            const entity = w.entity0 ?? w.entity1;
            if (entity) {
                this.add(
                    level,
                    tileX,
                    tileY,
                    refFromLocEntityData(
                        mapX,
                        mapY,
                        mapId,
                        level,
                        tileX,
                        tileY,
                        "wall",
                        w.tag,
                        w.x,
                        w.height,
                        w.y,
                        entity,
                        0,
                    ),
                );
            }
        }
    }

    private add(level: number, sceneX: number, sceneY: number, ref: EditorObjectRef): void {
        const key = pickTileKey(level, sceneX, sceneY);
        const existing = this.byKey.get(key);
        if (!existing) {
            this.byKey.set(key, [ref]);
            return;
        }

        const priority = PICK_KIND_PRIORITY[ref.kind];
        let insertAt = existing.length;
        for (let i = 0; i < existing.length; i++) {
            const current = existing[i];
            if (
                current.locTag === ref.locTag &&
                current.kind === ref.kind &&
                current.anchorTileX === ref.anchorTileX &&
                current.anchorTileY === ref.anchorTileY
            ) {
                return;
            }
            if (PICK_KIND_PRIORITY[current.kind] < priority) {
                insertAt = i;
                break;
            }
        }
        existing.splice(insertAt, 0, ref);
    }

    findAt(level: number, sceneX: number, sceneY: number): EditorObjectRef | undefined {
        return this.byKey.get(pickTileKey(level, sceneX, sceneY))?.[0];
    }

    findAtLevels(levels: readonly number[], sceneX: number, sceneY: number): EditorObjectRef | undefined {
        for (const level of levels) {
            const picked = this.findAt(level, sceneX, sceneY);
            if (picked) {
                return picked;
            }
        }
        return undefined;
    }
}

export function editorObjectRefKey(a: EditorObjectRef | undefined, b: EditorObjectRef | undefined): boolean {
    if (!a || !b) {
        return a === b;
    }
    return (
        a.mapId === b.mapId &&
        a.level === b.level &&
        a.kind === b.kind &&
        a.locTag === b.locTag &&
        a.anchorTileX === b.anchorTileX &&
        a.anchorTileY === b.anchorTileY
    );
}

function entityInfo(
    entity: Entity,
    sceneLoc: SceneLoc,
    _rotation: number,
): { locTypeId: number; locModelType: number; rotation: number } | undefined {
    if (entity instanceof LocEntity) {
        return {
            locTypeId: entity.id,
            locModelType: entity.type,
            rotation: entity.rotation,
        };
    }
    if (entity instanceof Model) {
        const params = resolveLocEntityModelParams(sceneLoc.flags, entity);
        return {
            locTypeId: getIdFromTag(sceneLoc.tag),
            locModelType: params.type,
            rotation: params.rotation,
        };
    }
    return undefined;
}

function refFromPlacement(
    mapX: number,
    mapY: number,
    mapId: number,
    level: number,
    anchorTileX: number,
    anchorTileY: number,
    kind: EditorObjectKind,
    sceneLoc: SceneLoc,
    entity: Entity,
    rotation: number,
): EditorObjectRef | undefined {
    const info = entityInfo(entity, sceneLoc, rotation);
    if (!info) {
        return undefined;
    }
    return {
        mapId,
        mapX,
        mapY,
        level,
        anchorTileX,
        anchorTileY,
        locTag: sceneLoc.tag.toString(),
        locTypeId: info.locTypeId,
        locModelType: info.locModelType,
        rotation: info.rotation,
        kind,
        sceneX: sceneLoc.x,
        sceneY: sceneLoc.height,
        sceneZ: sceneLoc.y,
    };
}

function isLocPlacement(loc: unknown): loc is Loc {
    return (
        typeof loc === "object" &&
        loc !== null &&
        "startX" in loc &&
        "endX" in loc &&
        "entity" in loc
    );
}

function refFromLocEntityData(
    mapX: number,
    mapY: number,
    mapId: number,
    level: number,
    anchorTileX: number,
    anchorTileY: number,
    kind: EditorObjectKind,
    locTag: string,
    sceneX: number,
    sceneY: number,
    sceneZ: number,
    entity: LocEntityData,
    rotation: number,
): EditorObjectRef {
    return {
        mapId,
        mapX,
        mapY,
        level,
        anchorTileX,
        anchorTileY,
        locTag,
        locTypeId: entity.id,
        locModelType: entity.type,
        rotation: entity.rotation ?? rotation,
        kind,
        sceneX,
        sceneY,
        sceneZ,
    };
}

function locFootprintContains(loc: LocPlacementData, sceneX: number, sceneY: number): boolean {
    return (
        sceneX >= loc.startX &&
        sceneX <= loc.endX &&
        sceneY >= loc.startY &&
        sceneY <= loc.endY
    );
}

function findObjectInSceneLocData(
    map: EditorMapSquare,
    mapId: number,
    level: number,
    sceneX: number,
    sceneY: number,
): EditorObjectRef | undefined {
    const data: SceneLocData = map.sceneLocData;
    for (const entry of data.tiles) {
        if (entry.level !== level) {
            continue;
        }

        if (entry.loc && locFootprintContains(entry.loc, sceneX, sceneY)) {
            const loc = entry.loc;
            return refFromLocEntityData(
                map.mapX,
                map.mapY,
                mapId,
                level,
                loc.startX,
                loc.startY,
                "loc",
                loc.tag,
                loc.x,
                loc.height,
                loc.y,
                loc.entity,
                loc.rotation,
            );
        }

        if (entry.tileX !== sceneX || entry.tileY !== sceneY) {
            continue;
        }

        const picked = pickSceneTileLocEntry(map, mapId, entry);
        if (picked) {
            return picked;
        }
    }
    return undefined;
}

function pickSceneTileLocEntry(
    map: EditorMapSquare,
    mapId: number,
    entry: SceneTileLocData,
): EditorObjectRef | undefined {
    const { level, tileX, tileY } = entry;

    if (entry.loc) {
        const loc = entry.loc;
        return refFromLocEntityData(
            map.mapX,
            map.mapY,
            mapId,
            level,
            loc.startX,
            loc.startY,
            "loc",
            loc.tag,
            loc.x,
            loc.height,
            loc.y,
            loc.entity,
            loc.rotation,
        );
    }

    if (entry.floorDecoration) {
        const fd = entry.floorDecoration;
        return refFromLocEntityData(
            map.mapX,
            map.mapY,
            mapId,
            level,
            tileX,
            tileY,
            "floorDecoration",
            fd.tag,
            fd.x,
            fd.height,
            fd.y,
            fd.entity,
            0,
        );
    }

    if (entry.wallDecoration) {
        const wd = entry.wallDecoration;
        return refFromLocEntityData(
            map.mapX,
            map.mapY,
            mapId,
            level,
            tileX,
            tileY,
            "wallDecoration",
            wd.tag,
            wd.x,
            wd.height,
            wd.y,
            wd.entity0,
            0,
        );
    }

    if (entry.wall) {
        const w = entry.wall;
        const entity = w.entity0 ?? w.entity1;
        if (!entity) {
            return undefined;
        }
        return refFromLocEntityData(
            map.mapX,
            map.mapY,
            mapId,
            level,
            tileX,
            tileY,
            "wall",
            w.tag,
            w.x,
            w.height,
            w.y,
            entity,
            0,
        );
    }

    return undefined;
}

export function editorObjectRefFromSceneTileLocEntry(
    map: EditorMapSquare,
    mapId: number,
    entry: SceneTileLocData,
): EditorObjectRef | undefined {
    return pickSceneTileLocEntry(map, mapId, entry);
}

function tileObjectVisible(
    scene: Scene,
    level: number,
    sceneX: number,
    sceneY: number,
    viewPlaneMax: number,
): boolean {
    const tile = scene.tiles[level]?.[sceneX]?.[sceneY];
    if (!tile) {
        return false;
    }
    if (tile.minLevel <= viewPlaneMax) {
        return true;
    }
    return scene.isPlayerLevel(level, sceneX, sceneY, viewPlaneMax);
}

function findObjectInLiveScene(
    map: EditorMapSquare,
    mapId: number,
    level: number,
    sceneX: number,
    sceneY: number,
    viewPlaneMax: number,
): EditorObjectRef | undefined {
    const scene = map.scene;
    if (!tileObjectVisible(scene, level, sceneX, sceneY, viewPlaneMax)) {
        return undefined;
    }

    const tile = scene.tiles[level]?.[sceneX]?.[sceneY];
    if (!tile) {
        return undefined;
    }

    let best: EditorObjectRef | undefined;
    let bestPriority = -1;

    const consider = (ref: EditorObjectRef | undefined): void => {
        if (!ref) {
            return;
        }
        const priority = PICK_KIND_PRIORITY[ref.kind];
        if (priority > bestPriority) {
            best = ref;
            bestPriority = priority;
        }
    };

    for (const loc of tile.locs) {
        if (!isLocPlacement(loc)) {
            continue;
        }
        if (
            sceneX < loc.startX ||
            sceneX > loc.endX ||
            sceneY < loc.startY ||
            sceneY > loc.endY
        ) {
            continue;
        }
        consider(
            refFromPlacement(
                map.mapX,
                map.mapY,
                mapId,
                level,
                loc.startX,
                loc.startY,
                "loc",
                loc,
                loc.entity,
                loc.rotation,
            ),
        );
    }

    if (tile.wallDecoration) {
        const wd = tile.wallDecoration;
        consider(
            refFromPlacement(
                map.mapX,
                map.mapY,
                mapId,
                level,
                sceneX,
                sceneY,
                "wallDecoration",
                wd,
                wd.entity0,
                0,
            ),
        );
    }

    if (tile.floorDecoration) {
        const fd = tile.floorDecoration;
        consider(
            refFromPlacement(
                map.mapX,
                map.mapY,
                mapId,
                level,
                sceneX,
                sceneY,
                "floorDecoration",
                fd,
                fd.entity,
                0,
            ),
        );
    }

    if (tile.wall) {
        const w = tile.wall;
        const entity = w.entity0 ?? w.entity1;
        if (entity) {
            consider(
                refFromPlacement(map.mapX, map.mapY, mapId, level, sceneX, sceneY, "wall", w, entity, 0),
            );
        }
    }

    return best;
}

export function findObjectAtWorldTile(
    map: EditorMapSquare,
    mapId: number,
    level: number,
    worldX: number,
    worldY: number,
    viewPlaneMax: number = 3,
): EditorObjectRef | undefined {
    const localX = ((worldX % 64) + 64) % 64;
    const localY = ((worldY % 64) + 64) % 64;
    const sceneX = localX + map.borderSize;
    const sceneY = localY + map.borderSize;
    const scene = map.scene;
    if (sceneX < 0 || sceneY < 0 || sceneX >= scene.sizeX || sceneY >= scene.sizeY) {
        return undefined;
    }

    const fromIndex = map.objectPickIndex.findAt(level, sceneX, sceneY);
    if (fromIndex) {
        return fromIndex;
    }

    const fromSerialized = findObjectInSceneLocData(map, mapId, level, sceneX, sceneY);
    if (fromSerialized) {
        return fromSerialized;
    }

    return findObjectInLiveScene(map, mapId, level, sceneX, sceneY, viewPlaneMax);
}

export function findObjectAtWorldTileLevels(
    map: EditorMapSquare,
    mapId: number,
    levels: readonly number[],
    worldX: number,
    worldY: number,
    viewPlaneMax: number = 3,
): EditorObjectRef | undefined {
    const localX = ((worldX % 64) + 64) % 64;
    const localY = ((worldY % 64) + 64) % 64;
    const sceneX = localX + map.borderSize;
    const sceneY = localY + map.borderSize;

    const fromIndex = map.objectPickIndex.findAtLevels(levels, sceneX, sceneY);
    if (fromIndex) {
        return fromIndex;
    }

    for (const level of levels) {
        const picked = findObjectAtWorldTile(map, mapId, level, worldX, worldY, viewPlaneMax);
        if (picked) {
            return picked;
        }
    }
    return undefined;
}

export function getObjectPickLevelsAt(
    scene: Scene,
    sceneTileX: number,
    sceneTileY: number,
    viewPlaneMax: number,
    hideBelowViewPlane: boolean,
): number[] {
    const max = Math.max(0, Math.min(Scene.MAX_LEVELS - 1, viewPlaneMax | 0));
    const levels = new Set<number>();

    for (let level = 0; level < Scene.MAX_LEVELS; level++) {
        if (hideBelowViewPlane) {
            if (level < max) {
                if (!(level === max - 1 && tileRendersOnPlaneBelow(scene, max, sceneTileX, sceneTileY))) {
                    continue;
                }
            } else if (!scene.isPlayerLevel(level, sceneTileX, sceneTileY, max)) {
                continue;
            }
            levels.add(level);
            continue;
        }

        if (level <= max) {
            levels.add(level);
            continue;
        }

        if (
            level === max + 1 &&
            max < Scene.MAX_LEVELS - 1 &&
            (tileRendersOnPlaneBelow(scene, level, sceneTileX, sceneTileY) ||
                scene.isPlayerLevel(level, sceneTileX, sceneTileY, max))
        ) {
            levels.add(level);
        }
    }

    return [...levels].sort((a, b) => b - a);
}

export function findObjectAtHover(
    getMap: (mapX: number, mapY: number) => EditorMapSquare | undefined,
    mapId: number,
    mapX: number,
    mapY: number,
    levels: readonly number[],
    worldX: number,
    worldY: number,
    viewPlaneMax: number = 3,
): EditorObjectRef | undefined {
    const map = getMap(mapX, mapY);
    if (!map) {
        return undefined;
    }
    return findObjectAtWorldTileLevels(map, mapId, levels, worldX, worldY, viewPlaneMax);
}
