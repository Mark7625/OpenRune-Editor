import { vec2, vec4 } from "gl-matrix";
import PicoGL, {
    DrawCall,
    Framebuffer,
    App as PicoApp,
    Program,
    Renderbuffer,
    Texture,
    UniformBuffer,
    VertexArray,
    VertexBuffer,
} from "picogl";

import { newDrawRange } from "../../mapviewer/webgl/DrawRange";
import { createTextureArray } from "../../picogl/PicoTexture";
import { getMapSquareId } from "../../rs/map/MapFileIndex";
import { Scene, loadHeightMapTextureData } from "../../rs/scene/Scene";
import { getOverlayHighlightUvTriangles } from "../../rs/scene/SceneTileModel";
import {
    OVERLAY_MESH_BOUNDARY_SEG_MAX,
    filterBoundarySegmentsToSelectionOutline,
    overlayMeshBoundarySegments,
} from "./overlayMeshBoundary";
import { clamp } from "../../util/MathUtil";
import {
    isInBuiltinBrushShape,
} from "../plugins/builtins/current-plugin-layout.builtin";
import type { MapEditorBrushType } from "../map-editor-kinds";
import { getActivePaintModifiers } from "../editor-tool-input";
import type { IEditorPluginHost } from "../plugins/editor-plugin-host";
import { computeOverlayMatchFlood, overlayWorldKey } from "../overlay-flood-fill";
import { MapEditorRenderer } from "../MapEditorRenderer";
import { EditorMapSquare } from "./EditorMapSquare";
import type { EditorMapData } from "./loader/EditorMapData";
import type { EditorMapObjectChunkData } from "./loader/EditorMapObjectChunkData";
import { OBJECT_CHUNK_COUNT } from "./objectChunk";
import { cloneSceneLocData, serializeSceneLocData } from "./sceneLocData";
import { cloneSceneTerrainData } from "../liveMinimapWorkerPayload";
import {
    LEVEL_TILE_VERTICES,
    TOTAL_TILE_VERTICES,
    TerrainVertexBuffer,
    getTileOffset,
} from "./buffer/TerrainVertexBuffer";
import { addTerrain, addTerrainTile } from "./loader/EditorMapDataLoader";
import {
    DEFAULT_BRUSH_OUTLINE,
    DEFAULT_GIZMO_APPEARANCE,
    DEFAULT_OBJECT_SELECTOR,
    type MapEditorGizmoAppearance,
    clampThickness,
    loadGizmoAppearanceFromStorage,
} from "../map-editor-gizmo-settings";
import {
    GRID_PROGRAM,
    HIGHLIGHT_PROGRAM,
    OBJECT_WIREFRAME_PROGRAM,
    TILE_PICKING_PROGRAM,
    createObjectProgram,
    createTerrainProgram,
} from "./shaders/Shaders";
import {
    buildModelWireframeLines,
    buildFootprintWireframeLines,
    expandWireframeLinesToTriangleMesh,
    offsetWireframeLines,
    WIREFRAME_LINE_HALF_WIDTH,
    type WireframeModel,
} from "./objectWireframeMesh";
import { findLocForRef, getObjectSceneModelOffset, refreshSelectedObjectRef, syncMapObjectPickIndex, syncObjectRefFromLoc, worldTileToSceneTile } from "../plugins/builtins/object-transform-runtime";
import {
    getCopyPreviewFootprintSceneBounds,
    getSourceMapForTemplate,
    placeObjectCopyAtHover,
} from "../plugins/builtins/object-copy-placement";
import {
    clearRegionStampLivePreview,
    syncRegionStampLivePreview,
} from "../plugins/builtins/region-stamp-live-preview";
import { buildRegionStampPreviewObjectRefs } from "../plugins/builtins/region-stamp-preview";
import { stampHasObjectCategories, resolveRegionStampCopyOptions } from "../plugins/builtins/region-stamp-copy-options";
import type { WorldTileBounds } from "../plugins/builtins/region-stamp-types";
import { rotationFromLocFlags, resolveLocEntityModelParams } from "./sceneLocData";
import {
    type EditorObjectRef,
    editorObjectRefKey,
    findObjectAtHover,
    getObjectPickLevelsAt,
} from "./sceneLocPicker";
import { LocModelType } from "../../rs/config/loctype/LocModelType";
import type { LocType } from "../../rs/config/loctype/LocType";
import { LocEntity } from "../../rs/scene/entity/LocEntity";
import { Model } from "../../rs/model/Model";
import { ModelData } from "../../rs/model/ModelData";
import { applyHeightToolRuntime } from "../plugins/builtins/height-edit-runtime";
import { applyTileRenderFlagsRuntime } from "../plugins/builtins/tile-flags-edit-runtime";
import { getTileFlagsToolModel } from "../plugins/builtins/tile-flags-tool-model";
import {
    formatTileRenderFlagsForView,
    shouldShowTileRenderFlagForView,
    TILE_RENDER_FLAG_DESCRIPTORS,
    tileRenderFlagOverlayDrawLevel,
    tileRenderFlagValueLabelForView,
} from "../../rs/map/TileRenderFlags";
import { syncSceneLocHeightsForHeightEdit, markObjectChunksForHeightEdit } from "./scene-loc-height-sync";
import { recordHistoryTileMutation } from "../map-editor-history-record";

const MAX_TEXTURES = 2048;
const TEXTURE_SIZE = 128;
const BOUNDARY_SEG_UNIFORM_FLOATS = OVERLAY_MESH_BOUNDARY_SEG_MAX * 4;
const boundarySegUniformScratch = new Float32Array(BOUNDARY_SEG_UNIFORM_FLOATS);
const WIREFRAME_VERTEX_STRIDE = 16;
const WIREFRAME_GPU_FORMAT = 2;

export class WebGLMapEditorRenderer extends MapEditorRenderer<EditorMapSquare> {
    app!: PicoApp;
    gl!: WebGL2RenderingContext;

    hasMultiDraw: boolean = false;

    // Shaders
    shadersPromise?: Promise<Program[]>;
    terrainProgram?: Program;
    objectProgram?: Program;
    objectProgramAlpha?: Program;
    tilePickingProgram?: Program;
    highlightTileProgram?: Program;
    gridProgram?: Program;
    objectWireframeProgram?: Program;

    // Uniforms
    sceneUniformBuffer?: UniformBuffer;

    cameraPosUni: vec2 = vec2.fromValues(0, 0);
    resolutionUni: vec2 = vec2.fromValues(0, 0);
    skyColorUni: vec4 = vec4.fromValues(0, 0, 0, 1);

    // Framebuffers
    pickFramebuffer?: Framebuffer;
    pickColorTarget?: Renderbuffer;
    pickDepthTarget?: Renderbuffer;

    // Textures
    textureArray?: Texture;
    textureMaterials?: Texture;

    textureIds: number[] = [];
    textureIndexMap: Map<number, number> = new Map();
    loadedTextureIds: Set<number> = new Set();

    // Geometry
    gridVertexBuffer?: VertexBuffer;
    gridVertexArray?: VertexArray;

    chunkGridVertexBuffer?: VertexBuffer;
    chunkGridVertexArray?: VertexArray;

    // Draw calls
    tilePickingDrawCall!: DrawCall;
    highlightTileDrawCall!: DrawCall;

    gridDrawCall!: DrawCall;
    chunkGridDrawCall!: DrawCall;

    objectWireframeVertexBuffer?: VertexBuffer;
    objectWireframeVertexArray?: VertexArray;
    objectWireframeDrawCall?: DrawCall;

    private readonly wireframeLineCache = new Map<string, Float32Array>();
    private readonly wireframeTriCache = new Map<string, Float32Array>();
    private wireframeGpuBufferFloats = 0;
    private wireframeGpuFormatVersion = 0;

    objectSelectorHoverColor: vec4 = vec4.fromValues(...DEFAULT_OBJECT_SELECTOR.hover);
    objectSelectorSelectedColor: vec4 = vec4.fromValues(...DEFAULT_OBJECT_SELECTOR.selected);
    objectSelectorDeleteColor: vec4 = vec4.fromValues(1, 0.22, 0.22, 1);

    // State
    tilePickingBuffer = new Uint8Array(4);

    hoverWorldX: number = -1;
    hoverWorldY: number = -1;

    private tileFlagsPaintedKeys = new Set<string>();
    private tileFlagsPaintStrokeActive = false;
    private paintHistoryStrokeActive = false;

    lastTimeTerrainUpdated: number = 0;
    updatedTerrainMapIds: Set<number> = new Set();
    loadingTerrainMapIds: Set<number> = new Set();

    lastTimeObjectsUpdated: number = 0;
    updatedObjectChunksByMapId: Map<number, Set<number>> = new Map();
    loadingObjectChunksByMapId: Map<number, Set<number>> = new Map();

    drawGrid: boolean = false;
    drawChunkGrid: boolean = false;

    mapSquareGridColor: vec4 = vec4.fromValues(...DEFAULT_GIZMO_APPEARANCE.mapSquareGrid);
    mapChunkGridColor: vec4 = vec4.fromValues(...DEFAULT_GIZMO_APPEARANCE.chunkGrid);

    brushFill: vec4 = vec4.fromValues(...DEFAULT_BRUSH_OUTLINE.fill);
    brushOutlineColor: vec4 = vec4.fromValues(...DEFAULT_BRUSH_OUTLINE.outline);
    brushOutlineThickness: number = DEFAULT_BRUSH_OUTLINE.outlineThickness;

    affectedTilesMap: Map<number, Set<number>> = new Map();
    /** Local tiles where terrain height was actually changed (not terrain mesh neighbors). */
    heightChangedTilesMap: Map<number, Set<number>> = new Map();
    private brushOffsetsCache = new Map<string, ReadonlyArray<readonly [number, number]>>();
    private lastTerrainSmoothingEnabled = this.host.terrainSmoothingEnabled;
    private readonly highlightFullTileRange = newDrawRange(0, 6);
    private readonly highlightTriangleRange = newDrawRange(0, 3);

    constructor(host: IEditorPluginHost) {
        super(host);
    }

    async init(): Promise<void> {
        await super.init();

        this.app = PicoGL.createApp(this.canvas);
        this.gl = this.app.gl as WebGL2RenderingContext;

        // hack to get the right multi draw extension for picogl
        const state: any = this.app.state;
        const ext = this.gl.getExtension("WEBGL_multi_draw");
        PicoGL.WEBGL_INFO.MULTI_DRAW_INSTANCED = ext;
        state.extensions.multiDrawInstanced = ext;

        this.hasMultiDraw = !!PicoGL.WEBGL_INFO.MULTI_DRAW_INSTANCED;

        this.app.enable(PicoGL.CULL_FACE);
        this.app.enable(PicoGL.DEPTH_TEST);
        this.app.depthFunc(PicoGL.LEQUAL);
        this.app.enable(PicoGL.BLEND);
        this.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA);
        this.app.clearColor(0.0, 0.0, 0.0, 1.0);
        this.app.clear();

        this.shadersPromise = this.initShaders();
        await this.shadersPromise;

        this.sceneUniformBuffer = this.app.createUniformBuffer([
            PicoGL.FLOAT_MAT4, // mat4 u_viewProjMatrix;
            PicoGL.FLOAT_MAT4, // mat4 u_viewMatrix;
            PicoGL.FLOAT_MAT4, // mat4 u_projectionMatrix;
            PicoGL.FLOAT_VEC4, // vec4 u_skyColor;
            PicoGL.FLOAT_VEC2, // vec2 u_cameraPos;
            PicoGL.FLOAT, // float u_renderDistance;
            PicoGL.FLOAT, // float u_fogDepth;
            PicoGL.FLOAT, // float u_currentTime;
            PicoGL.FLOAT, // float u_brightness;
            PicoGL.FLOAT, // float u_colorBanding;
            PicoGL.FLOAT, // float u_isNewTextureAnim;
        ]);

        this.initFramebuffers();
        this.initTextures();
        this.initGrid();

        this.tilePickingDrawCall.uniformBlock("SceneUniforms", this.sceneUniformBuffer);
        // 6 vertices/2 triangles per tile
        this.tilePickingDrawCall.drawRanges(newDrawRange(0, 64 * 64 * 6));

        this.highlightTileDrawCall.uniformBlock("SceneUniforms", this.sceneUniformBuffer);
        this.objectWireframeDrawCall?.uniformBlock("SceneUniforms", this.sceneUniformBuffer);
        this.highlightTileDrawCall.uniform("u_highlightShapeMode", 0);
        this.highlightTileDrawCall.uniform("u_cornerA", [0, 0]);
        this.highlightTileDrawCall.uniform("u_cornerB", [0, 0]);
        this.highlightTileDrawCall.uniform("u_cornerC", [0, 0]);
        this.highlightTileDrawCall.uniform("u_edgeMask", [1, 1, 1, 1]);
        this.highlightTileDrawCall.uniform("u_footprintPass", 0);
        this.highlightTileDrawCall.uniform("u_boundarySegCount", 0);
        // 6 vertices/2 triangles per tile
        this.highlightTileDrawCall.drawRanges(this.highlightFullTileRange);

        const stored = loadGizmoAppearanceFromStorage();
        this.applyGizmoAppearance({
            ...DEFAULT_GIZMO_APPEARANCE,
            ...(stored ?? {}),
        });
        this.applyBrushHighlightUniforms();
    }

    async initShaders(): Promise<Program[]> {
        const hasMultiDraw = this.hasMultiDraw;

        const programs = await this.app.createPrograms(
            createTerrainProgram(hasMultiDraw),
            createObjectProgram(hasMultiDraw, false),
            createObjectProgram(hasMultiDraw, true),
            TILE_PICKING_PROGRAM,
            HIGHLIGHT_PROGRAM,
            GRID_PROGRAM,
            OBJECT_WIREFRAME_PROGRAM,
        );

        const [
            terrainProgram,
            objectProgram,
            objectProgramAlpha,
            tilePickingProgram,
            highlightTileProgram,
            gridProgram,
            objectWireframeProgram,
        ] = programs;
        this.terrainProgram = terrainProgram;
        this.objectProgram = objectProgram;
        this.objectProgramAlpha = objectProgramAlpha;
        this.tilePickingProgram = tilePickingProgram;
        this.highlightTileProgram = highlightTileProgram;
        this.gridProgram = gridProgram;
        this.objectWireframeProgram = objectWireframeProgram;

        this.tilePickingDrawCall = this.app.createDrawCall(this.tilePickingProgram);
        this.highlightTileDrawCall = this.app.createDrawCall(this.highlightTileProgram);

        return programs;
    }

    createGridPoints(chunkGrid: boolean): Uint16Array {
        const lineCount = chunkGrid ? 9 : 2;

        const points = new Uint16Array(64 * lineCount * 2 * 2 * 2);
        let offset = 0;
        // Horizontal lines
        for (let y = 0; y < 9; y++) {
            for (let x = 0; x < 64; x++) {
                if (y !== 0 && y !== 8 && !chunkGrid) {
                    continue;
                }
                points[offset++] = x * 128;
                points[offset++] = y * 8 * 128;
                points[offset++] = (x + 1) * 128;
                points[offset++] = y * 8 * 128;
            }
        }
        // Vertical lines
        for (let x = 0; x < 9; x++) {
            for (let y = 0; y < 64; y++) {
                if (x !== 0 && x !== 8 && !chunkGrid) {
                    continue;
                }
                points[offset++] = x * 8 * 128;
                points[offset++] = y * 128;
                points[offset++] = x * 8 * 128;
                points[offset++] = (y + 1) * 128;
            }
        }

        return points;
    }

    initGrid(): void {
        const points = this.createGridPoints(false);

        this.gridVertexBuffer = this.app.createVertexBuffer(PicoGL.UNSIGNED_SHORT, 2, points);
        this.gridVertexArray = this.app
            .createVertexArray()
            .vertexAttributeBuffer(0, this.gridVertexBuffer);

        this.gridDrawCall = this.app
            .createDrawCall(this.gridProgram!, this.gridVertexArray)
            .uniformBlock("SceneUniforms", this.sceneUniformBuffer!)
            .primitive(PicoGL.LINES);

        const chunkPoints = this.createGridPoints(true);
        this.chunkGridVertexBuffer = this.app.createVertexBuffer(
            PicoGL.UNSIGNED_SHORT,
            2,
            chunkPoints,
        );
        this.chunkGridVertexArray = this.app
            .createVertexArray()
            .vertexAttributeBuffer(0, this.chunkGridVertexBuffer);

        this.chunkGridDrawCall = this.app
            .createDrawCall(this.gridProgram!, this.chunkGridVertexArray)
            .uniformBlock("SceneUniforms", this.sceneUniformBuffer!)
            .primitive(PicoGL.LINES);
    }

    initFramebuffers(): void {
        this.pickFramebuffer?.delete();
        this.pickColorTarget?.delete();
        this.pickDepthTarget?.delete();

        let samples = 0;

        this.pickColorTarget = this.app.createRenderbuffer(
            this.app.width,
            this.app.height,
            PicoGL.RGBA8,
            samples,
        );
        this.pickDepthTarget = this.app.createRenderbuffer(
            this.app.width,
            this.app.height,
            PicoGL.DEPTH_COMPONENT24,
            samples,
        );
        this.pickFramebuffer = this.app
            .createFramebuffer()
            .colorTarget(0, this.pickColorTarget)
            .depthTarget(this.pickDepthTarget);
    }

    initTextures(): void {
        const textureLoader = this.host.textureLoader;

        const allTextureIds = textureLoader.getTextureIds();

        this.textureIds = allTextureIds
            .filter((id) => textureLoader.isSd(id))
            .slice(0, MAX_TEXTURES - 1);
        for (let i = 0; i < this.textureIds.length; i++) {
            this.textureIndexMap.set(this.textureIds[i], i);
        }

        this.initTextureArray();
        this.initMaterialsTexture();

        console.log("init textures", this.textureIds, allTextureIds.length);
    }

    initTextureArray() {
        if (this.textureArray) {
            this.textureArray.delete();
            this.textureArray = undefined;
        }
        this.loadedTextureIds.clear();

        console.time("load textures");

        const pixelCount = TEXTURE_SIZE * TEXTURE_SIZE;

        const textureCount = this.textureIds.length;
        const pixels = new Int32Array((textureCount + 1) * pixelCount);

        // White texture
        pixels.fill(0xffffffff, 0, pixelCount);

        const cacheInfo = this.host.loadedCache.info;

        let maxPreloadTextures = textureCount;
        // we should check if the texture loader is procedural instead
        if (cacheInfo.game === "runescape" && cacheInfo.revision >= 508) {
            maxPreloadTextures = 64;
        }

        for (let i = 0; i < Math.min(textureCount, maxPreloadTextures); i++) {
            const textureId = this.textureIds[i];
            try {
                const texturePixels = this.host.textureLoader.getPixelsArgb(
                    textureId,
                    TEXTURE_SIZE,
                    true,
                    1.0,
                );
                pixels.set(texturePixels, (i + 1) * pixelCount);
            } catch (e) {
                console.error("Failed loading texture", textureId, e);
            }
            this.loadedTextureIds.add(textureId);
        }

        this.textureArray = createTextureArray(
            this.app,
            new Uint8Array(pixels.buffer),
            TEXTURE_SIZE,
            TEXTURE_SIZE,
            textureCount + 1,
            {
                // wrapS: PicoGL.CLAMP_TO_EDGE,
                maxAnisotropy: PicoGL.WEBGL_INFO.MAX_TEXTURE_ANISOTROPY,
            },
        );

        console.timeEnd("load textures");
    }

    initMaterialsTexture(): void {
        if (this.textureMaterials) {
            this.textureMaterials.delete();
            this.textureMaterials = undefined;
        }

        const textureCount = this.textureIds.length + 1;

        const data = new Int8Array(textureCount * 4);
        for (let i = 0; i < this.textureIds.length; i++) {
            const id = this.textureIds[i];
            try {
                const material = this.host.textureLoader.getMaterial(id);

                const index = (i + 1) * 4;
                data[index] = material.animU;
                data[index + 1] = material.animV;
                data[index + 2] = material.alphaCutOff * 255;
            } catch (e) {
                console.error("Failed loading texture", id, e);
            }
        }

        this.textureMaterials = this.app.createTexture2D(data, textureCount, 1, {
            minFilter: PicoGL.NEAREST,
            magFilter: PicoGL.NEAREST,
            internalFormat: PicoGL.RGBA8I,
        });
    }

    override async queueLoadMap(mapX: number, mapY: number): Promise<void> {
        const mapData = await this.host.workerPool.queueLoadEditorMapData(
            mapX,
            mapY,
            this.host.terrainSmoothingEnabled,
        );
        if (
            !mapData ||
            !this.sceneUniformBuffer ||
            !this.textureArray ||
            !this.textureMaterials ||
            !this.terrainProgram ||
            !this.objectProgram ||
            !this.objectProgramAlpha
        ) {
            this.mapManager.addInvalidMap(mapX, mapY);
            return;
        }

        const mapSquare = EditorMapSquare.create(
            this.app,
            mapData,
            this.sceneUniformBuffer,
            this.textureArray,
            this.textureMaterials,
            this.terrainProgram,
            this.objectProgram,
            this.objectProgramAlpha,
            this.host.seqTypeLoader,
            (performance.now() * 0.001) / 0.02,
        );
        // Worker builds tile meshes only for vertex generation; the live `Scene` on the main thread never
        // received `tileModel` until an edit ran `updateAffectedTiles`. Build CPU meshes up front so
        // overlay flood / footprint highlights work before the first paint.
        this.host.sceneBuilder.addTileModels(mapSquare.scene, this.host.terrainSmoothingEnabled);
        mapSquare.scene.setTileMinLevels();

        this.mapManager.addMap(mapX, mapY, mapSquare);
        this.host.scheduleMinimapRefreshAfterEdit();
    }

    private createSyntheticFlatMapData(
        mapX: number,
        mapY: number,
        underlayId: number,
    ): EditorMapData {
        const borderSize = 6;
        const mapSize = Scene.MAP_SQUARE_SIZE + borderSize * 2;
        const scene = new Scene(Scene.MAX_LEVELS, mapSize, mapSize);
        const underlayCount = this.host.underlayTypeLoader.getCount();
        const resolvedUnderlayId =
            underlayCount > 0 ? Math.max(0, Math.min(underlayCount - 1, underlayId)) : 0;
        const storedUnderlay = resolvedUnderlayId + 1;
        for (let level = 0; level < scene.levels; level++) {
            for (let x = 0; x < scene.sizeX; x++) {
                for (let y = 0; y < scene.sizeY; y++) {
                    // Keep a single editable ground layer on plane 0 and put higher planes below it.
                    scene.tileUnderlays[level][x][y] = level === 0 ? storedUnderlay : 0;
                    scene.setHeight(level, x, y, -Scene.UNITS_LEVEL_HEIGHT * level);
                }
            }
        }

        this.host.sceneBuilder.addTileModels(scene, this.host.terrainSmoothingEnabled);
        scene.setTileMinLevels();

        const terrainVertexBuffer = new TerrainVertexBuffer(scene.levels * LEVEL_TILE_VERTICES);
        const terrainDrawRanges = addTerrain(
            this.textureIndexMap,
            terrainVertexBuffer,
            scene,
            borderSize,
            3,
        );

        const heightMapTextureData = loadHeightMapTextureData(scene);
        const emptyChunks: EditorMapObjectChunkData[] = [];
        for (let chunkId = 0; chunkId < OBJECT_CHUNK_COUNT; chunkId++) {
            emptyChunks.push({
                chunkId,
                objectVertices: new Uint8Array(0),
                objectIndices: new Int32Array(0),
                objectModelTextureData: new Uint16Array(16 * 4),
                objectModelTextureDataAlpha: new Uint16Array(16 * 4),
                objectDrawRanges: [],
                objectDrawRangesAlpha: [],
                locsAnimated: [],
            });
        }
        return {
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
            sceneLocData: { tiles: [] },
            objectChunks: emptyChunks,
            heightMapTextureData,
        };
    }

    async queueLoadObjectChunks(map: EditorMapSquare, chunkIds: number[]): Promise<void> {
        if (chunkIds.length === 0 || !this.sceneUniformBuffer || !this.textureArray || !this.textureMaterials) {
            return;
        }
        const uniqueChunkIds = [...new Set(chunkIds)];
        const sceneLocData = serializeSceneLocData(map.scene, map.borderSize);
        map.sceneLocData = sceneLocData;
        const chunkDataList = await this.host.workerPool.queueLoadEditorMapObjectData(
            map.mapX,
            map.mapY,
            map.borderSize,
            cloneSceneTerrainData(map.scene),
            cloneSceneLocData(sceneLocData),
            uniqueChunkIds,
            this.host.terrainSmoothingEnabled,
        );
        if (!chunkDataList?.length || !this.objectProgram || !this.objectProgramAlpha) {
            return;
        }
        const cycle = (performance.now() * 0.001) / 0.02;
        for (const chunkData of chunkDataList) {
            map.updateObjectChunk(
                this.app,
                chunkData,
                this.sceneUniformBuffer,
                this.textureArray,
                this.textureMaterials,
                this.objectProgram,
                this.objectProgramAlpha,
                this.host.seqTypeLoader,
                cycle,
            );
        }
    }

    scheduleObjectChunkReload(mapId: number, chunkIds: Iterable<number>): void {
        let pending = this.updatedObjectChunksByMapId.get(mapId);
        if (!pending) {
            pending = new Set();
            this.updatedObjectChunksByMapId.set(mapId, pending);
        }
        for (const chunkId of chunkIds) {
            pending.add(chunkId);
        }
    }

    async queueLoadTerrain(map: EditorMapSquare): Promise<void> {
        const mapData = await this.host.workerPool.queueLoadEditorMapTerrainData(
            map.mapX,
            map.mapY,
            map.heightMapTextureData,
            this.host.terrainSmoothingEnabled,
        );
        if (!mapData) {
            return;
        }
        map.terrainVertexBuffer.data(mapData.terrainVertices);
    }

    override handleInput(deltaTime: number): void {
        if (this.host.isEditorInputSuspended()) {
            return;
        }
        this.handleKeyInput(deltaTime);
        this.handleMouseInput();
        this.handleJoystickInput(deltaTime);
    }

    override handleMouseInput(): void {
        super.handleMouseInput();

        const inputManager = this.host.inputManager;

        const paintMods = getActivePaintModifiers(this.host);
        if (
            paintMods.controlWheelAdjustsBrushSize &&
            inputManager.isControlDown() &&
            inputManager.scrollY !== 0
        ) {
            this.host.adjustBrushSize(-Math.sign(inputManager.scrollY));
        }
    }

    override onResize(width: number, height: number): void {
        this.app.resize(width, height);
        this.pickFramebuffer?.resize(width, height);
    }

    draw(drawCall: DrawCall, drawRanges: number[][]) {
        if (this.hasMultiDraw) {
            drawCall.draw();
        } else {
            for (let i = 0; i < drawRanges.length; i++) {
                drawCall.uniform("u_drawId", i);
                drawCall.drawRanges(drawRanges[i]);
                drawCall.draw();
            }
        }
    }

    private tickAnimatedLocs(timeSec: number): void {
        const cycle = timeSec / 0.02;
        for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
            const map = this.mapManager.visibleMaps[i];
            for (const chunk of map.objectChunks) {
                for (const loc of chunk.locsAnimated) {
                    loc.update(this.host.seqFrameLoader, cycle);
                }
            }
        }
    }

    render(time: number, deltaTime: number, resized: boolean): void {
        const frameCount = this.stats.frameCount;
        const timeSec = time * 0.001;

        if (!this.sceneUniformBuffer) {
            return;
        }

        const inputManager = this.host.inputManager;
        const camera = this.host.camera;

        this.handleInput(deltaTime);

        camera.update(this.canvas.width, this.canvas.height);

        const renderDistance = this.host.renderDistance;

        this.mapManager.update(camera, frameCount, renderDistance, this.host.unloadDistance);
        this.handleTerrainSmoothingToggle();
        this.tickAnimatedLocs(timeSec);

        this.cameraPosUni[0] = camera.getPosX();
        this.cameraPosUni[1] = camera.getPosZ();

        this.sceneUniformBuffer
            .set(0, camera.viewProjMatrix as Float32Array)
            .set(1, camera.viewMatrix as Float32Array)
            .set(2, camera.projectionMatrix as Float32Array)
            .set(3, this.skyColorUni as Float32Array)
            .set(4, this.cameraPosUni as Float32Array)
            .set(5, (renderDistance * 64) as any)
            .set(6, (renderDistance * 64) as any)
            .set(7, (time * 0.001) as any)
            .set(8, 1 as any)
            .set(9, 64 as any)
            .set(10, 1 as any)
            .update();

        this.app.defaultDrawFramebuffer();
        this.app.defaultReadFramebuffer();

        this.app.clearColor(0.0, 0.0, 0.0, 1.0);
        this.app.clear();

        // Pick hover first, then paint (updates flood stroke lock), then draw so preview matches this frame.
        this.renderTilePicking();
        this.updateToolInteractionState();

        this.handleTileManipulation(time);

        this.renderTerrain(time);
        this.updateTileFlagsHoverDebug();

        for (const map of this.mapManager.mapSquares.values()) {
            if (map.objectUpdated && map.dirtyObjectChunks.size > 0) {
                this.scheduleObjectChunkReload(
                    getMapSquareId(map.mapX, map.mapY),
                    map.dirtyObjectChunks,
                );
            }
        }

        if (time - this.lastTimeTerrainUpdated > 100 && this.updatedTerrainMapIds.size > 0) {
            for (const mapId of this.updatedTerrainMapIds) {
                const map = this.mapManager.getMapById(mapId);
                if (!map) {
                    continue;
                }
                this.queueLoadTerrain(map);
            }

            this.updatedTerrainMapIds.clear();
            this.lastTimeTerrainUpdated = time;
        }

        if (time - this.lastTimeObjectsUpdated > 100 && this.updatedObjectChunksByMapId.size > 0) {
            for (const [mapId, chunkIds] of this.updatedObjectChunksByMapId) {
                if (chunkIds.size === 0) {
                    continue;
                }
                const map = this.mapManager.getMapById(mapId);
                if (!map) {
                    continue;
                }
                const loading = this.loadingObjectChunksByMapId.get(mapId) ?? new Set();
                const toLoad = [...chunkIds].filter((id) => !loading.has(id));
                if (toLoad.length === 0) {
                    continue;
                }
                for (const id of toLoad) {
                    loading.add(id);
                }
                this.loadingObjectChunksByMapId.set(mapId, loading);
                void this.queueLoadObjectChunks(map, toLoad).finally(() => {
                    const loadSet = this.loadingObjectChunksByMapId.get(mapId);
                    if (loadSet) {
                        for (const id of toLoad) {
                            loadSet.delete(id);
                            chunkIds.delete(id);
                        }
                        if (loadSet.size === 0) {
                            this.loadingObjectChunksByMapId.delete(mapId);
                        }
                    }
                    if (chunkIds.size === 0) {
                        this.updatedObjectChunksByMapId.delete(mapId);
                        map.objectUpdated = false;
                        map.dirtyObjectChunks.clear();
                    }
                });
            }
            this.lastTimeObjectsUpdated = time;
        }
    }

    private isTileFlagsToolActive(): boolean {
        return this.host.editorTool === "tile-flags" && this.host.isEditorToolPluginEnabled("tile-flags");
    }

    private isTileFlagsPainting(inputManager = this.host.inputManager): boolean {
        return this.isTileFlagsToolActive() && inputManager.isKeyDown("MouseLeft");
    }

    private syncTileFlagsPaintStroke(): void {
        const painting = this.isTileFlagsPainting();
        if (!painting) {
            this.tileFlagsPaintStrokeActive = false;
            this.tileFlagsPaintedKeys.clear();
            return;
        }
        if (!this.tileFlagsPaintStrokeActive) {
            this.tileFlagsPaintStrokeActive = true;
            this.tileFlagsPaintedKeys.clear();
        }
    }

    private syncPaintHistoryStroke(isPainting: boolean): void {
        if (!isPainting) {
            if (this.paintHistoryStrokeActive) {
                this.host.commitHistoryStroke();
                this.paintHistoryStrokeActive = false;
            }
            return;
        }
        if (!this.paintHistoryStrokeActive && this.host.editorTool !== "object-selector" && this.host.editorTool !== "object-delete" && this.host.editorTool !== "region-stamp") {
            this.host.beginHistoryStroke(this.host.editorTool);
            this.paintHistoryStrokeActive = true;
        }
    }

    private getTileRenderFlagAtWorld(level: number, worldX: number, worldY: number): number | undefined {
        const mapX = Math.floor(worldX / 64);
        const mapY = Math.floor(worldY / 64);
        const map = this.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
        if (!map) {
            return undefined;
        }
        const lx = ((worldX % 64) + 64) % 64;
        const ly = ((worldY % 64) + 64) % 64;
        const sceneX = lx + map.borderSize;
        const sceneY = ly + map.borderSize;
        if (sceneX < 0 || sceneY < 0 || sceneX >= map.scene.sizeX || sceneY >= map.scene.sizeY) {
            return undefined;
        }
        return map.scene.tileRenderFlags[level][sceneX][sceneY] ?? 0;
    }

    private drawTileFlagHighlight(
        map: EditorMapSquare,
        level: number,
        lx: number,
        ly: number,
        color: readonly [number, number, number, number],
    ): void {
        this.highlightTileDrawCall.uniform("u_fillColor", [color[0], color[1], color[2], color[3]]);
        this.highlightTileDrawCall.uniform("u_outlineColor", [color[0], color[1], color[2], Math.min(color[3] + 0.35, 1)]);
        this.highlightTileDrawCall.uniform("u_outlineThickness", 0.06);
        this.highlightTileDrawCall.uniform("u_level", level);
        this.highlightTileDrawCall.uniform("u_mapX", map.mapX);
        this.highlightTileDrawCall.uniform("u_mapY", map.mapY);
        this.highlightTileDrawCall.texture("u_heightMap", map.heightMapTexture);
        this.highlightTileDrawCall.uniform("u_edgeMask", [1, 1, 1, 1]);
        this.highlightTileDrawCall.uniform("u_highlightShapeMode", 0);
        this.highlightTileDrawCall.uniform("u_tileX", lx);
        this.highlightTileDrawCall.uniform("u_tileY", ly);
        this.highlightTileDrawCall.drawRanges(this.highlightFullTileRange);
        this.highlightTileDrawCall.draw();
    }

    private renderVisibleTileFlagOverlays(): void {
        const model = getTileFlagsToolModel(this.host);
        if (model.showFlags.size === 0) {
            return;
        }

        const level = this.host.selectedLevel;
        this.app.disable(PicoGL.DEPTH_TEST);
        this.app.disable(PicoGL.CULL_FACE);
        this.app.enable(PicoGL.BLEND);
        this.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA);

        for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
            const map = this.mapManager.visibleMaps[i];
            const scene = map.scene;
            for (let lx = 0; lx < 64; lx++) {
                for (let ly = 0; ly < 64; ly++) {
                    const sceneX = lx + map.borderSize;
                    const sceneY = ly + map.borderSize;
                    if (sceneX >= scene.sizeX || sceneY >= scene.sizeY) {
                        continue;
                    }
                    for (const descriptor of TILE_RENDER_FLAG_DESCRIPTORS) {
                        if (
                            !shouldShowTileRenderFlagForView(
                                scene.tileRenderFlags,
                                sceneX,
                                sceneY,
                                level,
                                descriptor.flag,
                                model.showFlags,
                            )
                        ) {
                            continue;
                        }
                        const drawLevel = tileRenderFlagOverlayDrawLevel(
                            scene.tileRenderFlags,
                            sceneX,
                            sceneY,
                            level,
                            descriptor.flag,
                        );
                        this.drawTileFlagHighlight(map, drawLevel, lx, ly, descriptor.color);
                    }
                }
            }
        }

        this.app.disable(PicoGL.BLEND);
        this.app.enable(PicoGL.CULL_FACE);
        this.app.enable(PicoGL.DEPTH_TEST);
    }

    private renderTileFlagsBrushPreview(): void {
        if (this.hoverWorldX === -1 || this.hoverWorldY === -1) {
            return;
        }

        const level = this.host.selectedLevel;
        this.beginTileHighlightPass(
            this.brushFill,
            this.brushOutlineColor,
            level,
            Math.min(this.brushFill[3], 0.28),
        );
        this.forEachBrushOffset((dx, dy) => {
            this.drawWorldTileHighlightAt(this.hoverWorldX + dx, this.hoverWorldY + dy, level);
        });
        this.endTileHighlightPass();
    }

    private updateTileFlagsHoverDebug(): void {
        if (!this.isTileFlagsToolActive() || this.hoverWorldX === -1 || this.hoverWorldY === -1) {
            this.host.debugText = undefined;
            return;
        }

        const level = this.host.selectedLevel;
        const mapX = Math.floor(this.hoverWorldX / 64);
        const mapY = Math.floor(this.hoverWorldY / 64);
        const map = this.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
        if (!map) {
            this.host.debugText = undefined;
            return;
        }
        const lx = ((this.hoverWorldX % 64) + 64) % 64;
        const ly = ((this.hoverWorldY % 64) + 64) % 64;
        const sceneX = lx + map.borderSize;
        const sceneY = ly + map.borderSize;
        const labels = formatTileRenderFlagsForView(map.scene.tileRenderFlags, sceneX, sceneY, level);
        const raw = tileRenderFlagValueLabelForView(map.scene.tileRenderFlags, sceneX, sceneY, level);
        this.host.debugText = `Tile (${this.hoverWorldX}, ${this.hoverWorldY}) view L${level} flags: ${labels} (${raw})`;
    }

    private handleTerrainSmoothingToggle(): void {
        const next = this.host.terrainSmoothingEnabled;
        if (next === this.lastTerrainSmoothingEnabled) {
            return;
        }
        this.lastTerrainSmoothingEnabled = next;
        // Rebuild loaded map tile models so smooth/blend changes apply immediately without waiting for paint edits.
        for (const map of this.mapManager.mapSquares.values()) {
            map.underlayUpdated = true;
            let affected = this.affectedTilesMap.get(getMapSquareId(map.mapX, map.mapY));
            if (!affected) {
                affected = new Set<number>();
                this.affectedTilesMap.set(getMapSquareId(map.mapX, map.mapY), affected);
            }
            for (let tx = 0; tx < 64; tx++) {
                for (let ty = 0; ty < 64; ty++) {
                    affected.add((tx << 8) | ty);
                }
            }
        }
        this.updateAffectedTiles();
        this.host.scheduleMinimapRefreshAfterEdit();
    }

    renderTerrain(time: number): void {
        this.app.enable(PicoGL.DEPTH_TEST);
        this.app.enable(PicoGL.BLEND);

        const { startLevel, endLevel } = this.host.getVisiblePlaneRange();

        const terrainDrawRange = newDrawRange(
            startLevel * LEVEL_TILE_VERTICES,
            endLevel * LEVEL_TILE_VERTICES,
        );

        const viewPlaneMax = this.host.viewPlaneMax;
        const hideBelowViewPlane = this.host.hideBelowViewPlane ? 1 : 0;

        for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
            const map = this.mapManager.visibleMaps[i];

            map.terrainDrawCall
                .uniform("u_viewPlaneMax", viewPlaneMax)
                .uniform("u_hideBelowViewPlane", hideBelowViewPlane)
                .uniform("u_planeClipEnabled", 1);
            map.terrainDrawCall.drawRanges(terrainDrawRange);
            map.terrainDrawCall.draw();
        }

        // this.app.disable(PicoGL.DEPTH_TEST);

        if (this.drawGrid || this.drawChunkGrid) {
            for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
                const map = this.mapManager.visibleMaps[i];

                if (this.drawChunkGrid) {
                    this.chunkGridDrawCall.uniform("u_mapX", map.mapX);
                    this.chunkGridDrawCall.uniform("u_mapY", map.mapY);
                    this.chunkGridDrawCall.uniform("u_color", this.mapChunkGridColor);
                    this.chunkGridDrawCall.texture("u_heightMap", map.heightMapTexture);

                    this.chunkGridDrawCall.draw();
                }

                if (this.drawGrid) {
                    this.gridDrawCall.uniform("u_mapX", map.mapX);
                    this.gridDrawCall.uniform("u_mapY", map.mapY);
                    this.gridDrawCall.uniform("u_color", this.mapSquareGridColor);
                    this.gridDrawCall.texture("u_heightMap", map.heightMapTexture);

                    this.gridDrawCall.draw();
                }
            }
        }

        for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
            const map = this.mapManager.visibleMaps[i];
            for (const chunk of map.objectChunks) {
                for (const loc of chunk.locsAnimated) {
                    const frameId = loc.frame;
                    const frame = loc.anim.frames[frameId | 0];
                    const index = loc.getDrawRangeIndex(false, false, false);
                    if (index !== -1) {
                        chunk.drawCall.offsets[index] = frame[0];
                        (chunk.drawCall as any).numElements[index] = frame[1];
                        chunk.objectDrawRanges[index] = frame;
                    }
                    if (loc.anim.framesAlpha) {
                        const alphaFrame = loc.anim.framesAlpha[frameId | 0];
                        const alphaIndex = loc.getDrawRangeIndex(true, false, false);
                        if (alphaIndex !== -1) {
                            chunk.drawCallAlpha.offsets[alphaIndex] = alphaFrame[0];
                            (chunk.drawCallAlpha as any).numElements[alphaIndex] = alphaFrame[1];
                            chunk.objectDrawRangesAlpha[alphaIndex] = alphaFrame;
                        }
                    }
                }
            }
        }

        if (this.host.objectsVisible) {
            for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
                const map = this.mapManager.visibleMaps[i];
                for (const chunk of map.objectChunks) {
                    chunk.drawCall
                        .uniform("u_viewPlaneMax", viewPlaneMax)
                        .uniform("u_hideBelowViewPlane", hideBelowViewPlane)
                        .uniform("u_planeClipEnabled", 1);
                    if (chunk.objectDrawRanges.length > 0) {
                        this.draw(chunk.drawCall, chunk.objectDrawRanges);
                    }
                }
            }
            for (let i = this.mapManager.visibleMapCount - 1; i >= 0; i--) {
                const map = this.mapManager.visibleMaps[i];
                for (const chunk of map.objectChunks) {
                    chunk.drawCallAlpha
                        .uniform("u_viewPlaneMax", viewPlaneMax)
                        .uniform("u_hideBelowViewPlane", hideBelowViewPlane)
                        .uniform("u_planeClipEnabled", 1);
                    if (chunk.objectDrawRangesAlpha.length > 0) {
                        this.draw(chunk.drawCallAlpha, chunk.objectDrawRangesAlpha);
                    }
                }
            }
        }

        this.renderObjectSelectorWireframes();
        this.renderObjectDeleteWireframes();
        this.renderCopyPlacementFootprintHighlight();
        this.renderRegionStampHighlights();
        this.renderRegionStampObjectGhostPreview();

        if (this.isTileFlagsToolActive()) {
            this.renderVisibleTileFlagOverlays();
            if (this.hoverWorldX !== -1 && this.hoverWorldY !== -1) {
                this.renderTileFlagsBrushPreview();
            }
        } else if (
            !this.host.isObjectSelectorToolActive() &&
            !this.host.isObjectDeleteToolActive() &&
            !this.host.isRegionStampToolActive() &&
            this.hoverWorldX !== -1 &&
            this.hoverWorldY !== -1
        ) {
            this.app.disable(PicoGL.DEPTH_TEST);
            this.app.disable(PicoGL.CULL_FACE);
            const level = this.host.selectedLevel;
            const floodMode = getActivePaintModifiers(this.host).overlaySameIdFloodWithControlAlt;

            if (floodMode) {
                const overlayFloodSet = computeOverlayMatchFlood(
                    level,
                    this.hoverWorldX,
                    this.hoverWorldY,
                    (lv, wx, wy) => this.getStoredOverlayAtWorld(lv, wx, wy),
                );
                if (overlayFloodSet.size > 0) {
                    this.drawOverlayFloodHighlights(level, overlayFloodSet);
                }
            } else {
                const brushPaintedWorldKeys = new Set<string>();
                const hoveredTilesMap = new Map<number, number[]>();
                this.forEachBrushOffset((dx, dy) => {
                    const worldX = this.hoverWorldX + dx;
                    const worldY = this.hoverWorldY + dy;
                    const mapX = Math.floor(worldX / 64);
                    const mapY = Math.floor(worldY / 64);
                    const lx = worldX - mapX * 64;
                    const ly = worldY - mapY * 64;
                    const tileId = (lx << 8) | ly;

                    const mapId = getMapSquareId(mapX, mapY);
                    const hoveredTiles = hoveredTilesMap.get(mapId);
                    if (hoveredTiles) {
                        hoveredTiles.push(tileId);
                    } else {
                        hoveredTilesMap.set(mapId, [tileId]);
                    }

                    const map = this.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
                    if (map && this.tileWillReceiveFloorPaint(map, lx, ly, null)) {
                        brushPaintedWorldKeys.add(overlayWorldKey(worldX, worldY));
                    }
                });

                this.highlightTileDrawCall.uniform("u_level", level);

                for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
                    const map = this.mapManager.visibleMaps[i];
                    const mapId = getMapSquareId(map.mapX, map.mapY);
                    const hoveredTiles = hoveredTilesMap.get(mapId);
                    if (!hoveredTiles) {
                        continue;
                    }
                    this.highlightTileDrawCall.uniform("u_mapX", map.mapX);
                    this.highlightTileDrawCall.uniform("u_mapY", map.mapY);
                    this.highlightTileDrawCall.texture("u_heightMap", map.heightMapTexture);
                    for (const tileId of hoveredTiles) {
                        const tileX = tileId >> 8;
                        const tileY = tileId & 0xff;
                        if (!this.tileWillReceiveFloorPaint(map, tileX, tileY, null)) {
                            continue;
                        }
                        this.drawSingleTileHighlight(map, level, tileX, tileY, brushPaintedWorldKeys);
                    }
                }
            }
            this.app.enable(PicoGL.CULL_FACE);
        }
    }

    /** Full connected overlay preview: every world tile in `floodSet` on visible map squares. */
    private drawOverlayFloodHighlights(level: number, floodSet: Set<string>): void {
        this.highlightTileDrawCall.uniform("u_level", level);

        const tilesByMap = new Map<number, { lx: number; ly: number }[]>();
        for (const key of floodSet) {
            const comma = key.indexOf(",");
            if (comma === -1) {
                continue;
            }
            const wx = Number(key.slice(0, comma));
            const wy = Number(key.slice(comma + 1));
            if (!Number.isFinite(wx) || !Number.isFinite(wy)) {
                continue;
            }
            const mapX = Math.floor(wx / 64);
            const mapY = Math.floor(wy / 64);
            const mapId = getMapSquareId(mapX, mapY);
            const lx = ((wx % 64) + 64) % 64;
            const ly = ((wy % 64) + 64) % 64;
            let list = tilesByMap.get(mapId);
            if (!list) {
                list = [];
                tilesByMap.set(mapId, list);
            }
            list.push({ lx, ly });
        }

        for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
            const map = this.mapManager.visibleMaps[i];
            const mapId = getMapSquareId(map.mapX, map.mapY);
            const tileList = tilesByMap.get(mapId);
            if (!tileList?.length) {
                continue;
            }
            this.highlightTileDrawCall.uniform("u_mapX", map.mapX);
            this.highlightTileDrawCall.uniform("u_mapY", map.mapY);
            this.highlightTileDrawCall.texture("u_heightMap", map.heightMapTexture);
            for (const { lx, ly } of tileList) {
                this.drawSingleTileHighlight(map, level, lx, ly, floodSet);
            }
        }
    }

    /**
     * Mesh-shaped preview for **Overlay** while **Ctrl** is held (restrict-to-overlay tiles, or Ctrl+Alt flood).
     * Without Ctrl, brush preview stays full-tile only.
     */
    private useOverlayFootprintHighlight(): boolean {
        return getActivePaintModifiers(this.host).overlayRestrictToFootprintWithControl;
    }

    private applyGizmoAppearance(a: MapEditorGizmoAppearance): void {
        vec4.set(this.mapSquareGridColor, a.mapSquareGrid[0], a.mapSquareGrid[1], a.mapSquareGrid[2], a.mapSquareGrid[3]);
        vec4.set(this.mapChunkGridColor, a.chunkGrid[0], a.chunkGrid[1], a.chunkGrid[2], a.chunkGrid[3]);
        vec4.set(
            this.brushFill,
            a.brushOutline.fill[0],
            a.brushOutline.fill[1],
            a.brushOutline.fill[2],
            a.brushOutline.fill[3],
        );
        vec4.set(
            this.brushOutlineColor,
            a.brushOutline.outline[0],
            a.brushOutline.outline[1],
            a.brushOutline.outline[2],
            a.brushOutline.outline[3],
        );
        this.brushOutlineThickness = clampThickness(a.brushOutline.outlineThickness);
        vec4.set(
            this.objectSelectorHoverColor,
            a.objectSelector.hover[0],
            a.objectSelector.hover[1],
            a.objectSelector.hover[2],
            a.objectSelector.hover[3],
        );
        vec4.set(
            this.objectSelectorSelectedColor,
            a.objectSelector.selected[0],
            a.objectSelector.selected[1],
            a.objectSelector.selected[2],
            a.objectSelector.selected[3],
        );
    }

    private lastMouseLeftDown = false;
    private lastDeleteHoverKey?: string;
    private lastObjectDeleteModeActive = false;
    private regionStampDragAnchor?: { worldX: number; worldY: number };
    private regionStampWasDragging = false;
    private lastRegionStampMouseLeft = false;
    private regionStampPlacementPanStart?: { x: number; y: number };
    private regionStampPlacementWasPan = false;
    private readonly regionStampSelectColor: vec4 = vec4.fromValues(0.2, 0.85, 0.95, 0.35);
    private readonly regionStampSelectOutlineColor: vec4 = vec4.fromValues(0.2, 0.85, 0.95, 0.85);
    private readonly regionStampHoverTileColor: vec4 = vec4.fromValues(1, 1, 1, 1);
    private readonly regionStampHoverTileOutlineColor: vec4 = vec4.fromValues(0.95, 0.95, 1, 1);
    private readonly regionStampGhostWireColor: vec4 = vec4.fromValues(1, 0.62, 0.18, 0.42);

    private objectRefDeleteHoverKey(ref: import("./sceneLocPicker").EditorObjectRef): string {
        return `${ref.mapId}:${ref.level}:${ref.kind}:${ref.locTag}:${ref.anchorTileX}:${ref.anchorTileY}`;
    }

    private updateToolInteractionState(): void {
        if (this.host.isRegionStampToolActive()) {
            this.updateRegionStampToolState();
            return;
        }
        this.updateObjectToolState();
        this.lastRegionStampMouseLeft = false;
        this.regionStampDragAnchor = undefined;
        this.regionStampWasDragging = false;
        this.regionStampPlacementPanStart = undefined;
        this.regionStampPlacementWasPan = false;
    }

    private updateRegionStampToolState(): void {
        if (this.host.isRegionStampPlacementActive()) {
            this.host.debugText = "Region paste — left-drag pan · click place · R rotate · Esc cancel";
        } else if (this.host.getRegionStampDraftBounds()) {
            this.host.debugText = "Region select — release to confirm";
        } else if (this.host.getRegionStampSelectBounds()) {
            this.host.debugText = "Region selected — C copy · Delete clear";
        } else {
            this.host.debugText = "Region Stamp — drag to select tiles";
        }

        if (this.hoverWorldX === -1 || this.hoverWorldY === -1) {
            this.lastRegionStampMouseLeft = this.host.inputManager.isKeyDown("MouseLeft");
            return;
        }

        const inputManager = this.host.inputManager;
        const leftDown = inputManager.isKeyDown("MouseLeft");

        if (leftDown && this.host.isRegionStampPlacementActive()) {
            if (!this.lastRegionStampMouseLeft) {
                this.regionStampPlacementPanStart = { x: inputManager.mouseX, y: inputManager.mouseY };
                this.regionStampPlacementWasPan = false;
            } else if (this.regionStampPlacementPanStart) {
                const dx = inputManager.mouseX - this.regionStampPlacementPanStart.x;
                const dy = inputManager.mouseY - this.regionStampPlacementPanStart.y;
                if (dx * dx + dy * dy > 36) {
                    this.regionStampPlacementWasPan = true;
                }
            }
        } else if (leftDown && !this.host.isRegionStampPlacementActive()) {
            if (!this.lastRegionStampMouseLeft) {
                this.regionStampDragAnchor = { worldX: this.hoverWorldX, worldY: this.hoverWorldY };
                this.regionStampWasDragging = false;
            } else if (this.regionStampDragAnchor) {
                const moved =
                    this.regionStampDragAnchor.worldX !== this.hoverWorldX ||
                    this.regionStampDragAnchor.worldY !== this.hoverWorldY;
                if (moved) {
                    this.regionStampWasDragging = true;
                    this.host.updateRegionStampDrag(
                        this.regionStampDragAnchor.worldX,
                        this.regionStampDragAnchor.worldY,
                        this.hoverWorldX,
                        this.hoverWorldY,
                    );
                }
            }
        }

        if (this.lastRegionStampMouseLeft && !leftDown) {
            if (this.host.isRegionStampPlacementActive()) {
                if (!this.regionStampPlacementWasPan) {
                    this.host.pasteRegionStampAt(this.hoverWorldX, this.hoverWorldY);
                }
                this.regionStampPlacementPanStart = undefined;
                this.regionStampPlacementWasPan = false;
            } else if (!inputManager.isHolding() && this.regionStampDragAnchor) {
                this.host.finishRegionStampDrag(
                    this.regionStampDragAnchor.worldX,
                    this.regionStampDragAnchor.worldY,
                    this.hoverWorldX,
                    this.hoverWorldY,
                );
                this.regionStampDragAnchor = undefined;
                this.regionStampWasDragging = false;
            }
        }

        this.lastRegionStampMouseLeft = leftDown;

        const stamp = this.host.getRegionStampClipboard();
        if (
            this.host.isRegionStampPlacementActive() &&
            stamp &&
            this.hoverWorldX !== -1 &&
            this.hoverWorldY !== -1
        ) {
            syncRegionStampLivePreview(
                this.host,
                this,
                stamp,
                this.hoverWorldX,
                this.hoverWorldY,
                this.host.getRegionStampRotation(),
            );
        } else {
            clearRegionStampLivePreview(this);
        }
    }

    private renderWorldTileBoundsOutline(bounds: WorldTileBounds, fill: vec4, outline: vec4, level: number): void {
        if (!this.highlightTileDrawCall) {
            return;
        }

        this.beginTileHighlightPass(fill, outline, level);

        for (let worldX = bounds.minWorldX; worldX <= bounds.maxWorldX; worldX++) {
            for (let worldY = bounds.minWorldY; worldY <= bounds.maxWorldY; worldY++) {
                const edgeMask: [number, number, number, number] = [
                    worldX > bounds.minWorldX ? 0 : 1,
                    worldX < bounds.maxWorldX ? 0 : 1,
                    worldY > bounds.minWorldY ? 0 : 1,
                    worldY < bounds.maxWorldY ? 0 : 1,
                ];
                this.drawWorldTileHighlightAt(worldX, worldY, level, edgeMask);
            }
        }

        this.endTileHighlightPass();
    }

    private beginTileHighlightPass(
        fill: vec4,
        outline: vec4,
        level: number,
        fillAlpha: number = this.brushFill[3],
    ): void {
        if (!this.highlightTileDrawCall) {
            return;
        }

        this.app.disable(PicoGL.DEPTH_TEST);
        this.app.disable(PicoGL.CULL_FACE);
        this.app.enable(PicoGL.BLEND);
        this.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA);

        this.highlightTileDrawCall.uniform("u_fillColor", [fill[0], fill[1], fill[2], fillAlpha]);
        this.highlightTileDrawCall.uniform("u_outlineColor", [
            outline[0],
            outline[1],
            outline[2],
            this.brushOutlineColor[3],
        ]);
        this.highlightTileDrawCall.uniform("u_outlineThickness", this.brushOutlineThickness);
        this.highlightTileDrawCall.uniform("u_level", level);
        this.highlightTileDrawCall.uniform("u_footprintPass", 0);
        this.highlightTileDrawCall.uniform("u_boundarySegCount", 0);
        this.highlightTileDrawCall.uniform("u_highlightShapeMode", 0);
    }

    private drawWorldTileHighlightAt(
        worldX: number,
        worldY: number,
        level: number,
        edgeMask: [number, number, number, number] = [1, 1, 1, 1],
    ): void {
        if (!this.highlightTileDrawCall) {
            return;
        }

        const mapX = Math.floor(worldX / 64);
        const mapY = Math.floor(worldY / 64);
        const map = this.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
        if (!map) {
            return;
        }

        const lx = ((worldX % 64) + 64) % 64;
        const ly = ((worldY % 64) + 64) % 64;

        this.highlightTileDrawCall.uniform("u_level", level);
        this.highlightTileDrawCall.uniform("u_mapX", map.mapX);
        this.highlightTileDrawCall.uniform("u_mapY", map.mapY);
        this.highlightTileDrawCall.texture("u_heightMap", map.heightMapTexture);
        this.highlightTileDrawCall.uniform("u_edgeMask", edgeMask);
        this.highlightTileDrawCall.uniform("u_tileX", lx);
        this.highlightTileDrawCall.uniform("u_tileY", ly);
        this.highlightTileDrawCall.drawRanges(this.highlightFullTileRange);
        this.highlightTileDrawCall.draw();
    }

    private endTileHighlightPass(): void {
        this.app.enable(PicoGL.CULL_FACE);
        this.app.enable(PicoGL.DEPTH_TEST);
    }

    private renderWorldTileHighlight(
        worldX: number,
        worldY: number,
        fill: vec4,
        outline: vec4,
        level: number,
        edgeMask: [number, number, number, number] = [1, 1, 1, 1],
    ): void {
        this.beginTileHighlightPass(fill, outline, level);
        this.drawWorldTileHighlightAt(worldX, worldY, level, edgeMask);
        this.endTileHighlightPass();
    }

    private renderRegionStampHighlights(): void {
        if (!this.host.isRegionStampToolActive()) {
            return;
        }

        const level = this.host.selectedLevel;
        const draft = this.host.getRegionStampDraftBounds();
        const selection = this.host.getRegionStampSelectBounds();
        const activeBounds = draft ?? selection;
        if (activeBounds) {
            this.renderWorldTileBoundsOutline(
                activeBounds,
                this.regionStampSelectColor,
                this.regionStampSelectOutlineColor,
                level,
            );
        }

        if (this.hoverWorldX !== -1 && this.hoverWorldY !== -1) {
            this.renderWorldTileHighlight(
                this.hoverWorldX,
                this.hoverWorldY,
                this.regionStampHoverTileColor,
                this.regionStampHoverTileOutlineColor,
                level,
            );
        }
    }

    private renderRegionStampObjectGhostPreview(): void {
        if (
            !this.host.isRegionStampToolActive() ||
            !this.host.isRegionStampPlacementActive() ||
            !this.objectWireframeProgram ||
            !this.sceneUniformBuffer
        ) {
            return;
        }

        const stamp = this.host.getRegionStampClipboard();
        if (
            !stamp ||
            !stampHasObjectCategories(resolveRegionStampCopyOptions(stamp.copyOptions)) ||
            this.hoverWorldX === -1 ||
            this.hoverWorldY === -1
        ) {
            return;
        }

        const previewRefs = buildRegionStampPreviewObjectRefs(
            this.host,
            this,
            stamp,
            this.hoverWorldX,
            this.hoverWorldY,
            this.host.getRegionStampRotation(),
        );
        if (previewRefs.length === 0) {
            return;
        }

        this.app.disable(PicoGL.DEPTH_TEST);
        this.app.disable(PicoGL.CULL_FACE);
        this.app.enable(PicoGL.BLEND);
        this.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA);

        for (const ref of previewRefs) {
            if (!this.host.isPlaneVisible(ref.level)) {
                continue;
            }
            this.drawObjectWireframe(ref, this.regionStampGhostWireColor, undefined, true);
        }

        this.app.disable(PicoGL.BLEND);
        this.app.enable(PicoGL.CULL_FACE);
        this.app.enable(PicoGL.DEPTH_TEST);
    }

    private updateObjectToolState(): void {
        if (this.host.isObjectSelectorToolActive()) {
            this.updateObjectSelectorState();
            return;
        }
        if (this.host.isObjectDeleteToolActive()) {
            this.updateObjectDeleteState();
            return;
        }
        this.host.setHoveredObject(undefined);
        this.lastMouseLeftDown = false;
        this.lastDeleteHoverKey = undefined;
        this.lastObjectDeleteModeActive = false;
    }

    private pickHoveredObject(): import("./sceneLocPicker").EditorObjectRef | undefined {
        if (this.hoverWorldX === -1 || this.hoverWorldY === -1) {
            return undefined;
        }
        const mapX = Math.floor(this.hoverWorldX / 64);
        const mapY = Math.floor(this.hoverWorldY / 64);
        const mapId = getMapSquareId(mapX, mapY);
        const map = this.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
        const localX = ((this.hoverWorldX % 64) + 64) % 64;
        const localY = ((this.hoverWorldY % 64) + 64) % 64;
        const sceneX = map ? localX + map.borderSize : localX;
        const sceneY = map ? localY + map.borderSize : localY;
        const pickLevels =
            map && sceneX >= 0 && sceneY >= 0 && sceneX < map.scene.sizeX && sceneY < map.scene.sizeY
                ? getObjectPickLevelsAt(
                      map.scene,
                      sceneX,
                      sceneY,
                      this.host.viewPlaneMax,
                      this.host.hideBelowViewPlane,
                  )
                : [this.host.getTilePickLevel()];
        const visiblePickLevels = pickLevels.filter((pickLevel) => this.host.isPlaneVisible(pickLevel));
        return findObjectAtHover(
            (mx, my) => this.mapManager.getMap(mx, my) as EditorMapSquare | undefined,
            mapId,
            mapX,
            mapY,
            visiblePickLevels.length > 0 ? visiblePickLevels : pickLevels,
            this.hoverWorldX,
            this.hoverWorldY,
            this.host.viewPlaneMax,
        );
    }

    private updateObjectSelectorState(): void {
        if (this.host.isObjectCopyPlacementActive()) {
            this.host.debugText = "Copy placement — click to place · Esc to cancel";
        }

        this.host.setHoveredObject(this.pickHoveredObject());

        const selected = this.host.selectedObject;
        if (selected) {
            const selMap =
                (this.mapManager.getMap(selected.mapX, selected.mapY) as EditorMapSquare | undefined) ??
                (this.mapManager.getMapById(selected.mapId) as EditorMapSquare | undefined);
            if (selMap) {
                refreshSelectedObjectRef(this.host, selMap, selected);
            }
        }

        const inputManager = this.host.inputManager;
        const leftDown = inputManager.isKeyDown("MouseLeft");
        if (this.lastMouseLeftDown && !leftDown && !inputManager.isHolding()) {
            if (this.host.isObjectCopyPlacementActive()) {
                const template = this.host.getObjectCopyTemplate();
                if (template && this.hoverWorldX !== -1 && this.hoverWorldY !== -1) {
                    const placed = placeObjectCopyAtHover(
                        this.host,
                        this,
                        template,
                        this.hoverWorldX,
                        this.hoverWorldY,
                    );
                    if (placed) {
                        this.host.notifyWorkbenchStateChanged();
                    }
                }
            } else if (this.host.hoveredObject) {
                this.host.setSelectedObject({ ...this.host.hoveredObject });
            } else {
                this.host.clearSelectedObject();
            }
        }
        this.lastMouseLeftDown = leftDown;
    }

    private updateObjectDeleteState(): void {
        const deleteHeld = this.host.isObjectDeleteModeActive();
        if (deleteHeld !== this.lastObjectDeleteModeActive) {
            this.lastObjectDeleteModeActive = deleteHeld;
            this.host.notifyWorkbenchStateChanged();
        }

        this.host.debugText = deleteHeld
            ? "Delete — hover objects to remove"
            : "Object Delete — hold Delete to erase hovered objects";

        this.host.setHoveredObject(this.pickHoveredObject());

        if (deleteHeld) {
            const hovered = this.host.hoveredObject;
            if (!hovered) {
                this.lastDeleteHoverKey = undefined;
            } else {
                const hoverKey = this.objectRefDeleteHoverKey(hovered);
                if (hoverKey !== this.lastDeleteHoverKey) {
                    this.lastDeleteHoverKey = hoverKey;
                    this.host.deleteHoveredObject();
                }
            }
        } else {
            this.lastDeleteHoverKey = undefined;
        }
    }

    private renderObjectSelectorWireframes(): void {
        if (!this.host.isObjectSelectorToolActive()) {
            return;
        }
        if (!this.objectWireframeProgram || !this.sceneUniformBuffer) {
            return;
        }

        this.app.disable(PicoGL.DEPTH_TEST);
        this.app.disable(PicoGL.CULL_FACE);
        this.app.enable(PicoGL.BLEND);
        this.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA);

        const hovered = this.host.hoveredObject;
        const selected = this.host.selectedObject;
        if (
            hovered &&
            !editorObjectRefKey(hovered, selected) &&
            this.host.isPlaneVisible(hovered.level)
        ) {
            this.drawObjectWireframe(hovered, this.objectSelectorHoverColor);
        }
        if (selected && this.host.isPlaneVisible(selected.level)) {
            this.drawObjectWireframe(selected, this.objectSelectorSelectedColor);
        }

        const copyTemplate = this.host.getObjectCopyTemplate();
        if (
            this.host.isObjectCopyPlacementActive() &&
            copyTemplate &&
            this.host.isPlaneVisible(copyTemplate.level) &&
            this.hoverWorldX !== -1 &&
            this.hoverWorldY !== -1
        ) {
            const mapX = Math.floor(this.hoverWorldX / 64);
            const mapY = Math.floor(this.hoverWorldY / 64);
            const mapId = getMapSquareId(mapX, mapY);
            const map = this.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
            if (map) {
                const { sceneX, sceneY } = worldTileToSceneTile(this.hoverWorldX, this.hoverWorldY, map);
                const deltaX = sceneX - copyTemplate.anchorTileX;
                const deltaY = sceneY - copyTemplate.anchorTileY;
                const previewRef = {
                    ...copyTemplate,
                    mapId,
                    mapX,
                    mapY,
                    anchorTileX: sceneX,
                    anchorTileY: sceneY,
                    sceneX: copyTemplate.sceneX + deltaX * 128,
                    sceneZ: copyTemplate.sceneZ + deltaY * 128,
                };
                this.drawObjectWireframe(previewRef, this.objectSelectorHoverColor);
            }
        }

        this.app.disable(PicoGL.BLEND);
        this.app.enable(PicoGL.CULL_FACE);
        this.app.enable(PicoGL.DEPTH_TEST);
    }

    private renderObjectDeleteWireframes(): void {
        if (!this.host.isObjectDeleteToolActive()) {
            return;
        }
        if (!this.objectWireframeProgram || !this.sceneUniformBuffer) {
            return;
        }

        const hovered = this.host.hoveredObject;
        if (!hovered || !this.host.isPlaneVisible(hovered.level)) {
            return;
        }

        this.app.disable(PicoGL.DEPTH_TEST);
        this.app.disable(PicoGL.CULL_FACE);
        this.app.enable(PicoGL.BLEND);
        this.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA);
        this.drawObjectWireframe(hovered, this.objectSelectorDeleteColor);
        this.app.disable(PicoGL.BLEND);
        this.app.enable(PicoGL.CULL_FACE);
        this.app.enable(PicoGL.DEPTH_TEST);
    }

    private renderCopyPlacementFootprintHighlight(): void {
        if (
            !this.host.isObjectSelectorToolActive() ||
            !this.host.isObjectCopyPlacementActive() ||
            !this.highlightTileDrawCall ||
            this.hoverWorldX === -1 ||
            this.hoverWorldY === -1
        ) {
            return;
        }

        const template = this.host.getObjectCopyTemplate();
        if (!template || !this.host.isPlaneVisible(template.level)) {
            return;
        }

        const mapX = Math.floor(this.hoverWorldX / 64);
        const mapY = Math.floor(this.hoverWorldY / 64);
        const map = this.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
        if (!map) {
            return;
        }

        const sourceMap = getSourceMapForTemplate(this, template);
        if (!sourceMap) {
            return;
        }

        const { sceneX, sceneY } = worldTileToSceneTile(this.hoverWorldX, this.hoverWorldY, map);
        const bounds = getCopyPreviewFootprintSceneBounds(template, sourceMap, sceneX, sceneY);

        this.app.disable(PicoGL.DEPTH_TEST);
        this.app.disable(PicoGL.CULL_FACE);
        this.app.enable(PicoGL.BLEND);
        this.app.blendFunc(PicoGL.SRC_ALPHA, PicoGL.ONE_MINUS_SRC_ALPHA);

        const c = this.objectSelectorHoverColor;
        this.highlightTileDrawCall.uniform("u_fillColor", [
            c[0],
            c[1],
            c[2],
            this.brushFill[3],
        ]);
        this.highlightTileDrawCall.uniform("u_outlineColor", [
            c[0],
            c[1],
            c[2],
            this.brushOutlineColor[3],
        ]);
        this.highlightTileDrawCall.uniform("u_outlineThickness", this.brushOutlineThickness);
        this.highlightTileDrawCall.uniform("u_level", template.level);
        this.highlightTileDrawCall.uniform("u_footprintPass", 0);
        this.highlightTileDrawCall.uniform("u_boundarySegCount", 0);
        this.highlightTileDrawCall.uniform("u_highlightShapeMode", 0);
        this.highlightTileDrawCall.uniform("u_mapX", map.mapX);
        this.highlightTileDrawCall.uniform("u_mapY", map.mapY);
        this.highlightTileDrawCall.texture("u_heightMap", map.heightMapTexture);

        for (let sx = bounds.minX; sx <= bounds.maxX; sx++) {
            for (let sy = bounds.minY; sy <= bounds.maxY; sy++) {
                const lx = sx - map.borderSize;
                const ly = sy - map.borderSize;
                if (lx < 0 || lx >= 64 || ly < 0 || ly >= 64) {
                    continue;
                }

                const edgeMask: [number, number, number, number] = [
                    sx > bounds.minX ? 0 : 1,
                    sx < bounds.maxX ? 0 : 1,
                    sy > bounds.minY ? 0 : 1,
                    sy < bounds.maxY ? 0 : 1,
                ];

                this.highlightTileDrawCall.uniform("u_edgeMask", edgeMask);
                this.highlightTileDrawCall.uniform("u_tileX", lx);
                this.highlightTileDrawCall.uniform("u_tileY", ly);
                this.highlightTileDrawCall.drawRanges(this.highlightFullTileRange);
                this.highlightTileDrawCall.draw();
            }
        }

        this.app.enable(PicoGL.CULL_FACE);
        this.app.enable(PicoGL.DEPTH_TEST);
    }

    private ensureWireframeGpuBuffer(minFloats: number): void {
        if (
            this.wireframeGpuFormatVersion === WIREFRAME_GPU_FORMAT &&
            minFloats <= this.wireframeGpuBufferFloats &&
            this.objectWireframeDrawCall &&
            this.objectWireframeVertexBuffer &&
            this.objectWireframeVertexArray
        ) {
            return;
        }

        const capacity = Math.max(minFloats, 98304);
        this.wireframeGpuBufferFloats = capacity;
        this.wireframeGpuFormatVersion = WIREFRAME_GPU_FORMAT;
        this.objectWireframeVertexBuffer = this.app.createVertexBuffer(
            PicoGL.FLOAT,
            4,
            new Float32Array(capacity),
            PicoGL.DYNAMIC_DRAW,
        );
        this.objectWireframeVertexArray = this.app
            .createVertexArray()
            .vertexAttributeBuffer(0, this.objectWireframeVertexBuffer, {
                size: 3,
                stride: WIREFRAME_VERTEX_STRIDE,
                offset: 0,
            })
            .vertexAttributeBuffer(1, this.objectWireframeVertexBuffer, {
                size: 1,
                stride: WIREFRAME_VERTEX_STRIDE,
                offset: 12,
            });
        this.objectWireframeDrawCall = this.app
            .createDrawCall(this.objectWireframeProgram!, this.objectWireframeVertexArray)
            .uniformBlock("SceneUniforms", this.sceneUniformBuffer!)
            .primitive(PicoGL.TRIANGLES);
    }

    private resolveWireframeTriangles(
        ref: EditorObjectRef,
        map: EditorMapSquare,
        locType: LocType,
    ): Float32Array | undefined {
        const { lines, cacheKey } = this.resolveWireframeLines(ref, map, locType);
        if (lines.length === 0) {
            return undefined;
        }

        const triKey = `sharp:${WIREFRAME_LINE_HALF_WIDTH}:${cacheKey}`;
        let triangles = this.wireframeTriCache.get(triKey);
        if (!triangles) {
            triangles = expandWireframeLinesToTriangleMesh(lines);
            this.wireframeTriCache.set(triKey, triangles);
        }
        if (triangles.length === 0) {
            return undefined;
        }

        return triangles;
    }

    drawObjectWireframeMesh(
        triangles: Float32Array,
        color: vec4,
        modelOffset: [number, number, number],
        map: EditorMapSquare,
        preserveAlpha = false,
    ): void {
        if (triangles.length === 0) {
            return;
        }

        this.ensureWireframeGpuBuffer(triangles.length);
        if (
            !this.objectWireframeDrawCall ||
            !this.objectWireframeVertexBuffer ||
            !this.objectWireframeVertexArray
        ) {
            return;
        }

        const vertexCount = triangles.length / 4;
        this.objectWireframeVertexBuffer.data(triangles);

        this.objectWireframeDrawCall
            .drawRanges(newDrawRange(0, vertexCount))
            .uniform("u_modelOffset", modelOffset)
            .uniform("u_mapPos", [map.mapX, map.mapY])
            .uniform("u_color", [
                color[0],
                color[1],
                color[2],
                preserveAlpha ? color[3] : Math.min(1, Math.max(color[3], 0.95)),
            ])
            .draw();
    }

    private drawObjectWireframe(
        ref: EditorObjectRef,
        color: vec4,
        fineOffset?: [number, number, number],
        preserveAlpha = false,
    ): void {
        const locType = this.host.locTypeLoader.load(ref.locTypeId);
        const map =
            (this.mapManager.getMap(ref.mapX, ref.mapY) as EditorMapSquare | undefined) ??
            (this.mapManager.getMapById(ref.mapId) as EditorMapSquare | undefined);
        if (!map) {
            return;
        }

        const triangles = this.resolveWireframeTriangles(ref, map, locType);
        if (!triangles) {
            return;
        }

        const baseOffset = getObjectSceneModelOffset(ref, map);
        const modelOffset: [number, number, number] = fineOffset
            ? [baseOffset[0] + fineOffset[0], baseOffset[1] + fineOffset[1], baseOffset[2] + fineOffset[2]]
            : baseOffset;
        this.drawObjectWireframeMesh(triangles, color, modelOffset, map, preserveAlpha);
    }

    private tryLoadWireframeModel(
        locType: LocType,
        type: number,
        rotation: number,
    ): WireframeModel | undefined {
        const loaded = this.host.locModelLoader.getModel(locType, type as LocModelType, rotation);
        if (loaded instanceof Model || loaded instanceof ModelData) {
            return loaded;
        }
        return undefined;
    }

    private resolveWireframeModel(
        locType: LocType,
        ref: EditorObjectRef,
        map: EditorMapSquare,
    ): WireframeModel | undefined {
        const loc = findLocForRef(map, ref);
        if (loc?.entity instanceof Model) {
            return loc.entity;
        }

        const candidates: [number, number][] = [];
        if (loc) {
            const params = resolveLocEntityModelParams(loc.flags, loc.entity);
            candidates.push([params.type, params.rotation]);
        }
        candidates.push([ref.locModelType, ref.rotation]);

        if (loc) {
            const flagType = loc.flags & 0x3f;
            const baseRot = rotationFromLocFlags(loc.flags);
            candidates.push([flagType, baseRot]);
            if (flagType === LocModelType.NORMAL) {
                candidates.push([LocModelType.NORMAL, baseRot]);
            } else if (flagType === LocModelType.NORMAL_DIAGIONAL) {
                candidates.push([LocModelType.NORMAL, baseRot + 4]);
            }
            if (loc.entity instanceof LocEntity) {
                candidates.push([loc.entity.type, loc.entity.rotation]);
            }
        }

        const seen = new Set<string>();
        for (const [type, rotation] of candidates) {
            const key = `${type}:${rotation}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            const model = this.tryLoadWireframeModel(locType, type, rotation);
            if (model) {
                return model;
            }
        }
        return undefined;
    }

    private resolveWireframeLines(
        ref: EditorObjectRef,
        map: EditorMapSquare,
        locType: LocType,
    ): { lines: Float32Array; cacheKey: string } {
        const loc = findLocForRef(map, ref);
        const model = this.resolveWireframeModel(locType, ref, map);
        const modelParams = loc ? resolveLocEntityModelParams(loc.flags, loc.entity) : undefined;
        const cacheKey = model
            ? `v6:balance:${ref.locTypeId}:${ref.locTag}:${modelParams?.type ?? ref.locModelType}:${modelParams?.rotation ?? ref.rotation}:${loc?.flags ?? 0}`
            : loc
              ? `v3:footprint:${ref.mapId}:${ref.level}:${loc.startX}:${loc.startY}:${loc.endX}:${loc.endY}:${loc.flags}`
              : `v3:footprint:${ref.mapId}:${ref.level}:${ref.anchorTileX}:${ref.anchorTileY}`;

        let lines = this.wireframeLineCache.get(cacheKey);
        if (lines) {
            return { lines, cacheKey };
        }

        if (model) {
            lines = buildModelWireframeLines(model);
            if (lines.length > 0) {
                this.wireframeLineCache.set(cacheKey, lines);
                return { lines, cacheKey };
            }
        }

        if (loc) {
            const width = (loc.endX - loc.startX + 1) * 128;
            const depth = (loc.endY - loc.startY + 1) * 128;
            const box = buildFootprintWireframeLines(width, depth);
            const offsetX = loc.startX * 128 - loc.x;
            const offsetZ = loc.startY * 128 - loc.y;
            lines = offsetWireframeLines(box, offsetX, 0, offsetZ);
        } else {
            lines = buildFootprintWireframeLines(128, 128);
        }
        this.wireframeLineCache.set(cacheKey, lines);
        return { lines, cacheKey };
    }

    private applyBrushHighlightUniforms(): void {
        this.highlightTileDrawCall.uniform("u_fillColor", [
            this.brushFill[0],
            this.brushFill[1],
            this.brushFill[2],
            this.brushFill[3],
        ]);
        this.highlightTileDrawCall.uniform("u_outlineColor", [
            this.brushOutlineColor[0],
            this.brushOutlineColor[1],
            this.brushOutlineColor[2],
            this.brushOutlineColor[3],
        ]);
        this.highlightTileDrawCall.uniform("u_outlineThickness", this.brushOutlineThickness);
    }

    getGizmoAppearance(): MapEditorGizmoAppearance {
        return {
            mapSquareGrid: [
                this.mapSquareGridColor[0],
                this.mapSquareGridColor[1],
                this.mapSquareGridColor[2],
                this.mapSquareGridColor[3],
            ],
            chunkGrid: [
                this.mapChunkGridColor[0],
                this.mapChunkGridColor[1],
                this.mapChunkGridColor[2],
                this.mapChunkGridColor[3],
            ],
            brushOutline: {
                fill: [
                    this.brushFill[0],
                    this.brushFill[1],
                    this.brushFill[2],
                    this.brushFill[3],
                ],
                outline: [
                    this.brushOutlineColor[0],
                    this.brushOutlineColor[1],
                    this.brushOutlineColor[2],
                    this.brushOutlineColor[3],
                ],
                outlineThickness: this.brushOutlineThickness,
            },
            objectSelector: {
                hover: [
                    this.objectSelectorHoverColor[0],
                    this.objectSelectorHoverColor[1],
                    this.objectSelectorHoverColor[2],
                    this.objectSelectorHoverColor[3],
                ],
                selected: [
                    this.objectSelectorSelectedColor[0],
                    this.objectSelectorSelectedColor[1],
                    this.objectSelectorSelectedColor[2],
                    this.objectSelectorSelectedColor[3],
                ],
            },
        };
    }

    /** Returns the full appearance after merge (for persistence). */
    setGizmoAppearance(partial: Partial<MapEditorGizmoAppearance>): MapEditorGizmoAppearance {
        const cur = this.getGizmoAppearance();
        const next: MapEditorGizmoAppearance = {
            ...cur,
            ...partial,
            brushOutline: {
                ...cur.brushOutline,
                ...(partial.brushOutline ?? {}),
            },
            objectSelector: {
                ...cur.objectSelector,
                ...(partial.objectSelector ?? {}),
            },
        };
        this.applyGizmoAppearance(next);
        return next;
    }

    private edgeMaskForWorldTile(wx: number, wy: number, paintedWorldKeys: Set<string>): [number, number, number, number] {
        return [
            paintedWorldKeys.has(overlayWorldKey(wx - 1, wy)) ? 0 : 1,
            paintedWorldKeys.has(overlayWorldKey(wx + 1, wy)) ? 0 : 1,
            paintedWorldKeys.has(overlayWorldKey(wx, wy - 1)) ? 0 : 1,
            paintedWorldKeys.has(overlayWorldKey(wx, wy + 1)) ? 0 : 1,
        ];
    }

    private drawSingleTileHighlight(
        map: EditorMapSquare,
        level: number,
        lx: number,
        ly: number,
        paintedWorldKeys: Set<string>,
    ): void {
        const useFootprint = this.useOverlayFootprintHighlight();

        let footprintTris: ReadonlyArray<readonly [number, number, number, number, number, number]> | null = null;
        if (useFootprint) {
            const scene = map.scene;
            const sx = lx + map.borderSize;
            const sy = ly + map.borderSize;
            if (sx >= 0 && sx < scene.sizeX && sy >= 0 && sy < scene.sizeY) {
                const tile = scene.tiles[level][sx][sy];
                const model = tile?.tileModel;
                if (model) {
                    const tris = getOverlayHighlightUvTriangles(model, sx, sy);
                    if (tris.length > 0) {
                        footprintTris = tris;
                    }
                }
            }
        }

        if (footprintTris) {
            const worldOx = map.mapX * 64 + lx;
            const worldOy = map.mapY * 64 + ly;
            const boundarySegs = filterBoundarySegmentsToSelectionOutline(
                overlayMeshBoundarySegments(footprintTris),
                worldOx,
                worldOy,
                paintedWorldKeys,
                overlayWorldKey,
            );
            const segCount = Math.min(boundarySegs.length, OVERLAY_MESH_BOUNDARY_SEG_MAX);
            const bd = boundarySegUniformScratch;
            for (let i = 0; i < OVERLAY_MESH_BOUNDARY_SEG_MAX; i++) {
                const o = i * 4;
                if (i < segCount) {
                    const s = boundarySegs[i]!;
                    bd[o] = s[0];
                    bd[o + 1] = s[1];
                    bd[o + 2] = s[2];
                    bd[o + 3] = s[3];
                } else {
                    bd[o] = 0;
                    bd[o + 1] = 0;
                    bd[o + 2] = 0;
                    bd[o + 3] = 0;
                }
            }
            this.highlightTileDrawCall.uniform("u_boundarySeg[0]", bd);
            this.highlightTileDrawCall.uniform("u_boundarySegCount", segCount);

            this.applyBrushHighlightUniforms();
            this.highlightTileDrawCall.uniform("u_highlightShapeMode", 1);
            this.highlightTileDrawCall.uniform("u_tileX", lx);
            this.highlightTileDrawCall.uniform("u_tileY", ly);
            this.highlightTileDrawCall.drawRanges(this.highlightTriangleRange);

            this.highlightTileDrawCall.uniform("u_footprintPass", 0);
            for (const t of footprintTris) {
                this.highlightTileDrawCall.uniform("u_cornerA", [t[0], t[1]]);
                this.highlightTileDrawCall.uniform("u_cornerB", [t[2], t[3]]);
                this.highlightTileDrawCall.uniform("u_cornerC", [t[4], t[5]]);
                this.highlightTileDrawCall.draw();
            }

            if (segCount > 0) {
                this.highlightTileDrawCall.uniform("u_footprintPass", 1);
                for (const t of footprintTris) {
                    this.highlightTileDrawCall.uniform("u_cornerA", [t[0], t[1]]);
                    this.highlightTileDrawCall.uniform("u_cornerB", [t[2], t[3]]);
                    this.highlightTileDrawCall.uniform("u_cornerC", [t[4], t[5]]);
                    this.highlightTileDrawCall.draw();
                }
            }

            this.highlightTileDrawCall.uniform("u_footprintPass", 0);
            this.highlightTileDrawCall.uniform("u_boundarySegCount", 0);
            this.applyBrushHighlightUniforms();
            return;
        }

        const wx = map.mapX * 64 + lx;
        const wy = map.mapY * 64 + ly;
        const edgeMask = this.edgeMaskForWorldTile(wx, wy, paintedWorldKeys);

        this.applyBrushHighlightUniforms();
        this.highlightTileDrawCall.uniform("u_edgeMask", edgeMask);
        this.highlightTileDrawCall.uniform("u_highlightShapeMode", 0);
        this.highlightTileDrawCall.uniform("u_tileX", lx);
        this.highlightTileDrawCall.uniform("u_tileY", ly);
        this.highlightTileDrawCall.drawRanges(this.highlightFullTileRange);
        this.highlightTileDrawCall.draw();
    }

    renderTilePicking(): void {
        if (!this.pickFramebuffer) {
            return;
        }
        this.app.enable(PicoGL.DEPTH_TEST);

        this.app.drawFramebuffer(this.pickFramebuffer);
        this.app.readFramebuffer(this.pickFramebuffer);

        this.app.clearMask(PicoGL.COLOR_BUFFER_BIT | PicoGL.DEPTH_BUFFER_BIT);
        this.app.clearColor(1.0, 0.0, 0.0, 1.0);
        // this.gl.clearBufferfv(PicoGL.COLOR, 0, [1.0, 0.0, 0.0, 1.0]);
        this.app.clear();

        // this.app.disable(PicoGL.CULL_FACE);
        this.app.disable(PicoGL.BLEND);

        this.tilePickingDrawCall.uniform("u_level", this.host.getTilePickLevel());

        for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
            const map = this.mapManager.visibleMaps[i];

            this.tilePickingDrawCall.uniform("u_mapX", map.mapX);
            this.tilePickingDrawCall.uniform("u_mapY", map.mapY);
            this.tilePickingDrawCall.texture("u_heightMap", map.heightMapTexture);
            this.tilePickingDrawCall.draw();
        }

        const inputManager = this.host.inputManager;
        if (inputManager.mouseX === -1 || inputManager.mouseY === -1) {
            this.hoverWorldX = -1;
            this.hoverWorldY = -1;
        } else {
            this.gl.readPixels(
                inputManager.mouseX,
                this.app.height - inputManager.mouseY,
                1,
                1,
                PicoGL.RGBA,
                PicoGL.UNSIGNED_BYTE,
                this.tilePickingBuffer,
            );

            const tileX = this.tilePickingBuffer[0];
            const tileY = this.tilePickingBuffer[1];

            const mapX = this.tilePickingBuffer[2];
            const mapY = this.tilePickingBuffer[3];

            const worldX = mapX * 64 + tileX;
            const worldY = mapY * 64 + tileY;

            const isValid = tileX !== 0xff;

            if (isValid) {
                this.hoverWorldX = worldX;
                this.hoverWorldY = worldY;
            } else {
                this.hoverWorldX = -1;
                this.hoverWorldY = -1;
            }
        }

        // Pick pass must not leave the pick FBO bound — main terrain draws to the default (canvas) framebuffer.
        this.app.defaultDrawFramebuffer();
        this.app.defaultReadFramebuffer();
    }

    getHeightWorld(level: number, worldX: number, worldY: number): number {
        const mapX = Math.floor(worldX / 64);
        const mapY = Math.floor(worldY / 64);
        const map = this.mapManager.getMap(mapX, mapY);
        if (!map) {
            return 0;
        }
        const scene = map.scene;
        const tileX = (worldX % 64) + map.borderSize;
        const tileY = (worldY % 64) + map.borderSize;
        return scene.tileHeights[level][tileX][tileY];
    }

    private forEachBrushOffset(fn: (dx: number, dy: number) => void): void {
        const offsets = this.getBrushOffsets();
        for (const [dx, dy] of offsets) {
            fn(dx, dy);
        }
    }

    private getBrushOffsets(): ReadonlyArray<readonly [number, number]> {
        const r = this.host.brushSize;
        const shape = this.host.brushType;
        const key = `${shape}:${r}`;
        const cached = this.brushOffsetsCache.get(key);
        if (cached) {
            return cached;
        }
        const offsets: Array<readonly [number, number]> = [];
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                if (!isInBuiltinBrushShape(dx, dy, r, shape)) {
                    continue;
                }
                offsets.push([dx, dy]);
            }
        }
        this.brushOffsetsCache.set(key, offsets);
        return offsets;
    }

    /**
     * Hold **Ctrl** while painting with **Overlay**: only tiles that already have overlay data (stored id and/or
     * shape) are modified — shaped overlays must still paint when `tileShapes` is set.
     */
    private paintRestrictToTilesWithOverlay(): boolean {
        return getActivePaintModifiers(this.host).overlayRestrictToFootprintWithControl;
    }

    /** Overlay floor uses non-zero `tileOverlays` and/or `tileShapes` (see `SceneBuilder.addTileModel`). */
    private sceneTileHasOverlayFootprint(scene: Scene, level: number, sceneX: number, sceneY: number): boolean {
        if (sceneX < 0 || sceneX >= scene.sizeX || sceneY < 0 || sceneY >= scene.sizeY) {
            return false;
        }
        return (
            scene.tileOverlays[level][sceneX][sceneY] > 0 || scene.tileShapes[level][sceneX][sceneY] > 0
        );
    }

    private getStoredOverlayAtWorld(level: number, worldX: number, worldY: number): number | undefined {
        const mapX = Math.floor(worldX / 64);
        const mapY = Math.floor(worldY / 64);
        const map = this.mapManager.getMapById(getMapSquareId(mapX, mapY));
        if (!map) {
            return undefined;
        }
        const lx = ((worldX % 64) + 64) % 64;
        const ly = ((worldY % 64) + 64) % 64;
        const sx = lx + map.borderSize;
        const sy = ly + map.borderSize;
        const scene = map.scene;
        if (sx < 0 || sx >= scene.sizeX || sy < 0 || sy >= scene.sizeY) {
            return undefined;
        }
        return scene.tileOverlays[level][sx][sy];
    }

    private worldTileHasOverlayFootprint(level: number, worldX: number, worldY: number): boolean {
        const mapX = Math.floor(worldX / 64);
        const mapY = Math.floor(worldY / 64);
        const map = this.mapManager.getMapById(getMapSquareId(mapX, mapY));
        if (!map) {
            return false;
        }
        const lx = ((worldX % 64) + 64) % 64;
        const ly = ((worldY % 64) + 64) % 64;
        const sx = lx + map.borderSize;
        const sy = ly + map.borderSize;
        return this.sceneTileHasOverlayFootprint(map.scene, level, sx, sy);
    }

    /** Brush preview: whether this tile would actually be painted (local tile coords 0–63 within the map square). */
    private tileWillReceiveFloorPaint(
        map: EditorMapSquare,
        localTileX: number,
        localTileY: number,
        overlayFloodSet: Set<string> | null,
    ): boolean {
        const tool = this.host.editorTool;
        if (tool !== "overlay") {
            return true;
        }
        if (overlayFloodSet) {
            const wx = map.mapX * 64 + localTileX;
            const wy = map.mapY * 64 + localTileY;
            if (!overlayFloodSet.has(overlayWorldKey(wx, wy))) {
                return false;
            }
            if (!this.paintRestrictToTilesWithOverlay()) {
                return true;
            }
            const level = this.host.selectedLevel;
            return this.worldTileHasOverlayFootprint(level, wx, wy);
        }
        if (!this.paintRestrictToTilesWithOverlay()) {
            return true;
        }
        const scene = map.scene;
        const sx = localTileX + map.borderSize;
        const sy = localTileY + map.borderSize;
        if (sx < 0 || sx >= scene.sizeX || sy < 0 || sy >= scene.sizeY) {
            return false;
        }
        const level = this.host.selectedLevel;
        return this.sceneTileHasOverlayFootprint(scene, level, sx, sy);
    }

    handleTileManipulation(time: number): void {
        if (this.host.isEditorInputSuspended()) {
            return;
        }
        if (!this.host.isEditorToolPluginEnabled(this.host.editorTool)) {
            return;
        }
        if (
            this.host.editorTool === "object-selector" ||
            this.host.editorTool === "object-delete" ||
            this.host.editorTool === "region-stamp"
        ) {
            return;
        }
        const inputManager = this.host.inputManager;
        this.syncTileFlagsPaintStroke();

        const isPainting = this.isTileFlagsToolActive()
            ? inputManager.isKeyDown("MouseLeft")
            : inputManager.isHolding();

        this.syncPaintHistoryStroke(isPainting);

        if (this.hoverWorldX === -1 || this.hoverWorldY === -1 || !isPainting) {
            return;
        }

        const borderSize = 6;

        const hoveredTilesMap = new Map<number, Set<number>>();

        const addTile = (mapId: number, tileId: number) => {
            const hoveredTiles = hoveredTilesMap.get(mapId);
            if (hoveredTiles) {
                hoveredTiles.add(tileId);
            } else {
                hoveredTilesMap.set(mapId, new Set([tileId]));
            }
        };

        this.forEachBrushOffset((x, y) => {
            const worldX = this.hoverWorldX + x;
            const worldY = this.hoverWorldY + y;
            const mapX = Math.floor(worldX / 64);
            const mapY = Math.floor(worldY / 64);
            const lx = worldX - mapX * 64;
            const ly = worldY - mapY * 64;
            const tileX = lx + borderSize;
            const tileY = ly + borderSize;
            const tileId = (tileX << 8) | tileY;

            const mapId = getMapSquareId(mapX, mapY);
            addTile(mapId, tileId);

            const updateWest = tileX - borderSize <= borderSize;
            if (updateWest) {
                const mapId = getMapSquareId(mapX - 1, mapY);
                const westTileX = tileX + 64;
                const westTileY = tileY;
                const westTileId = (westTileX << 8) | westTileY;
                addTile(mapId, westTileId);
            }
            const updateSouth = tileY - borderSize <= borderSize;
            if (updateSouth) {
                const mapId = getMapSquareId(mapX, mapY - 1);
                const southTileX = tileX;
                const southTileY = tileY + 64;
                const southTileId = (southTileX << 8) | southTileY;
                addTile(mapId, southTileId);
            }
            const updateEast = tileX >= 64;
            if (updateEast) {
                const mapId = getMapSquareId(mapX + 1, mapY);
                const eastTileX = tileX - 64;
                const eastTileY = tileY;
                const eastTileId = (eastTileX << 8) | eastTileY;
                addTile(mapId, eastTileId);
            }
            const updateNorth = tileY >= 64;
            if (updateNorth) {
                const mapId = getMapSquareId(mapX, mapY + 1);
                const northTileX = tileX;
                const northTileY = tileY - 64;
                const northTileId = (northTileX << 8) | northTileY;
                addTile(mapId, northTileId);
            }
            if (updateSouth && updateWest) {
                const mapId = getMapSquareId(mapX - 1, mapY - 1);
                const southWestTileX = tileX + 64;
                const southWestTileY = tileY + 64;
                const southWestTileId = (southWestTileX << 8) | southWestTileY;
                addTile(mapId, southWestTileId);
            }
            if (updateNorth && updateEast) {
                const mapId = getMapSquareId(mapX + 1, mapY + 1);
                const northEastTileX = tileX - 64;
                const northEastTileY = tileY - 64;
                const northEastTileId = (northEastTileX << 8) | northEastTileY;
                addTile(mapId, northEastTileId);
            }
            if (updateSouth && updateEast) {
                const mapId = getMapSquareId(mapX + 1, mapY - 1);
                const southEastTileX = tileX - 64;
                const southEastTileY = tileY + 64;
                const southEastTileId = (southEastTileX << 8) | southEastTileY;
                addTile(mapId, southEastTileId);
            }
            if (updateNorth && updateWest) {
                const mapId = getMapSquareId(mapX - 1, mapY + 1);
                const northWestTileX = tileX + 64;
                const northWestTileY = tileY - 64;
                const northWestTileId = (northWestTileX << 8) | northWestTileY;
                addTile(mapId, northWestTileId);
            }
        });

        switch (this.host.editorTool) {
            case "underlay":
                this.applyUnderlayChange(hoveredTilesMap);
                break;
            case "overlay":
                this.applyOverlayChange(hoveredTilesMap);
                break;
            case "height":
            case "smooth":
                applyHeightToolRuntime(this, hoveredTilesMap);
                break;
            case "tile-flags":
                applyTileRenderFlagsRuntime(
                    this,
                    hoveredTilesMap,
                    this.tileFlagsPaintedKeys,
                    inputManager.isControlDown(),
                );
                break;
        }

        this.updateAffectedTiles();

        if (hoveredTilesMap.size > 0) {
            this.host.scheduleMinimapRefreshAfterEdit();
        }
    }

    addAffectedTile(worldX: number, worldY: number) {
        const mapX = Math.floor(worldX / 64);
        const mapY = Math.floor(worldY / 64);
        const tileX = worldX % 64;
        const tileY = worldY % 64;
        const mapId = getMapSquareId(mapX, mapY);
        const tileId = (tileX << 8) | tileY;

        const affectedTiles = this.affectedTilesMap.get(mapId);
        if (affectedTiles) {
            affectedTiles.add(tileId);
        } else {
            this.affectedTilesMap.set(mapId, new Set([tileId]));
        }
    }

    addHeightChangedTile(worldX: number, worldY: number): void {
        const mapX = Math.floor(worldX / 64);
        const mapY = Math.floor(worldY / 64);
        const tileX = worldX % 64;
        const tileY = worldY % 64;
        const mapId = getMapSquareId(mapX, mapY);
        const tileId = (tileX << 8) | tileY;

        const changedTiles = this.heightChangedTilesMap.get(mapId);
        if (changedTiles) {
            changedTiles.add(tileId);
        } else {
            this.heightChangedTilesMap.set(mapId, new Set([tileId]));
        }
    }

    applyUnderlayChange(hoveredTilesMap: Map<number, Set<number>>): void {
        const level = this.host.selectedLevel;

        for (const [mapId, tileIds] of hoveredTilesMap) {
            const map = this.mapManager.getMapById(mapId);
            if (!map) {
                continue;
            }

            const scene = map.scene;

            for (const tileId of tileIds) {
                const sceneX = tileId >> 8;
                const sceneY = tileId & 0xff;
                const tileX = sceneX - map.borderSize;
                const tileY = sceneY - map.borderSize;

                if (sceneX >= scene.sizeX || sceneY >= scene.sizeY) {
                    continue;
                }

                const worldX = map.mapX * 64 + tileX;
                const worldY = map.mapY * 64 + tileY;
                const paintId = this.host.getUnderlayPaintTypeId(worldX, worldY);
                recordHistoryTileMutation(this.host, map, level, sceneX, sceneY, () => {
                    scene.tileUnderlays[level][sceneX][sceneY] = paintId + 1;
                });

                map.underlayUpdated = true;

                if (tileX < 0 || tileX >= 64 || tileY < 0 || tileY >= 64) {
                    continue;
                }

                for (let x = worldX - 4; x <= worldX + 4; x++) {
                    for (let y = worldY - 4; y <= worldY + 4; y++) {
                        this.addAffectedTile(x, y);
                    }
                }
            }
        }
    }

    applyOverlayChange(hoveredTilesMap: Map<number, Set<number>>): void {
        const level = this.host.selectedLevel;

        if (getActivePaintModifiers(this.host).overlaySameIdFloodWithControlAlt) {
            const floodSet = computeOverlayMatchFlood(level, this.hoverWorldX, this.hoverWorldY, (lv, wx, wy) =>
                this.getStoredOverlayAtWorld(lv, wx, wy),
            );
            for (const worldKey of floodSet) {
                if (this.paintRestrictToTilesWithOverlay()) {
                    const comma = worldKey.indexOf(",");
                    if (comma === -1) {
                        continue;
                    }
                    const wx = Number(worldKey.slice(0, comma));
                    const wy = Number(worldKey.slice(comma + 1));
                    if (!this.worldTileHasOverlayFootprint(level, wx, wy)) {
                        continue;
                    }
                }
                this.applyOverlayAtWorldKey(worldKey, level);
            }
            return;
        }

        for (const [mapId, tileIds] of hoveredTilesMap) {
            const map = this.mapManager.getMapById(mapId);
            if (!map) {
                continue;
            }

            const scene = map.scene;

            for (const tileId of tileIds) {
                const sceneX = tileId >> 8;
                const sceneY = tileId & 0xff;
                const tileX = sceneX - map.borderSize;
                const tileY = sceneY - map.borderSize;
                const worldX = map.mapX * 64 + tileX;
                const worldY = map.mapY * 64 + tileY;
                const overlayValue = this.host.getOverlayPaintTypeId(worldX, worldY) + 1;

                if (sceneX >= scene.sizeX || sceneY >= scene.sizeY) {
                    continue;
                }

                if (
                    this.paintRestrictToTilesWithOverlay() &&
                    !this.sceneTileHasOverlayFootprint(scene, level, sceneX, sceneY)
                ) {
                    continue;
                }

                recordHistoryTileMutation(this.host, map, level, sceneX, sceneY, () => {
                    scene.tileOverlays[level][sceneX][sceneY] = overlayValue;
                    if (overlayValue === 0) {
                        scene.tileShapes[level][sceneX][sceneY] = 0;
                        scene.tileRotations[level][sceneX][sceneY] = 0;
                    }
                });

                map.overlayUpdated = true;

                if (tileX < 0 || tileX >= 64 || tileY < 0 || tileY >= 64) {
                    continue;
                }

                for (let x = worldX - 4; x <= worldX + 4; x++) {
                    for (let y = worldY - 4; y <= worldY + 4; y++) {
                        this.addAffectedTile(x, y);
                    }
                }
            }
        }
    }

    private applyOverlayAtWorldKey(worldKey: string, level: number): void {
        const comma = worldKey.indexOf(",");
        if (comma === -1) {
            return;
        }
        const wx = Number(worldKey.slice(0, comma));
        const wy = Number(worldKey.slice(comma + 1));
        const overlayValue = this.host.getOverlayPaintTypeId(wx, wy) + 1;
        const mapX = Math.floor(wx / 64);
        const mapY = Math.floor(wy / 64);
        const map = this.mapManager.getMapById(getMapSquareId(mapX, mapY)) as EditorMapSquare | undefined;
        if (!map) {
            return;
        }
        const lx = wx - mapX * 64;
        const ly = wy - mapY * 64;
        const sceneX = lx + map.borderSize;
        const sceneY = ly + map.borderSize;
        const scene = map.scene;
        if (sceneX < 0 || sceneX >= scene.sizeX || sceneY < 0 || sceneY >= scene.sizeY) {
            return;
        }

        recordHistoryTileMutation(this.host, map, level, sceneX, sceneY, () => {
            scene.tileOverlays[level][sceneX][sceneY] = overlayValue;
            if (overlayValue === 0) {
                scene.tileShapes[level][sceneX][sceneY] = 0;
                scene.tileRotations[level][sceneX][sceneY] = 0;
            }
        });

        map.overlayUpdated = true;

        const tileX = sceneX - map.borderSize;
        const tileY = sceneY - map.borderSize;
        if (tileX < 0 || tileX >= 64 || tileY < 0 || tileY >= 64) {
            return;
        }
        const worldX = map.mapX * 64 + tileX;
        const worldY = map.mapY * 64 + tileY;
        for (let x = worldX - 4; x <= worldX + 4; x++) {
            for (let y = worldY - 4; y <= worldY + 4; y++) {
                this.addAffectedTile(x, y);
            }
        }
    }

    updateAffectedTiles(): void {
        if (this.affectedTilesMap.size === 0) {
            return;
        }
        const sceneBuilder = this.host.sceneBuilder;

        const selectedLevel = this.host.selectedLevel;

        const vertexBuf = new TerrainVertexBuffer(TOTAL_TILE_VERTICES);
        for (const [mapId, tileIds] of this.affectedTilesMap) {
            const map = this.mapManager.getMapById(mapId);
            if (!map) {
                continue;
            }

            const scene = map.scene;
            const rebuildStartLevel = map.heightRebuildMinLevel ?? selectedLevel;

            let endLevel = rebuildStartLevel + 1;

            if (map.heightUpdated) {
                map.heightMapTextureData = loadHeightMapTextureData(scene);
                map.updateHeightMapTexture(this.app);

                for (let level = rebuildStartLevel; level < scene.levels; level++) {
                    scene.calculateTileLights(level, true);
                }
                endLevel = scene.levels;

                const heightChangedTiles = this.heightChangedTilesMap.get(mapId);
                if (heightChangedTiles && heightChangedTiles.size > 0) {
                    const chunkIds = syncSceneLocHeightsForHeightEdit(
                        map,
                        rebuildStartLevel,
                        heightChangedTiles,
                    );
                    markObjectChunksForHeightEdit(map, chunkIds);
                    syncMapObjectPickIndex(map, mapId);

                    const selected = this.host.selectedObject;
                    if (selected?.mapId === mapId) {
                        const loc = findLocForRef(map, selected);
                        if (loc) {
                            this.host.setSelectedObject(syncObjectRefFromLoc(selected, loc));
                        }
                    }
                    const hovered = this.host.hoveredObject;
                    if (hovered?.mapId === mapId) {
                        const loc = findLocForRef(map, hovered);
                        if (loc) {
                            this.host.setHoveredObject(syncObjectRefFromLoc(hovered, loc));
                        }
                    }
                }

                map.heightUpdated = false;
                map.heightRebuildMinLevel = undefined;
            }

            if (map.underlayUpdated) {
                sceneBuilder.blendUnderlays(scene, selectedLevel, this.host.terrainSmoothingEnabled, true);

                map.underlayUpdated = false;
            }

            if (map.overlayUpdated) {
                map.overlayUpdated = false;
            }

            if (map.tileRenderFlagsUpdated) {
                map.scene.setTileMinLevels();
                map.updateTileRenderFlagsTexture(this.app);
                map.tileRenderFlagsUpdated = false;
            }

            const heights = scene.tileHeights;
            const underlayIds = scene.tileUnderlays;
            const overlayIds = scene.tileOverlays;
            const tileShapes = scene.tileShapes;
            const tileRotations = scene.tileRotations;

            for (const tileId of tileIds) {
                const tileX = tileId >> 8;
                const tileY = tileId & 0xff;
                const sceneX = tileX + map.borderSize;
                const sceneY = tileY + map.borderSize;

                if (tileX < 0 || tileX >= 64 || tileY < 0 || tileY >= 64) {
                    continue;
                }

                for (let level = rebuildStartLevel; level < endLevel; level++) {
                    const lights = scene.tileLights[level];
                    const blendedColors = scene.tileBlendedColors[level];

                    scene.setTileModel(level, sceneX, sceneY, undefined);
                    sceneBuilder.addTileModel(
                        scene,
                        heights,
                        underlayIds,
                        overlayIds,
                        tileShapes,
                        tileRotations,
                        lights,
                        blendedColors,
                        level,
                        sceneX,
                        sceneY,
                        this.host.terrainSmoothingEnabled,
                    );
                    const tile = scene.tiles[level][sceneX][sceneY];
                    if (!tile) {
                        continue;
                    }

                    const vertexOffset = map.borderSize * -128;
                    vertexBuf.clear();
                    addTerrainTile(
                        this.textureIndexMap,
                        vertexBuf,
                        tile,
                        vertexOffset,
                        vertexOffset,
                    );

                    const offset = getTileOffset(level, tileX, tileY);
                    map.terrainVertexBuffer.data(
                        vertexBuf.view,
                        offset * TerrainVertexBuffer.STRIDE,
                    );
                }
            }
        }

        for (const [mapId, tileIds] of this.affectedTilesMap) {
            const map = this.mapManager.getMapById(mapId);
            if (map) {
                this.host.accumulateMinimapDirtyFromEditedTiles(
                    mapId,
                    map.borderSize,
                    tileIds,
                    map.scene.sizeX,
                    map.scene.sizeY,
                );
            }
        }

        this.affectedTilesMap.clear();
        this.heightChangedTilesMap.clear();
    }

    clearMaps(): void {
        this.mapManager.cleanUp();
        // this.mapsToLoad.clear();
    }

    override async cleanUp(): Promise<void> {
        super.cleanUp();

        // Uniforms
        this.sceneUniformBuffer?.delete();
        this.sceneUniformBuffer = undefined;

        // Framebuffers
        this.pickFramebuffer?.delete();
        this.pickFramebuffer = undefined;
        this.pickColorTarget?.delete();
        this.pickColorTarget = undefined;
        this.pickDepthTarget?.delete();
        this.pickDepthTarget = undefined;

        // Textures
        this.textureArray?.delete();
        this.textureArray = undefined;
        this.textureMaterials?.delete();
        this.textureMaterials = undefined;

        // Grid
        this.gridVertexBuffer?.delete();
        this.gridVertexBuffer = undefined;
        this.gridVertexArray?.delete();
        this.gridVertexArray = undefined;

        this.chunkGridVertexBuffer?.delete();
        this.chunkGridVertexBuffer = undefined;
        this.chunkGridVertexArray?.delete();
        this.chunkGridVertexArray = undefined;

        this.clearMaps();

        if (this.shadersPromise) {
            for (const shader of await this.shadersPromise) {
                shader.delete();
            }
            this.shadersPromise = undefined;
        }
    }
}
