import { Model } from "../../rs/model/Model";
import { LocModelType } from "../../rs/config/loctype/LocModelType";
import { Scene } from "../../rs/scene/Scene";
import { Entity } from "../../rs/scene/entity/Entity";
import { getIdFromTag } from "../../rs/scene/entity/EntityTag";
import { LocEntity } from "../../rs/scene/entity/LocEntity";

export type LocEntityData = {
    id: number;
    type: number;
    rotation: number;
    level: number;
    tileX: number;
    tileY: number;
    seqId: number;
    seqRandomStart: boolean;
};

export type FloorDecorationData = {
    tag: string;
    flags: number;
    x: number;
    y: number;
    height: number;
    entity: LocEntityData;
};

export type WallData = {
    tag: string;
    flags: number;
    x: number;
    y: number;
    height: number;
    entity0?: LocEntityData;
    entity1?: LocEntityData;
};

export type WallDecorationData = {
    tag: string;
    flags: number;
    x: number;
    y: number;
    height: number;
    offsetX: number;
    offsetY: number;
    entity0: LocEntityData;
    entity1?: LocEntityData;
};

export type LocPlacementData = {
    tag: string;
    flags: number;
    level: number;
    x: number;
    y: number;
    height: number;
    rotation: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    entity: LocEntityData;
};

export type SceneTileLocData = {
    level: number;
    tileX: number;
    tileY: number;
    floorDecoration?: FloorDecorationData;
    wall?: WallData;
    wallDecoration?: WallDecorationData;
    loc?: LocPlacementData;
};

export type SceneLocData = {
    tiles: SceneTileLocData[];
};

function rotationFromLocFlags(flags: number): number {
    return (flags >> 6) & 3;
}

function locEntityTypeFromLocFlags(flags: number): number {
    const type = flags & 0x3f;
    if (
        type === LocModelType.WALL_DECORATION_INSIDE ||
        type === LocModelType.WALL_DECORATION_OUTSIDE ||
        type === LocModelType.WALL_DECORATION_DIAGONAL_OUTSIDE ||
        type === LocModelType.WALL_DECORATION_DIAGONAL_INSIDE ||
        type === LocModelType.WALL_DECORATION_DIAGONAL_DOUBLE
    ) {
        return LocModelType.WALL_DECORATION_INSIDE;
    }
    if (type === LocModelType.NORMAL_DIAGIONAL) {
        return LocModelType.NORMAL;
    }
    return type;
}

function wallEntityModelRotation(flags: number, entityIndex: 0 | 1): number {
    const rotation = rotationFromLocFlags(flags);
    const type = flags & 0x3f;
    if (type === LocModelType.WALL_CORNER) {
        return entityIndex === 0 ? rotation + 4 : (rotation + 1) & 3;
    }
    return rotation;
}

function wallDecorationEntityModelRotation(flags: number, entityIndex: 0 | 1): number {
    const rotation = rotationFromLocFlags(flags);
    const type = flags & 0x3f;
    if (type === LocModelType.WALL_DECORATION_DIAGONAL_OUTSIDE) {
        return rotation + 4;
    }
    if (type === LocModelType.WALL_DECORATION_DIAGONAL_INSIDE) {
        return ((rotation + 2) & 3) + 4;
    }
    if (type === LocModelType.WALL_DECORATION_DIAGONAL_DOUBLE) {
        const insideRotation = (rotation + 2) & 3;
        return entityIndex === 0 ? rotation + 4 : insideRotation + 4;
    }
    return rotation;
}

function entityToLocEntityData(
    entity: Entity,
    tag: bigint,
    flags: number,
    level: number,
    tileX: number,
    tileY: number,
    rotation: number,
): LocEntityData | undefined {
    if (entity instanceof LocEntity) {
        return {
            id: entity.id,
            type: entity.type,
            rotation: entity.rotation,
            level: entity.level,
            tileX: entity.tileX,
            tileY: entity.tileY,
            seqId: entity.seqId,
            seqRandomStart: entity.seqRandomStart,
        };
    }
    if (entity instanceof Model) {
        return {
            id: getIdFromTag(tag),
            type: locEntityTypeFromLocFlags(flags),
            rotation,
            level,
            tileX,
            tileY,
            seqId: -1,
            seqRandomStart: false,
        };
    }
    return undefined;
}

function serializeEntity(
    entity: Entity | undefined,
    tag: bigint,
    flags: number,
    level: number,
    tileX: number,
    tileY: number,
    rotation: number,
): LocEntityData | undefined {
    if (!entity) {
        return undefined;
    }
    return entityToLocEntityData(entity, tag, flags, level, tileX, tileY, rotation);
}

export function serializeSceneLocData(scene: Scene, borderSize: number): SceneLocData {
    const tiles: SceneTileLocData[] = [];
    const startX = borderSize;
    const startY = borderSize;
    const endX = borderSize + Scene.MAP_SQUARE_SIZE;
    const endY = borderSize + Scene.MAP_SQUARE_SIZE;

    for (let level = 0; level < scene.levels; level++) {
        for (let tileX = startX; tileX < endX; tileX++) {
            for (let tileY = startY; tileY < endY; tileY++) {
                const tile = scene.tiles[level][tileX][tileY];
                if (!tile) {
                    continue;
                }

                const entry: SceneTileLocData = {
                    level,
                    tileX,
                    tileY,
                };
                let hasData = false;

                if (tile.floorDecoration) {
                    const fd = tile.floorDecoration;
                    const entity = serializeEntity(
                        fd.entity,
                        fd.tag,
                        fd.flags,
                        level,
                        tileX,
                        tileY,
                        rotationFromLocFlags(fd.flags),
                    );
                    if (entity) {
                        entry.floorDecoration = {
                            tag: fd.tag.toString(),
                            flags: fd.flags,
                            x: fd.x,
                            y: fd.y,
                            height: fd.height,
                            entity,
                        };
                        hasData = true;
                    }
                }

                if (tile.wall) {
                    const w = tile.wall;
                    const entity0 = serializeEntity(
                        w.entity0,
                        w.tag,
                        w.flags,
                        level,
                        tileX,
                        tileY,
                        wallEntityModelRotation(w.flags, 0),
                    );
                    const entity1 = serializeEntity(
                        w.entity1,
                        w.tag,
                        w.flags,
                        level,
                        tileX,
                        tileY,
                        wallEntityModelRotation(w.flags, 1),
                    );
                    if (entity0 || entity1) {
                        entry.wall = {
                            tag: w.tag.toString(),
                            flags: w.flags,
                            x: w.x,
                            y: w.y,
                            height: w.height,
                            entity0,
                            entity1,
                        };
                        hasData = true;
                    }
                }

                if (tile.wallDecoration) {
                    const wd = tile.wallDecoration;
                    const entity0 = serializeEntity(
                        wd.entity0,
                        wd.tag,
                        wd.flags,
                        level,
                        tileX,
                        tileY,
                        wallDecorationEntityModelRotation(wd.flags, 0),
                    );
                    const entity1 = serializeEntity(
                        wd.entity1,
                        wd.tag,
                        wd.flags,
                        level,
                        tileX,
                        tileY,
                        wallDecorationEntityModelRotation(wd.flags, 1),
                    );
                    if (entity0) {
                        entry.wallDecoration = {
                            tag: wd.tag.toString(),
                            flags: wd.flags,
                            x: wd.x,
                            y: wd.y,
                            height: wd.height,
                            offsetX: wd.offsetX,
                            offsetY: wd.offsetY,
                            entity0,
                            entity1,
                        };
                        hasData = true;
                    }
                }

                for (const loc of tile.locs) {
                    if (loc.startX !== tileX || loc.startY !== tileY) {
                        continue;
                    }
                    const entity = serializeEntity(
                        loc.entity,
                        loc.tag,
                        loc.flags,
                        level,
                        tileX,
                        tileY,
                        loc.rotation,
                    );
                    if (entity) {
                        entry.loc = {
                            tag: loc.tag.toString(),
                            flags: loc.flags,
                            level: loc.level,
                            x: loc.x,
                            y: loc.y,
                            height: loc.height,
                            rotation: loc.rotation,
                            startX: loc.startX,
                            startY: loc.startY,
                            endX: loc.endX,
                            endY: loc.endY,
                            entity,
                        };
                        hasData = true;
                    }
                    break;
                }

                if (hasData) {
                    tiles.push(entry);
                }
            }
        }
    }

    return { tiles };
}

function createLocEntity(data: LocEntityData): LocEntity {
    return new LocEntity(
        data.id,
        data.type,
        data.rotation,
        data.level,
        data.tileX,
        data.tileY,
        data.seqId,
        data.seqRandomStart,
    );
}

export function clearSceneLocRegion(scene: Scene, borderSize: number): void {
    const startX = borderSize;
    const startY = borderSize;
    const endX = borderSize + Scene.MAP_SQUARE_SIZE;
    const endY = borderSize + Scene.MAP_SQUARE_SIZE;

    for (let level = 0; level < scene.levels; level++) {
        for (let tileX = startX; tileX < endX; tileX++) {
            for (let tileY = startY; tileY < endY; tileY++) {
                const tile = scene.tiles[level][tileX][tileY];
                if (!tile) {
                    continue;
                }
                tile.floorDecoration = undefined;
                tile.wall = undefined;
                tile.wallDecoration = undefined;
                tile.locs = [];
            }
        }
    }
}

export function applySceneLocData(scene: Scene, data: SceneLocData): void {
    for (const entry of data.tiles) {
        const { level, tileX, tileY } = entry;

        if (entry.floorDecoration) {
            const fd = entry.floorDecoration;
            scene.newFloorDecoration(
                level,
                tileX,
                tileY,
                fd.height,
                createLocEntity(fd.entity),
                BigInt(fd.tag),
                fd.flags,
            );
        }

        if (entry.wall) {
            const w = entry.wall;
            scene.newWall(
                level,
                tileX,
                tileY,
                w.height,
                w.entity0 ? createLocEntity(w.entity0) : undefined,
                w.entity1 ? createLocEntity(w.entity1) : undefined,
                BigInt(w.tag),
                w.flags,
            );
        }

        if (entry.wallDecoration) {
            const wd = entry.wallDecoration;
            scene.newWallDecoration(
                level,
                tileX,
                tileY,
                wd.height,
                createLocEntity(wd.entity0),
                wd.entity1 ? createLocEntity(wd.entity1) : undefined,
                wd.offsetX,
                wd.offsetY,
                BigInt(wd.tag),
                wd.flags,
            );
        }

        if (entry.loc) {
            const loc = entry.loc;
            const entity = createLocEntity(loc.entity);
            const sizeX = loc.endX - loc.startX + 1;
            const sizeY = loc.endY - loc.startY + 1;
            scene.newLoc(
                level,
                loc.startX,
                loc.startY,
                loc.height,
                sizeX,
                sizeY,
                entity,
                loc.rotation,
                BigInt(loc.tag),
                loc.flags,
            );
        }
    }
}

export function cloneSceneLocData(data: SceneLocData): SceneLocData {
    return {
        tiles: data.tiles.map((t) => ({
            ...t,
            floorDecoration: t.floorDecoration
                ? { ...t.floorDecoration, entity: { ...t.floorDecoration.entity } }
                : undefined,
            wall: t.wall
                ? {
                      ...t.wall,
                      entity0: t.wall.entity0 ? { ...t.wall.entity0 } : undefined,
                      entity1: t.wall.entity1 ? { ...t.wall.entity1 } : undefined,
                  }
                : undefined,
            wallDecoration: t.wallDecoration
                ? {
                      ...t.wallDecoration,
                      entity0: { ...t.wallDecoration.entity0 },
                      entity1: t.wallDecoration.entity1
                          ? { ...t.wallDecoration.entity1 }
                          : undefined,
                  }
                : undefined,
            loc: t.loc ? { ...t.loc, entity: { ...t.loc.entity } } : undefined,
        })),
    };
}
