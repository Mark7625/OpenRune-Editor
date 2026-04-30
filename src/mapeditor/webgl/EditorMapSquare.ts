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
import { Scene } from "../../rs/scene/Scene";
import { EditorMapData } from "./loader/EditorMapData";

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

function createObjectHeightMapTexture(app: PicoApp, borderSize: number, heightMapTextureData: Float32Array): Texture {
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

export class EditorMapSquare implements MapSquare {
    heightUpdated: boolean = false;
    underlayUpdated: boolean = false;
    overlayUpdated: boolean = false;

    constructor(
        readonly mapX: number,
        readonly mapY: number,
        readonly borderSize: number,
        readonly scene: Scene,
        readonly terrainVertexBuffer: VertexBuffer,
        readonly terrainVertexArray: VertexArray,
        readonly terrainDrawCall: DrawCall,
        readonly terrainDrawRanges: DrawRange[],
        readonly objectVertexBuffer: VertexBuffer,
        readonly objectIndexBuffer: VertexBuffer,
        readonly objectVertexArray: VertexArray,
        readonly objectModelInfoTexture: Texture,
        readonly objectModelInfoTextureAlpha: Texture,
        public objectHeightMapTexture: Texture,
        readonly objectDrawCall: DrawCall,
        readonly objectDrawCallAlpha: DrawCall,
        readonly objectDrawRanges: DrawRange[],
        readonly objectDrawRangesAlpha: DrawRange[],
        readonly locsAnimated: LocAnimated[],
        public heightMapTexture: Texture,
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

        const terrainDrawCall = app
            .createDrawCall(terrainProgram, terrainVertexArray)
            .uniformBlock("SceneUniforms", sceneUniformBuffer)
            .uniform("u_mapX", mapX)
            .uniform("u_mapY", mapY)
            .texture("u_textures", textures)
            .texture("u_materials", materialsTexture)
            .texture("u_heightMap", heightMapTexture);

        const objectVertices = mapData.objectVertices ?? new Uint8Array(0);
        const objectIndices = mapData.objectIndices ?? new Int32Array(0);
        const objectModelTextureData = mapData.objectModelTextureData ?? new Uint16Array(16 * 4);
        const objectModelTextureDataAlpha =
            mapData.objectModelTextureDataAlpha ?? new Uint16Array(16 * 4);
        const objectDrawRanges = mapData.objectDrawRanges ?? [];
        const objectDrawRangesAlpha = mapData.objectDrawRangesAlpha ?? [];

        const objectVertexBuffer = app.createInterleavedBuffer(12, objectVertices);
        const objectIndexBuffer = app.createIndexBuffer(PicoGL.UNSIGNED_INT, objectIndices);
        const objectVertexArray = app
            .createVertexArray()
            .vertexAttributeBuffer(0, objectVertexBuffer, {
                type: PicoGL.UNSIGNED_INT,
                size: 3,
                stride: 12,
                integer: true as any,
            })
            .indexBuffer(objectIndexBuffer);
        const objectModelInfoTexture = app.createTexture2D(
            objectModelTextureData,
            16,
            Math.max(Math.ceil(objectModelTextureData.length / 16 / 4), 1),
            {
                internalFormat: PicoGL.RGBA16UI,
                minFilter: PicoGL.NEAREST,
                magFilter: PicoGL.NEAREST,
            },
        );
        const objectModelInfoTextureAlpha = app.createTexture2D(
            objectModelTextureDataAlpha,
            16,
            Math.max(Math.ceil(objectModelTextureDataAlpha.length / 16 / 4), 1),
            {
                internalFormat: PicoGL.RGBA16UI,
                minFilter: PicoGL.NEAREST,
                magFilter: PicoGL.NEAREST,
            },
        );
        const objectDrawCall = app
            .createDrawCall(objectProgram, objectVertexArray)
            .uniformBlock("SceneUniforms", sceneUniformBuffer)
            .uniform("u_mapPos", [mapX, mapY])
            .uniform("u_timeLoaded", 0)
            .uniform("u_drawIdOffset", 0)
            .texture("u_textures", textures)
            .texture("u_textureMaterials", materialsTexture)
            .texture("u_heightMap", objectHeightMapTexture)
            .texture("u_modelInfoTexture", objectModelInfoTexture);
        if (objectDrawRanges.length > 0) {
            objectDrawCall.drawRanges(...objectDrawRanges);
        }
        const objectDrawCallAlpha = app
            .createDrawCall(objectAlphaProgram, objectVertexArray)
            .uniformBlock("SceneUniforms", sceneUniformBuffer)
            .uniform("u_mapPos", [mapX, mapY])
            .uniform("u_timeLoaded", 0)
            .uniform("u_drawIdOffset", 0)
            .texture("u_textures", textures)
            .texture("u_textureMaterials", materialsTexture)
            .texture("u_heightMap", objectHeightMapTexture)
            .texture("u_modelInfoTexture", objectModelInfoTextureAlpha);
        if (objectDrawRangesAlpha.length > 0) {
            objectDrawCallAlpha.drawRanges(...objectDrawRangesAlpha);
        }
        const locsAnimated = (mapData.locsAnimated ?? []).map(
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

        return new EditorMapSquare(
            mapX,
            mapY,
            borderSize,
            scene,
            terrainVertexBuffer,
            terrainVertexArray,
            terrainDrawCall,
            mapData.terrainDrawRanges,
            objectVertexBuffer,
            objectIndexBuffer,
            objectVertexArray,
            objectModelInfoTexture,
            objectModelInfoTextureAlpha,
            objectHeightMapTexture,
            objectDrawCall,
            objectDrawCallAlpha,
            objectDrawRanges,
            objectDrawRangesAlpha,
            locsAnimated,
            heightMapTexture,
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
        this.objectDrawCall.texture("u_heightMap", nextObjectHeightMapTexture);
        this.objectDrawCallAlpha.texture("u_heightMap", nextObjectHeightMapTexture);
        this.objectHeightMapTexture = nextObjectHeightMapTexture;
    }

    canRender(frameCount: number): boolean {
        return true;
    }

    delete(): void {
        this.terrainVertexBuffer.delete();
        this.terrainVertexArray.delete();
        this.objectVertexBuffer.delete();
        this.objectIndexBuffer.delete();
        this.objectVertexArray.delete();
        this.objectModelInfoTexture.delete();
        this.objectModelInfoTextureAlpha.delete();
        this.objectHeightMapTexture.delete();
        this.heightMapTexture.delete();
    }
}
