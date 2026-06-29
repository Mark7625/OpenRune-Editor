import { Transfer, type TransferDescriptor } from "threads/worker";



import { AnimationFrames } from "../../../mapviewer/webgl/AnimationFrames";
import { DrawRange, NULL_DRAW_RANGE, newDrawRange } from "../../../mapviewer/webgl/DrawRange";
import { ModelHashBuffer, getModelHash } from "../../../mapviewer/webgl/buffer/ModelHashBuffer";
import {
    DrawCommand,
    type ModelMergeGroup,
    ModelFace,
    SceneBuffer,
    type SceneModel,
    createModelInfoTextureData,
    getModelFaces,
    isModelFaceTransparent,
} from "../../../mapviewer/webgl/buffer/SceneBuffer";
import { LocAnimatedGroup } from "../../../mapviewer/webgl/loc/LocAnimatedGroup";
import { LocAnimatedData } from "../../../mapviewer/webgl/loc/LocAnimatedData";
import type { SceneLocEntity } from "../../../mapviewer/webgl/loc/SceneLocEntity";
import { getSceneLocsForChunk, isLowDetail } from "../../../mapviewer/webgl/loc/SceneLocs";
import { LocType } from "../../../rs/config/loctype/LocType";
import { LocEntity } from "../../../rs/scene/entity/LocEntity";
import { Scene, applyHeightMapTextureData, loadHeightMapTextureData } from "../../../rs/scene/Scene";
import { LocLoadType, SceneBuilder } from "../../../rs/scene/SceneBuilder";
import { SceneTile } from "../../../rs/scene/SceneTile";
import type { WorkerState } from "../../../mapviewer/worker/RenderDataWorker";
import { OBJECT_CHUNK_COUNT } from "../objectChunk";
import { applySceneLocData, serializeSceneLocData } from "../sceneLocData";
import { LEVEL_TILE_VERTICES, TerrainVertexBuffer, getTileOffset } from "../buffer/TerrainVertexBuffer";
import { EditorMapData, type SceneData } from "./EditorMapData";
import {
    EditorMapObjectChunkData,
    EditorMapObjectRebuildInput,
} from "./EditorMapObjectChunkData";
import { EditorMapTerrainData } from "./EditorMapTerrainData";
import type { SceneLocData } from "../sceneLocData";

const modelHashBuf = new ModelHashBuffer(5000);

export function loadEditorMapData(
    workerState: WorkerState,
    mapX: number,
    mapY: number,
    smoothUnderlays: boolean,
): TransferDescriptor<EditorMapData | undefined> {
    const textureLoader = workerState.textureLoader;
    const textureIds = textureLoader.getTextureIds().filter((id) => textureLoader.isSd(id));
    const textureIndexMap = new Map<number, number>();
    for (let i = 0; i < textureIds.length; i++) {
        textureIndexMap.set(textureIds[i], i);
    }

    const borderSize = 6;

    const baseX = mapX * Scene.MAP_SQUARE_SIZE - borderSize;
    const baseY = mapY * Scene.MAP_SQUARE_SIZE - borderSize;
    const mapSize = Scene.MAP_SQUARE_SIZE + borderSize * 2;

    const scene = workerState.sceneBuilder.buildScene(
        baseX,
        baseY,
        mapSize,
        mapSize,
        true,
        smoothUnderlays,
        LocLoadType.MODELS,
    );
    const sceneLocDecodeStats = collectSceneLocDecodeStats(scene, borderSize);

    const terrainVertexBuffer = new TerrainVertexBuffer(scene.levels * LEVEL_TILE_VERTICES);

    const terrainDrawRanges = addTerrain(
        textureIndexMap,
        terrainVertexBuffer,
        scene,
        borderSize,
        3,
    );

    const sceneLocData = serializeSceneLocData(scene, borderSize);
    const objectChunks = buildAllObjectChunks(workerState, textureIndexMap, scene, borderSize);

    const heightMapTextureData = loadHeightMapTextureData(scene);

    const transferables: Transferable[] = [
        terrainVertexBuffer.bytes.buffer,
        heightMapTextureData.buffer,
        ...collectObjectChunkTransferables(objectChunks),
        ...scene.tileHeights.flat().map((a) => a.buffer),
        ...scene.tileRenderFlags.flat().map((a) => a.buffer),
        ...scene.tileUnderlays.flat().map((a) => a.buffer),
        ...scene.tileOverlays.flat().map((a) => a.buffer),
        ...scene.tileShapes.flat().map((a) => a.buffer),
        ...scene.tileRotations.flat().map((a) => a.buffer),
        ...scene.tileLightOcclusions.flat().map((a) => a.buffer),
        ...scene.tileLights.flat().map((a) => a.buffer),
        ...scene.tileBlendedColors.flat().map((a) => a.buffer),
    ];

    return Transfer<EditorMapData>(
        {
            mapX,
            mapY,
            borderSize,

            scene: {
                levels: scene.levels,
                sizeX: scene.sizeX,
                sizeY: scene.sizeY,

                tileHeights: scene.tileHeights,
                tileRenderFlags: scene.tileRenderFlags,
                tileUnderlays: scene.tileUnderlays,
                tileOverlays: scene.tileOverlays,
                tileShapes: scene.tileShapes,
                tileRotations: scene.tileRotations,

                tileLightOcclusions: scene.tileLightOcclusions,
                tileLights: scene.tileLights,

                tileBlendedColors: scene.tileBlendedColors,
            },

            terrainVertices: terrainVertexBuffer.bytes,
            terrainDrawRanges,
            sceneLocData,
            objectChunks,

            heightMapTextureData,
        },
        transferables,
    );
}

export function loadEditorMapObjectData(
    workerState: WorkerState,
    input: EditorMapObjectRebuildInput,
    smoothUnderlays: boolean,
): TransferDescriptor<EditorMapObjectChunkData[]> {
    const textureLoader = workerState.textureLoader;
    const textureIds = textureLoader.getTextureIds().filter((id) => textureLoader.isSd(id));
    const textureIndexMap = new Map<number, number>();
    for (let i = 0; i < textureIds.length; i++) {
        textureIndexMap.set(textureIds[i], i);
    }

    const scene = buildEditorSceneFromData(
        input.scene,
        input.sceneLocData,
        workerState.sceneBuilder,
        smoothUnderlays,
    );

    const chunks: EditorMapObjectChunkData[] = [];
    for (const chunkId of input.chunkIds) {
        chunks.push(
            buildObjectChunkMesh(workerState, textureIndexMap, scene, input.borderSize, chunkId),
        );
    }

    return Transfer(chunks, collectObjectChunkTransferables(chunks));
}

function buildEditorSceneFromData(
    sceneData: SceneData,
    sceneLocData: SceneLocData,
    sceneBuilder: SceneBuilder,
    smoothUnderlays: boolean,
): Scene {
    const scene = new Scene(sceneData.levels, sceneData.sizeX, sceneData.sizeY);
    scene.tileHeights = sceneData.tileHeights;
    scene.tileRenderFlags = sceneData.tileRenderFlags;
    scene.tileUnderlays = sceneData.tileUnderlays;
    scene.tileOverlays = sceneData.tileOverlays;
    scene.tileShapes = sceneData.tileShapes;
    scene.tileRotations = sceneData.tileRotations;
    scene.tileLightOcclusions = sceneData.tileLightOcclusions;
    scene.tileLights = sceneData.tileLights;
    scene.tileBlendedColors = sceneData.tileBlendedColors;
    applySceneLocData(scene, sceneLocData);
    sceneBuilder.addTileModels(scene, smoothUnderlays);
    scene.setTileMinLevels();
    return scene;
}

function buildAllObjectChunks(
    workerState: WorkerState,
    textureIndexMap: Map<number, number>,
    scene: Scene,
    borderSize: number,
): EditorMapObjectChunkData[] {
    const chunks: EditorMapObjectChunkData[] = [];
    for (let chunkId = 0; chunkId < OBJECT_CHUNK_COUNT; chunkId++) {
        chunks.push(buildObjectChunkMesh(workerState, textureIndexMap, scene, borderSize, chunkId));
    }
    return chunks;
}

function buildObjectChunkMesh(
    workerState: WorkerState,
    textureIndexMap: Map<number, number>,
    scene: Scene,
    borderSize: number,
    chunkId: number,
): EditorMapObjectChunkData {
    const objectSceneBuf = new SceneBuffer(workerState.textureLoader, textureIndexMap, 100000);
    const sceneLocs = getSceneLocsForChunk(
        workerState.locTypeLoader,
        scene,
        borderSize,
        3,
        chunkId,
    );
    const sceneModels = sceneLocs.locs;
    const locAnimatedGroups = addLocEntities(
        workerState,
        scene,
        workerState.sceneBuilder.centerLocHeightWithSize,
        sceneModels,
        objectSceneBuf,
        sceneLocs.locEntities,
    );
    addSceneModels(objectSceneBuf, sceneModels);
    const locsAnimated = objectSceneBuf.addLocAnimatedGroups(locAnimatedGroups);

    const objectVertices = objectSceneBuf.vertexBuf.byteArray();
    const objectIndices = new Int32Array(objectSceneBuf.indices);
    const objectModelTextureData = createModelInfoTextureData(objectSceneBuf.drawCommands);
    const objectModelTextureDataAlpha = createModelInfoTextureData(objectSceneBuf.drawCommandsAlpha);
    const objectDrawRanges = objectSceneBuf.drawCommands.map((cmd) =>
        newDrawRange(cmd.offset, cmd.elements, cmd.instances.length),
    );
    const objectDrawRangesAlpha = objectSceneBuf.drawCommandsAlpha.map((cmd) =>
        newDrawRange(cmd.offset, cmd.elements, cmd.instances.length),
    );

    return {
        chunkId,
        objectVertices,
        objectIndices,
        objectModelTextureData,
        objectModelTextureDataAlpha,
        objectDrawRanges,
        objectDrawRangesAlpha,
        locsAnimated,
    };
}

function collectObjectChunkTransferables(chunks: EditorMapObjectChunkData[]): Transferable[] {
    const transferables: Transferable[] = [];
    for (const chunk of chunks) {
        transferables.push(
            chunk.objectVertices.buffer,
            chunk.objectIndices.buffer,
            chunk.objectModelTextureData.buffer,
            chunk.objectModelTextureDataAlpha.buffer,
        );
    }
    return transferables;
}

function collectSceneLocDecodeStats(
    scene: Scene,
    borderSize: number,
): {
    tilesWithLocData: number;
    floorDecorationTiles: number;
    wallTiles: number;
    wallDecorationTiles: number;
    locEntriesTotal: number;
    locEntriesByLevel: number[];
} {
    const startX = borderSize;
    const startY = borderSize;
    const endX = borderSize + Scene.MAP_SQUARE_SIZE;
    const endY = borderSize + Scene.MAP_SQUARE_SIZE;

    let tilesWithLocData = 0;
    let floorDecorationTiles = 0;
    let wallTiles = 0;
    let wallDecorationTiles = 0;
    let locEntriesTotal = 0;
    const locEntriesByLevel = new Array(scene.levels).fill(0) as number[];

    for (let level = 0; level < scene.levels; level++) {
        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                const tile = scene.tiles[level][x][y];
                if (!tile) {
                    continue;
                }
                const hasFloorDec = tile.floorDecoration !== undefined;
                const hasWall = tile.wall !== undefined;
                const hasWallDec = tile.wallDecoration !== undefined;
                const locCount = tile.locs.length;
                if (hasFloorDec) {
                    floorDecorationTiles++;
                }
                if (hasWall) {
                    wallTiles++;
                }
                if (hasWallDec) {
                    wallDecorationTiles++;
                }
                if (hasFloorDec || hasWall || hasWallDec || locCount > 0) {
                    tilesWithLocData++;
                }
                if (locCount > 0) {
                    locEntriesTotal += locCount;
                    locEntriesByLevel[level] += locCount;
                }
            }
        }
    }

    return {
        tilesWithLocData,
        floorDecorationTiles,
        wallTiles,
        wallDecorationTiles,
        locEntriesTotal,
        locEntriesByLevel,
    };
}

function createModelGroups(
    modelGroupMap: Map<number, ModelMergeGroup>,
    sceneModels: SceneModel[],
    transparent: boolean,
): void {
    for (const sceneModel of sceneModels) {
        const key =
            Number(transparent) |
            ((sceneModel.lowDetail ? 1 : 0) << 1) |
            (sceneModel.level << 2) |
            (sceneModel.priority << 4);

        const group = modelGroupMap.get(key);
        if (group) {
            group.models.push(sceneModel);
        } else {
            modelGroupMap.set(key, {
                transparent,
                lowDetail: sceneModel.lowDetail,
                level: sceneModel.level,
                priority: sceneModel.priority,
                models: [sceneModel],
            });
        }
    }
}

function addSceneModels(sceneBuf: SceneBuffer, sceneModels: SceneModel[]): void {
    const groupedModels = new Map<number, SceneModel[]>();
    for (const sceneModel of sceneModels) {
        const model = sceneModel.model;
        const hash = getModelHash(modelHashBuf, model);
        const list = groupedModels.get(hash);
        if (list) {
            list.push(sceneModel);
        } else {
            groupedModels.set(hash, [sceneModel]);
        }
    }

    const modelGroupMap: Map<number, ModelMergeGroup> = new Map();
    for (const models of groupedModels.values()) {
        const model = models[0].model;
        const faces = getModelFaces(model);
        const opaqueFaces: ModelFace[] = [];
        const transparentFaces: ModelFace[] = [];
        for (const face of faces) {
            if (isModelFaceTransparent(sceneBuf.textureLoader, face)) {
                transparentFaces.push(face);
            } else {
                opaqueFaces.push(face);
            }
        }

        const mergeModels: SceneModel[] = [];
        const instancedModels: SceneModel[] = [];
        const lodModels: SceneModel[] = [];
        for (const sceneModel of models) {
            if (sceneModel.forceMerge) {
                mergeModels.push(sceneModel);
            } else {
                instancedModels.push(sceneModel);
                if (!sceneModel.lowDetail) {
                    lodModels.push(sceneModel);
                }
            }
        }

        createModelGroups(modelGroupMap, mergeModels, false);
        if (transparentFaces.length > 0) {
            createModelGroups(modelGroupMap, mergeModels, true);
        }

        const instanceCount = instancedModels.length;
        const mergeOpaque = instanceCount === 1 || instanceCount * opaqueFaces.length < 100;
        const mergeTransparent = instanceCount === 1 || instanceCount * transparentFaces.length < 100;

        if (mergeOpaque) {
            createModelGroups(modelGroupMap, instancedModels, false);
        } else if (opaqueFaces.length > 0) {
            const indexOffset = sceneBuf.indexByteOffset();
            sceneBuf.addModel(model, opaqueFaces);
            const elementCount = (sceneBuf.indexByteOffset() - indexOffset) / 4;

            const drawCommand: DrawCommand = {
                offset: indexOffset,
                elements: elementCount,
                instances: models,
            };

            sceneBuf.drawCommands.push(drawCommand);
            sceneBuf.drawCommandsInteract.push(drawCommand);
            if (lodModels.length > 0) {
                const drawCommandLod: DrawCommand = {
                    offset: indexOffset,
                    elements: elementCount,
                    instances: lodModels,
                };
                sceneBuf.drawCommandsLod.push(drawCommandLod);
                sceneBuf.drawCommandsInteractLod.push(drawCommandLod);
            }
        }

        if (mergeTransparent && transparentFaces.length > 0) {
            createModelGroups(modelGroupMap, instancedModels, true);
        } else if (transparentFaces.length > 0) {
            const indexOffset = sceneBuf.indexByteOffset();
            sceneBuf.addModel(model, transparentFaces);
            const elementCount = (sceneBuf.indexByteOffset() - indexOffset) / 4;

            const drawCommand: DrawCommand = {
                offset: indexOffset,
                elements: elementCount,
                instances: models,
            };

            sceneBuf.drawCommandsAlpha.push(drawCommand);
            sceneBuf.drawCommandsInteractAlpha.push(drawCommand);
            if (lodModels.length > 0) {
                const drawCommandLod: DrawCommand = {
                    offset: indexOffset,
                    elements: elementCount,
                    instances: lodModels,
                };
                sceneBuf.drawCommandsLodAlpha.push(drawCommandLod);
                sceneBuf.drawCommandsInteractLodAlpha.push(drawCommandLod);
            }
        }
    }

    for (const group of modelGroupMap.values()) {
        sceneBuf.addModelGroup(group);
    }
}

function addLocAnimationFrames(
    workerState: WorkerState,
    sceneBuf: SceneBuffer,
    entity: LocEntity,
    locType: LocType,
): AnimationFrames | undefined {
    const seqType = workerState.locModelLoader.seqTypeLoader.load(entity.seqId);
    let frameCount: number;
    if (seqType.isSkeletalSeq()) {
        frameCount = seqType.getSkeletalDuration();
    } else {
        if (!seqType.frameIds) {
            return undefined;
        }
        frameCount = seqType.frameIds.length;
    }
    if (frameCount === 0) {
        return undefined;
    }
    const frames = new Array<DrawRange>(frameCount);
    const framesAlpha = new Array<DrawRange>(frameCount);
    let alphaFrameCount = 0;
    for (let i = 0; i < frameCount; i++) {
        const model = workerState.locModelLoader.getModelAnimated(
            locType,
            entity.type,
            entity.rotation,
            entity.seqId,
            i,
        );
        if (model) {
            frames[i] = sceneBuf.addModelAnimFrame(model, false);
            framesAlpha[i] = sceneBuf.addModelAnimFrame(model, true);
            if (framesAlpha[i][1] > 0) {
                alphaFrameCount++;
            }
        } else {
            frames[i] = NULL_DRAW_RANGE;
            framesAlpha[i] = NULL_DRAW_RANGE;
        }
    }

    return {
        frames,
        framesAlpha: alphaFrameCount > 0 ? framesAlpha : undefined,
    };
}

function addLocEntities(
    workerState: WorkerState,
    scene: Scene,
    centerLocHeightWithSize: boolean,
    sceneModels: SceneModel[],
    sceneBuf: SceneBuffer,
    locEntities: SceneLocEntity[],
): Iterable<LocAnimatedGroup> {
    const locAnimatedGroupMap = new Map<number, LocAnimatedGroup>();
    for (const sceneLocEntity of locEntities) {
        const entity = sceneLocEntity.entity;
        const type = entity.type;
        const rotation = entity.rotation;
        const tileX = entity.tileX;
        const tileY = entity.tileY;
        const level = entity.level;

        let locType = workerState.locTypeLoader.load(entity.id);
        let sizeX = locType.sizeX;
        let sizeY = locType.sizeY;
        if (rotation === 1 || rotation === 3) {
            sizeX = locType.sizeY;
            sizeY = locType.sizeX;
        }

        if (locType.transforms) {
            const transformed = locType.transform(workerState.varManager, workerState.locTypeLoader);
            if (!transformed) {
                continue;
            }
            locType = transformed;
        }

        let startX = (sizeX >> 1) + tileX;
        let endX = ((sizeX + 1) >> 1) + tileX;
        let startY = (sizeY >> 1) + tileY;
        let endY = ((sizeY + 1) >> 1) + tileY;
        if (!centerLocHeightWithSize) {
            startX = tileX;
            endX = tileX + 1;
            startY = tileY;
            endY = tileY + 1;
        }

        const heightMap = scene.tileHeights[level];
        let heightMapAbove: Int32Array[] | undefined;
        if (level < scene.levels - 1) {
            heightMapAbove = scene.tileHeights[level + 1];
        }

        const centerHeight =
            (heightMap[endX][endY] +
                heightMap[startX][endY] +
                heightMap[startX][startY] +
                heightMap[endX][startY]) >>
            2;

        const contourGroundInfo = {
            type: locType.contourGroundType,
            param: locType.contourGroundParam,
            heightMap,
            heightMapAbove,
            entityX: (tileX << 7) + (sizeX << 6),
            entityY: centerHeight,
            entityZ: (tileY << 7) + (sizeY << 6),
        };

        const model = workerState.locModelLoader.getModelAnimated(
            locType,
            type,
            rotation,
            -1,
            -1,
            contourGroundInfo,
        );
        const lowDetail = isLowDetail(scene, level, tileX, tileY, locType, type);
        if (entity.seqId !== -1) {
            const loc = {
                ...sceneLocEntity,
                lowDetail,
                interactId: locType.id,
            };
            const key = rotation + (type << 3) + (locType.id << 10);
            const group = locAnimatedGroupMap.get(key);
            if (group) {
                group.locs.push(loc);
            } else {
                const anim = addLocAnimationFrames(workerState, sceneBuf, entity, locType);
                if (!anim) {
                    continue;
                }
                locAnimatedGroupMap.set(key, {
                    anim,
                    locs: [loc],
                });
            }
            continue;
        }
        if (!model) {
            continue;
        }
        sceneModels.push({
            ...sceneLocEntity,
            model,
            sceneHeight: sceneLocEntity.sceneLoc.height,
            lowDetail,
            forceMerge: locType.contourGroundType > 1,
            interactId: locType.id,
        });
    }
    return locAnimatedGroupMap.values();
}


export function loadEditorMapTerrainData(
    workerState: WorkerState,
    mapX: number,
    mapY: number,
    heightMapTextureData: Float32Array,
    smoothUnderlays: boolean,
): EditorMapTerrainData | undefined {
    const sceneBuilder = workerState.sceneBuilder;

    const textureLoader = workerState.textureLoader;
    const textureIds = textureLoader.getTextureIds().filter((id) => textureLoader.isSd(id));
    const textureIndexMap = new Map<number, number>();
    for (let i = 0; i < textureIds.length; i++) {
        textureIndexMap.set(textureIds[i], i);
    }

    const borderSize = 6;

    const baseX = mapX * Scene.MAP_SQUARE_SIZE - borderSize;
    const baseY = mapY * Scene.MAP_SQUARE_SIZE - borderSize;
    const mapSize = Scene.MAP_SQUARE_SIZE + borderSize * 2;

    const scene = sceneBuilder.buildScene(
        baseX,
        baseY,
        mapSize,
        mapSize,
        false,
        smoothUnderlays,
        LocLoadType.NO_MODELS,
    );

    applyHeightMapTextureData(scene, heightMapTextureData);

    sceneBuilder.addTileModels(scene, smoothUnderlays);

    const terrainVertexBuffer = new TerrainVertexBuffer(scene.levels * LEVEL_TILE_VERTICES);

    const terrainDrawRanges = addTerrain(
        textureIndexMap,
        terrainVertexBuffer,
        scene,
        borderSize,
        3,
    );

    return {
        mapX,
        mapY,
        borderSize,

        terrainVertices: terrainVertexBuffer.bytes,
        terrainDrawRanges,
    };
}

export function addTerrain(
    textureIndexMap: Map<number, number>,
    vertexBuf: TerrainVertexBuffer,
    scene: Scene,
    borderSize: number,
    maxLevel: number,
): DrawRange[] {
    const startX = borderSize;
    const startY = borderSize;
    const endX = borderSize + Scene.MAP_SQUARE_SIZE;
    const endY = borderSize + Scene.MAP_SQUARE_SIZE;

    const vertexOffset = borderSize * -128;

    const drawRanges: DrawRange[] = [];

    for (let level = 0; level < scene.levels; level++) {
        for (let x = startX; x < endX; x++) {
            for (let y = startY; y < endY; y++) {
                const tile = scene.tiles[level][x][y];
                if (
                    !tile ||
                    (tile.minLevel > maxLevel &&
                        !scene.isPlayerLevel(level, x, y, maxLevel))
                ) {
                    continue;
                }
                const realX = x - borderSize;
                const realY = y - borderSize;
                vertexBuf.offset = getTileOffset(level, realX, realY);
                addTerrainTile(textureIndexMap, vertexBuf, tile, vertexOffset, vertexOffset);
            }
        }

        const offset = level * LEVEL_TILE_VERTICES;

        drawRanges.push(newDrawRange(offset, offset + LEVEL_TILE_VERTICES));

        // if (levelVertexCount > 0) {
        // }
    }

    return drawRanges;
}

export function addTerrainTile(
    textureIndexMap: Map<number, number>,
    vertexBuf: TerrainVertexBuffer,
    tile: SceneTile,
    offsetX: number,
    offsetY: number,
): void {
    const tileModel = tile.tileModel;
    if (!tileModel) {
        return;
    }
    for (const face of tileModel.faces) {
        for (const vertex of face.vertices) {
            const textureIndex = textureIndexMap.get(vertex.textureId) ?? -1;

            // if (textureIndex !== -1) {
            //     this.usedTextureIds.add(vertex.textureId);
            // }
            // const textureIndex = vertex.textureId;

            const index = vertexBuf.addVertex(
                vertex.x + offsetX,
                vertex.z + offsetY,
                vertex.hsl,
                textureIndex,
            );
        }
    }
}
