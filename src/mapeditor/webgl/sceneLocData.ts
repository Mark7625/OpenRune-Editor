import { Model } from "../../rs/model/Model";
import { LocModelType } from "../../rs/config/loctype/LocModelType";
import { Loc } from "../../rs/scene/Loc";
import { Scene } from "../../rs/scene/Scene";
import type { SceneTile } from "../../rs/scene/SceneTile";
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

export function rotationFromLocFlags(flags: number): number {
    return (flags >> 6) & 3;
}

export function nextRotationFlags(flags: number): number {
    const newBaseRot = (rotationFromLocFlags(flags) + 1) & 3;
    return (flags & ~0xc0) | (newBaseRot << 6);
}

export function entityRotationForFlags(flags: number, entityIndex: 0 | 1 = 0): number {
    const type = flags & 0x3f;
    if (type === LocModelType.WALL_CORNER) {
        return wallEntityModelRotation(flags, entityIndex);
    }
    if (
        type >= LocModelType.WALL_DECORATION_INSIDE &&
        type <= LocModelType.WALL_DECORATION_DIAGONAL_DOUBLE
    ) {
        return wallDecorationEntityModelRotation(flags, entityIndex);
    }
    if (type === LocModelType.NORMAL_DIAGIONAL) {
        return rotationFromLocFlags(flags) + 4;
    }
    return rotationFromLocFlags(flags);
}

/** Model type + rotation used by LocModelLoader / object meshes (matches SceneBuilder). */
export function resolveLocEntityModelParams(
    flags: number,
    entity?: Entity,
): { type: number; rotation: number } {
    if (entity instanceof LocEntity) {
        return { type: entity.type, rotation: entity.rotation };
    }
    return {
        type: locEntityTypeFromLocFlags(flags),
        rotation: entityRotationForFlags(flags),
    };
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
            rotation: entityRotationForFlags(flags),
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
                    const modelParams = resolveLocEntityModelParams(loc.flags, loc.entity);
                    const entity = serializeEntity(
                        loc.entity,
                        loc.tag,
                        loc.flags,
                        level,
                        tileX,
                        tileY,
                        modelParams.rotation,
                    );
                    if (entity) {
                        entry.loc = {
                            tag: loc.tag.toString(),
                            flags: loc.flags,
                            level: loc.level,
                            x: loc.x,
                            y: loc.y,
                            height: loc.height,
                            rotation: rotationFromLocFlags(loc.flags),
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

export function wallDataFromSceneTile(
    tile: SceneTile,
    level: number,
    tileX: number,
    tileY: number,
): WallData | undefined {
    const w = tile.wall;
    if (!w) {
        return undefined;
    }
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
    if (!entity0 && !entity1) {
        return undefined;
    }
    return {
        tag: w.tag.toString(),
        flags: w.flags,
        x: w.x,
        y: w.y,
        height: w.height,
        entity0,
        entity1,
    };
}

export function floorDecorationDataFromSceneTile(
    tile: SceneTile,
    level: number,
    tileX: number,
    tileY: number,
): FloorDecorationData | undefined {
    const fd = tile.floorDecoration;
    if (!fd) {
        return undefined;
    }
    const entity = serializeEntity(
        fd.entity,
        fd.tag,
        fd.flags,
        level,
        tileX,
        tileY,
        rotationFromLocFlags(fd.flags),
    );
    if (!entity) {
        return undefined;
    }
    return {
        tag: fd.tag.toString(),
        flags: fd.flags,
        x: fd.x,
        y: fd.y,
        height: fd.height,
        entity,
    };
}

export function wallDecorationDataFromSceneTile(
    tile: SceneTile,
    level: number,
    tileX: number,
    tileY: number,
): WallDecorationData | undefined {
    const wd = tile.wallDecoration;
    if (!wd) {
        return undefined;
    }
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
    if (!entity0) {
        return undefined;
    }
    return {
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
            const modelParams = resolveLocEntityModelParams(loc.flags);
            const entity = createLocEntity({
                ...loc.entity,
                type: modelParams.type,
                rotation: modelParams.rotation,
            });
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
                rotationFromLocFlags(loc.flags),
                BigInt(loc.tag),
                loc.flags,
            );
        }
    }
}

export function rotateLocPlacement(
    placement: LocPlacementData,
    scene: Scene,
): LocPlacementData | undefined {
    const newFlags = nextRotationFlags(placement.flags);
    const newBaseRot = rotationFromLocFlags(newFlags);
    const startX = placement.startX;
    const startY = placement.startY;
    const currentSizeX = placement.endX - placement.startX + 1;
    const currentSizeY = placement.endY - placement.startY + 1;
    const endX = startX + currentSizeY - 1;
    const endY = startY + currentSizeX - 1;
    if (startX < 0 || startY < 0 || endX >= scene.sizeX || endY >= scene.sizeY) {
        return undefined;
    }

    const sizeX = endX - startX + 1;
    const sizeY = endY - startY + 1;
    const heightMap = scene.tileHeights[placement.level];
    const centerHeight =
        (heightMap[endX][endY] +
            heightMap[startX][endY] +
            heightMap[startX][startY] +
            heightMap[endX][startY]) >>
        2;
    const centerX = startX * 128 + (sizeX << 6);
    const centerY = startY * 128 + (sizeY << 6);

    return {
        ...placement,
        flags: newFlags,
        rotation: newBaseRot,
        endX,
        endY,
        x: centerX,
        y: centerY,
        height: centerHeight,
        entity: {
            ...placement.entity,
            type: locEntityTypeFromLocFlags(newFlags),
            rotation: entityRotationForFlags(newFlags),
        },
    };
}

export function rotateWallData(wall: WallData): WallData {
    const newFlags = nextRotationFlags(wall.flags);
    return {
        ...wall,
        flags: newFlags,
        entity0: wall.entity0
            ? { ...wall.entity0, rotation: entityRotationForFlags(newFlags, 0) }
            : undefined,
        entity1: wall.entity1
            ? { ...wall.entity1, rotation: entityRotationForFlags(newFlags, 1) }
            : undefined,
    };
}

export function rotateFloorDecorationData(floorDecoration: FloorDecorationData): FloorDecorationData {
    const newFlags = nextRotationFlags(floorDecoration.flags);
    return {
        ...floorDecoration,
        flags: newFlags,
        entity: {
            ...floorDecoration.entity,
            rotation: entityRotationForFlags(newFlags),
        },
    };
}

export function rotateWallDecorationData(wallDecoration: WallDecorationData): WallDecorationData {
    const newFlags = nextRotationFlags(wallDecoration.flags);
    return {
        ...wallDecoration,
        flags: newFlags,
        entity0: {
            ...wallDecoration.entity0,
            rotation: entityRotationForFlags(newFlags, 0),
        },
        entity1: wallDecoration.entity1
            ? {
                  ...wallDecoration.entity1,
                  rotation: entityRotationForFlags(newFlags, 1),
              }
            : undefined,
    };
}

export function moveLocPlacement(
    scene: Scene,
    placement: LocPlacementData,
    deltaStartX: number,
    deltaStartY: number,
): LocPlacementData | undefined {
    const sizeX = placement.endX - placement.startX + 1;
    const sizeY = placement.endY - placement.startY + 1;
    const newStartX = placement.startX + deltaStartX;
    const newStartY = placement.startY + deltaStartY;
    const newEndX = newStartX + sizeX - 1;
    const newEndY = newStartY + sizeY - 1;
    if (
        newStartX < 0 ||
        newStartY < 0 ||
        newEndX >= scene.sizeX ||
        newEndY >= scene.sizeY
    ) {
        return undefined;
    }

    const heightMap = scene.tileHeights[placement.level];
    const centerHeight =
        (heightMap[newEndX][newEndY] +
            heightMap[newStartX][newEndY] +
            heightMap[newStartX][newStartY] +
            heightMap[newEndX][newStartY]) >>
        2;
    const centerX = newStartX * 128 + (sizeX << 6);
    const centerY = newStartY * 128 + (sizeY << 6);

    return {
        ...placement,
        startX: newStartX,
        startY: newStartY,
        endX: newEndX,
        endY: newEndY,
        x: centerX,
        y: centerY,
        height: centerHeight,
        entity: {
            ...placement.entity,
            tileX: placement.entity.tileX + deltaStartX,
            tileY: placement.entity.tileY + deltaStartY,
        },
    };
}

export function locPlacementFromLoc(
    loc: Loc,
    level: number,
    tileX: number,
    tileY: number,
): LocPlacementData | undefined {
    const modelParams = resolveLocEntityModelParams(loc.flags, loc.entity);
    const entity = serializeEntity(
        loc.entity,
        loc.tag,
        loc.flags,
        level,
        tileX,
        tileY,
        modelParams.rotation,
    );
    if (!entity) {
        return undefined;
    }
    return {
        tag: loc.tag.toString(),
        flags: loc.flags,
        level: loc.level,
        x: loc.x,
        y: loc.y,
        height: loc.height,
        rotation: rotationFromLocFlags(loc.flags),
        startX: loc.startX,
        startY: loc.startY,
        endX: loc.endX,
        endY: loc.endY,
        entity,
    };
}

export function removeLocFromScene(scene: Scene, loc: Loc): void {
    for (let sx = loc.startX; sx <= loc.endX; sx++) {
        for (let sy = loc.startY; sy <= loc.endY; sy++) {
            const tile = scene.tiles[loc.level]?.[sx]?.[sy];
            if (!tile) {
                continue;
            }
            tile.locs = tile.locs.filter((candidate) => candidate !== loc);
        }
    }
}

export function applySceneTileLocEntry(scene: Scene, entry: SceneTileLocData): boolean {
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
        return true;
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
        return true;
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
        return true;
    }

    if (entry.loc) {
        const loc = entry.loc;
        const modelParams = resolveLocEntityModelParams(loc.flags);
        const entity = createLocEntity({
            ...loc.entity,
            type: modelParams.type,
            rotation: modelParams.rotation,
        });
        const sizeX = loc.endX - loc.startX + 1;
        const sizeY = loc.endY - loc.startY + 1;
        return scene.newLoc(
            level,
            loc.startX,
            loc.startY,
            loc.height,
            sizeX,
            sizeY,
            entity,
            rotationFromLocFlags(loc.flags),
            BigInt(loc.tag),
            loc.flags,
        );
    }

    return false;
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
