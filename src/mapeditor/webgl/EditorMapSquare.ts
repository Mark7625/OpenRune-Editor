import PicoGL, {
    DrawCall,
    App as PicoApp,
    Program,
    Texture,
    UniformBuffer,
    VertexArray,
    VertexBuffer,
} from "picogl";

import { MapSquare } from "../../mapviewer/MapManager";
import { DrawRange } from "../../mapviewer/webgl/DrawRange";
import { LocAnimated } from "../../mapviewer/webgl/loc/LocAnimated";
import { SeqTypeLoader } from "../../rs/config/seqtype/SeqTypeLoader";
import { Scene, loadTileRenderFlagsTextureData } from "../../rs/scene/Scene";
import { OBJECT_CHUNK_COUNT } from "./objectChunk";
import { applySceneLocData, type SceneLocData } from "./sceneLocData";
import { ObjectPickIndex } from "./sceneLocPicker";
import { EditorMapData } from "./loader/EditorMapData";
import { EditorMapObjectChunkData } from "./loader/EditorMapObjectChunkData";
import { createTileRenderFlagsTexture } from "../../mapviewer/webgl/TileRenderFlagsTexture";

export function createHeightMapTexture(
    app: PicoApp,
    borderSize: number,
    heightMapTextureData: Float32Array,
): Texture {
    const heightMapSize = Scene.MAP_SQUARE_SIZE + borderSize * 2;
    return app.createTextureArray(
        heightMapTextureData,
        heightMapSize,
        heightMapSize,
        Scene.MAX_LEVELS,
        {
            internalFormat: PicoGL.R32F,
            minFilter: PicoGL.LINEAR,
            magFilter: PicoGL.LINEAR,
            type: PicoGL.FLOAT,
            wrapS: PicoGL.CLAMP_TO_EDGE,
            wrapT: PicoGL.CLAMP_TO_EDGE,
        },
    );
}

function createObjectHeightMapTexture(
    app: PicoApp,
    borderSize: number,
    heightMapTextureData: Float32Array,
): Texture {
    const heightMapSize = Scene.MAP_SQUARE_SIZE + borderSize * 2;
    const intData = new Int16Array(heightMapTextureData.length);
    for (let i = 0; i < heightMapTextureData.length; i++) {
        intData[i] = heightMapTextureData[i] | 0;
    }
    return app.createTextureArray(intData, heightMapSize, heightMapSize, Scene.MAX_LEVELS, {
        internalFormat: PicoGL.R16I,
        minFilter: PicoGL.NEAREST,
        magFilter: PicoGL.NEAREST,
        type: PicoGL.SHORT,
        wrapS: PicoGL.CLAMP_TO_EDGE,
        wrapT: PicoGL.CLAMP_TO_EDGE,
    });
}

export class EditorObjectChunk {
    objectDrawRanges: DrawRange[] = [];
    objectDrawRangesAlpha: DrawRange[] = [];
    locsAnimated: LocAnimated[] = [];

    constructor(
        readonly chunkId: number,
        readonly vertexBuffer: VertexBuffer,
        readonly indexBuffer: VertexBuffer,
        readonly vertexArray: VertexArray,
        readonly modelInfoTexture: Texture,
        readonly modelInfoTextureAlpha: Texture,
        readonly drawCall: DrawCall,
        readonly drawCallAlpha: DrawCall,
    ) {}

    static create(
        app: PicoApp,
        chunkData: EditorMapObjectChunkData,
        sceneUniformBuffer: UniformBuffer,
        textures: Texture,
        materialsTexture: Texture,
        objectProgram: Program,
        objectAlphaProgram: Program,
        objectHeightMapTexture: Texture,
        tileRenderFlagsTexture: Texture,
        mapX: number,
        mapY: number,
        seqTypeLoader: SeqTypeLoader,
        cycle: number,
    ): EditorObjectChunk {
        const objectVertices = chunkData.objectVertices ?? new Uint8Array(0);
        const objectIndices = chunkData.objectIndices ?? new Int32Array(0);
        const objectModelTextureData = chunkData.objectModelTextureData ?? new Uint16Array(16 * 4);
        const objectModelTextureDataAlpha =
            chunkData.objectModelTextureDataAlpha ?? new Uint16Array(16 * 4);
        const objectDrawRanges = chunkData.objectDrawRanges ?? [];
        const objectDrawRangesAlpha = chunkData.objectDrawRangesAlpha ?? [];

        const vertexBuffer = app.createInterleavedBuffer(12, objectVertices);
        const indexBuffer = app.createIndexBuffer(PicoGL.UNSIGNED_INT, objectIndices);
        const vertexArray = app
            .createVertexArray()
            .vertexAttributeBuffer(0, vertexBuffer, {
                type: PicoGL.UNSIGNED_INT,
                size: 3,
                stride: 12,
                integer: true as any,
            })
            .indexBuffer(indexBuffer);
        const modelInfoTexture = app.createTexture2D(
            objectModelTextureData,
            16,
            Math.max(Math.ceil(objectModelTextureData.length / 16 / 4), 1),
            {
                internalFormat: PicoGL.RGBA16UI,
                minFilter: PicoGL.NEAREST,
                magFilter: PicoGL.NEAREST,
            },
        );
        const modelInfoTextureAlpha = app.createTexture2D(
            objectModelTextureDataAlpha,
            16,
            Math.max(Math.ceil(objectModelTextureDataAlpha.length / 16 / 4), 1),
            {
                internalFormat: PicoGL.RGBA16UI,
                minFilter: PicoGL.NEAREST,
                magFilter: PicoGL.NEAREST,
            },
        );
        const drawCall = app
            .createDrawCall(objectProgram, vertexArray)
            .uniformBlock("SceneUniforms", sceneUniformBuffer)
            .uniform("u_mapPos", [mapX, mapY])
            .uniform("u_timeLoaded", 0)
            .uniform("u_drawIdOffset", 0)
            .texture("u_textures", textures)
            .texture("u_textureMaterials", materialsTexture)
            .texture("u_heightMap", objectHeightMapTexture)
            .texture("u_tileRenderFlags", tileRenderFlagsTexture)
            .texture("u_modelInfoTexture", modelInfoTexture);
        if (objectDrawRanges.length > 0) {
            drawCall.drawRanges(...objectDrawRanges);
        }
        const drawCallAlpha = app
            .createDrawCall(objectAlphaProgram, vertexArray)
            .uniformBlock("SceneUniforms", sceneUniformBuffer)
            .uniform("u_mapPos", [mapX, mapY])
            .uniform("u_timeLoaded", 0)
            .uniform("u_drawIdOffset", 0)
            .texture("u_textures", textures)
            .texture("u_textureMaterials", materialsTexture)
            .texture("u_heightMap", objectHeightMapTexture)
            .texture("u_tileRenderFlags", tileRenderFlagsTexture)
            .texture("u_modelInfoTexture", modelInfoTextureAlpha);
        if (objectDrawRangesAlpha.length > 0) {
            drawCallAlpha.drawRanges(...objectDrawRangesAlpha);
        }

        const locsAnimated = (chunkData.locsAnimated ?? []).map(
            (loc) =>
                new LocAnimated(
                    loc.drawRangeIndex,
                    loc.drawRangeAlphaIndex,
                    loc.drawRangeLodIndex,
                    loc.drawRangeLodAlphaIndex,
                    loc.drawRangeInteractIndex,
                    loc.drawRangeInteractAlphaIndex,
                    loc.drawRangeInteractLodIndex,
                    loc.drawRangeInteractLodAlphaIndex,
                    loc.anim,
                    seqTypeLoader.load(loc.seqId),
                    cycle,
                    loc.randomStart,
                ),
        );

        const chunk = new EditorObjectChunk(
            chunkData.chunkId,
            vertexBuffer,
            indexBuffer,
            vertexArray,
            modelInfoTexture,
            modelInfoTextureAlpha,
            drawCall,
            drawCallAlpha,
        );
        chunk.objectDrawRanges = objectDrawRanges;
        chunk.objectDrawRangesAlpha = objectDrawRangesAlpha;
        chunk.locsAnimated = locsAnimated;
        return chunk;
    }

    deleteGpuResources(): void {
        this.vertexBuffer.delete();
        this.indexBuffer.delete();
        this.vertexArray.delete();
        this.modelInfoTexture.delete();
        this.modelInfoTextureAlpha.delete();
    }

    delete(): void {
        this.deleteGpuResources();
    }
}

export class EditorMapSquare implements MapSquare {
    heightUpdated: boolean = false;
    /** Lowest scene level touched by a height edit (for mesh rebuild after undo/redo). */
    heightRebuildMinLevel: number | undefined = undefined;
    underlayUpdated: boolean = false;
    overlayUpdated: boolean = false;
    tileRenderFlagsUpdated: boolean = false;
    objectUpdated: boolean = false;
    dirtyObjectChunks: Set<number> = new Set();

    constructor(
        readonly mapX: number,
        readonly mapY: number,
        readonly borderSize: number,
        readonly scene: Scene,
        public sceneLocData: SceneLocData,
        public objectPickIndex: ObjectPickIndex,
        readonly terrainVertexBuffer: VertexBuffer,
        readonly terrainVertexArray: VertexArray,
        readonly terrainDrawCall: DrawCall,
        readonly terrainDrawRanges: DrawRange[],
        readonly objectChunks: EditorObjectChunk[],
        public objectHeightMapTexture: Texture,
        public heightMapTexture: Texture,
        public tileRenderFlagsTexture: Texture,
        public heightMapTextureData: Float32Array,
    ) {}

    static create(
        app: PicoApp,
        mapData: EditorMapData,
        sceneUniformBuffer: UniformBuffer,
        textures: Texture,
        materialsTexture: Texture,
        terrainProgram: Program,
        objectProgram: Program,
        objectAlphaProgram: Program,
        seqTypeLoader: SeqTypeLoader,
        cycle: number,
    ): EditorMapSquare {
        const { mapX, mapY, borderSize } = mapData;

        const scene = new Scene(mapData.scene.levels, mapData.scene.sizeX, mapData.scene.sizeY);
        scene.tileHeights = mapData.scene.tileHeights;
        scene.tileRenderFlags = mapData.scene.tileRenderFlags;
        scene.tileUnderlays = mapData.scene.tileUnderlays;
        scene.tileOverlays = mapData.scene.tileOverlays;
        scene.tileShapes = mapData.scene.tileShapes;
        scene.tileRotations = mapData.scene.tileRotations;
        scene.tileLightOcclusions = mapData.scene.tileLightOcclusions;
        scene.tileLights = mapData.scene.tileLights;
        scene.tileBlendedColors = mapData.scene.tileBlendedColors;
        applySceneLocData(scene, mapData.sceneLocData);

        const mapId = (mapX << 8) + mapY;
        const objectPickIndex = ObjectPickIndex.fromSceneLocData(
            mapX,
            mapY,
            mapId,
            mapData.sceneLocData,
        );

        const terrainVertexBuffer = app.createInterleavedBuffer(8, mapData.terrainVertices);
        const terrainVertexArray = app
            .createVertexArray()
            .vertexAttributeBuffer(0, terrainVertexBuffer, {
                type: PicoGL.UNSIGNED_SHORT,
                size: 4,
                stride: 8,
                integer: true as any,
            });

        const heightMapTexture = createHeightMapTexture(
            app,
            borderSize,
            mapData.heightMapTextureData,
        );
        const objectHeightMapTexture = createObjectHeightMapTexture(
            app,
            borderSize,
            mapData.heightMapTextureData,
        );
        const tileRenderFlagsTexture = createTileRenderFlagsTexture(
            app,
            borderSize,
            loadTileRenderFlagsTextureData(scene),
        );

        const terrainDrawCall = app
            .createDrawCall(terrainProgram, terrainVertexArray)
            .uniformBlock("SceneUniforms", sceneUniformBuffer)
            .uniform("u_mapX", mapX)
            .uniform("u_mapY", mapY)
            .texture("u_textures", textures)
            .texture("u_materials", materialsTexture)
            .texture("u_heightMap", heightMapTexture)
            .texture("u_tileRenderFlags", tileRenderFlagsTexture);

        const chunkDataList = mapData.objectChunks ?? [];
        const objectChunks: EditorObjectChunk[] = [];
        for (let chunkId = 0; chunkId < OBJECT_CHUNK_COUNT; chunkId++) {
            const chunkData = chunkDataList.find((c) => c.chunkId === chunkId) ?? {
                chunkId,
                objectVertices: new Uint8Array(0),
                objectIndices: new Int32Array(0),
                objectModelTextureData: new Uint16Array(16 * 4),
                objectModelTextureDataAlpha: new Uint16Array(16 * 4),
                objectDrawRanges: [],
                objectDrawRangesAlpha: [],
                locsAnimated: [],
            };
            objectChunks.push(
                EditorObjectChunk.create(
                    app,
                    chunkData,
                    sceneUniformBuffer,
                    textures,
                    materialsTexture,
                    objectProgram,
                    objectAlphaProgram,
                    objectHeightMapTexture,
                    tileRenderFlagsTexture,
                    mapX,
                    mapY,
                    seqTypeLoader,
                    cycle,
                ),
            );
        }

        return new EditorMapSquare(
            mapX,
            mapY,
            borderSize,
            scene,
            mapData.sceneLocData,
            objectPickIndex,
            terrainVertexBuffer,
            terrainVertexArray,
            terrainDrawCall,
            mapData.terrainDrawRanges,
            objectChunks,
            objectHeightMapTexture,
            heightMapTexture,
            tileRenderFlagsTexture,
            mapData.heightMapTextureData,
        );
    }

    getHeightMapIndex(x: number, y: number): number {
        const heightMapSize = Scene.MAP_SQUARE_SIZE + this.borderSize * 2;
        return x + heightMapSize * y;
    }

    getHeightMapHeight(x: number, y: number): number {
        return this.heightMapTextureData[this.getHeightMapIndex(x, y)];
    }

    setHeightMapHeight(x: number, y: number, height: number): void {
        this.heightMapTextureData[this.getHeightMapIndex(x, y)] = height;
    }

    updateHeightMapTexture(app: PicoApp): void {
        this.heightMapTexture.delete();

        this.heightMapTexture = createHeightMapTexture(
            app,
            this.borderSize,
            this.heightMapTextureData,
        );
        this.objectHeightMapTexture.delete();
        const nextObjectHeightMapTexture = createObjectHeightMapTexture(
            app,
            this.borderSize,
            this.heightMapTextureData,
        );
        this.terrainDrawCall.texture("u_heightMap", this.heightMapTexture);
        for (const chunk of this.objectChunks) {
            chunk.drawCall.texture("u_heightMap", nextObjectHeightMapTexture);
            chunk.drawCallAlpha.texture("u_heightMap", nextObjectHeightMapTexture);
        }
        this.objectHeightMapTexture = nextObjectHeightMapTexture;
    }

    updateTileRenderFlagsTexture(app: PicoApp): void {
        this.tileRenderFlagsTexture.delete();
        this.tileRenderFlagsTexture = createTileRenderFlagsTexture(
            app,
            this.borderSize,
            loadTileRenderFlagsTextureData(this.scene),
        );
        this.terrainDrawCall.texture("u_tileRenderFlags", this.tileRenderFlagsTexture);
        for (const chunk of this.objectChunks) {
            chunk.drawCall.texture("u_tileRenderFlags", this.tileRenderFlagsTexture);
            chunk.drawCallAlpha.texture("u_tileRenderFlags", this.tileRenderFlagsTexture);
        }
    }

    updateObjectChunk(
        app: PicoApp,
        chunkData: EditorMapObjectChunkData,
        sceneUniformBuffer: UniformBuffer,
        textures: Texture,
        materialsTexture: Texture,
        objectProgram: Program,
        objectAlphaProgram: Program,
        seqTypeLoader: SeqTypeLoader,
        cycle: number,
    ): void {
        const chunkId = chunkData.chunkId;
        this.objectChunks[chunkId]?.delete();
        this.objectChunks[chunkId] = EditorObjectChunk.create(
            app,
            chunkData,
            sceneUniformBuffer,
            textures,
            materialsTexture,
            objectProgram,
            objectAlphaProgram,
            this.objectHeightMapTexture,
            this.tileRenderFlagsTexture,
            this.mapX,
            this.mapY,
            seqTypeLoader,
            cycle,
        );
    }

    markObjectChunksDirty(localMinX: number, localMinY: number, localMaxX: number, localMaxY: number): void {
        this.objectUpdated = true;
        const chunkMinX = Math.max(0, localMinX >> 3);
        const chunkMinY = Math.max(0, localMinY >> 3);
        const chunkMaxX = Math.min(7, localMaxX >> 3);
        const chunkMaxY = Math.min(7, localMaxY >> 3);
        for (let cy = chunkMinY; cy <= chunkMaxY; cy++) {
            for (let cx = chunkMinX; cx <= chunkMaxX; cx++) {
                this.dirtyObjectChunks.add(cy * 8 + cx);
            }
        }
    }

    canRender(frameCount: number): boolean {
        return true;
    }

    delete(): void {
        this.terrainVertexBuffer.delete();
        this.terrainVertexArray.delete();
        for (const chunk of this.objectChunks) {
            chunk.delete();
        }
        this.objectHeightMapTexture.delete();
        this.heightMapTexture.delete();
        this.tileRenderFlagsTexture.delete();
    }
}
