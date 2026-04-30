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
    type MapEditorGizmoAppearance,
    clampThickness,
    loadGizmoAppearanceFromStorage,
} from "../map-editor-gizmo-settings";
import {
    GRID_PROGRAM,
    HIGHLIGHT_PROGRAM,
    TILE_PICKING_PROGRAM,
    createObjectProgram,
    createTerrainProgram,
} from "./shaders/Shaders";
import { applyHeightToolRuntime } from "../plugins/builtins/height-edit-runtime";

const MAX_TEXTURES = 2048;
const TEXTURE_SIZE = 128;
const BOUNDARY_SEG_UNIFORM_FLOATS = OVERLAY_MESH_BOUNDARY_SEG_MAX * 4;
const boundarySegUniformScratch = new Float32Array(BOUNDARY_SEG_UNIFORM_FLOATS);

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

    // State
    tilePickingBuffer = new Uint8Array(4);

    hoverWorldX: number = -1;
    hoverWorldY: number = -1;

    lastTimeTerrainUpdated: number = 0;
    updatedTerrainMapIds: Set<number> = new Set();
    loadingTerrainMapIds: Set<number> = new Set();

    drawGrid: boolean = false;
    drawChunkGrid: boolean = false;

    mapSquareGridColor: vec4 = vec4.fromValues(...DEFAULT_GIZMO_APPEARANCE.mapSquareGrid);
    mapChunkGridColor: vec4 = vec4.fromValues(...DEFAULT_GIZMO_APPEARANCE.chunkGrid);

    brushFill: vec4 = vec4.fromValues(...DEFAULT_BRUSH_OUTLINE.fill);
    brushOutlineColor: vec4 = vec4.fromValues(...DEFAULT_BRUSH_OUTLINE.outline);
    brushOutlineThickness: number = DEFAULT_BRUSH_OUTLINE.outlineThickness;

    affectedTilesMap: Map<number, Set<number>> = new Map();
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
        );

        const [
            terrainProgram,
            objectProgram,
            objectProgramAlpha,
            tilePickingProgram,
            highlightTileProgram,
            gridProgram,
        ] = programs;
        this.terrainProgram = terrainProgram;
        this.objectProgram = objectProgram;
        this.objectProgramAlpha = objectProgramAlpha;
        this.tilePickingProgram = tilePickingProgram;
        this.highlightTileProgram = highlightTileProgram;
        this.gridProgram = gridProgram;

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
        console.error(
            `[editor-objects][${mapX},${mapY}] loaded drawRanges=${mapData.objectDrawRanges?.length ?? -1} alpha=${mapData.objectDrawRangesAlpha?.length ?? -1} indices=${mapData.objectIndices?.length ?? -1} verticesBytes=${mapData.objectVertices?.byteLength ?? -1} hasMultiDraw=${this.hasMultiDraw}`,
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
            objectVertices: new Uint8Array(0),
            objectIndices: new Int32Array(0),
            objectModelTextureData: new Uint16Array(16 * 4),
            objectModelTextureDataAlpha: new Uint16Array(16 * 4),
            objectDrawRanges: [],
            objectDrawRangesAlpha: [],
            locsAnimated: [],
            heightMapTextureData,
        };
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

    override handleMouseInput(): void {
        super.handleMouseInput();

        const inputManager = this.host.inputManager;

        if (this.host.editorTool === "object" && inputManager.keysPressedThisFrame.has("MouseRight")) {
            const count = this.getHoveredTileObjectCount();
            if (count !== undefined) {
                console.log(`Object tool: ${count} objects on hovered tile`);
                this.host.debugText = `Objects: ${count}`;
            }
        }

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
            for (const loc of map.locsAnimated) {
                loc.update(this.host.seqFrameLoader, cycle);
            }
        }
    }

    render(time: number, deltaTime: number, resized: boolean): void {
        const frameCount = this.stats.frameCount;
        if (frameCount === 0) {
            console.error("[editor-objects] render loop active");
        }
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

        this.handleTileManipulation(time);

        this.renderTerrain(time);

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

        // Keep this last so other per-frame debug writers do not overwrite object diagnostics.
        this.updateObjectDebugHud();
    }

    private updateObjectDebugHud(): void {
        let drawRanges = 0;
        let drawRangesAlpha = 0;
        let locTiles = 0;
        let locEntries = 0;
        let animatedLocs = 0;
        let animatedAlive = 0;
        for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
            const map = this.mapManager.visibleMaps[i];
            drawRanges += map.objectDrawRanges?.length ?? 0;
            drawRangesAlpha += map.objectDrawRangesAlpha?.length ?? 0;
            animatedLocs += map.locsAnimated.length;
            for (const loc of map.locsAnimated) {
                if ((loc as any).seqType) {
                    animatedAlive++;
                }
            }
            const level = this.host.selectedLevel;
            for (let tx = 0; tx < 64; tx++) {
                for (let ty = 0; ty < 64; ty++) {
                    const tile = map.scene.tiles[level][tx + map.borderSize][ty + map.borderSize];
                    if (!tile) {
                        continue;
                    }
                    const count =
                        (tile.floorDecoration ? 1 : 0) +
                        (tile.wall ? 1 : 0) +
                        (tile.wallDecoration ? 1 : 0) +
                        tile.locs.length;
                    if (count > 0) {
                        locTiles++;
                        locEntries += count;
                    }
                }
            }
        }
        this.host.debugText =
            `ObjDbg maps:${this.mapManager.visibleMapCount} visible:${this.host.objectsVisible ? 1 : 0} md:${this.hasMultiDraw ? 1 : 0}\n` +
            `ObjDbg draw:${drawRanges} alpha:${drawRangesAlpha}\n` +
            `ObjDbg locTiles:${locTiles} locEntries:${locEntries} animLocs:${animatedLocs} animAlive:${animatedAlive}`;
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

        const startLevel = 0;
        const endLevel = 4;

        const terrainDrawRange = newDrawRange(
            startLevel * LEVEL_TILE_VERTICES,
            endLevel * LEVEL_TILE_VERTICES,
        );

        for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
            const map = this.mapManager.visibleMaps[i];

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
            for (const loc of map.locsAnimated) {
                const frameId = loc.frame;
                const frame = loc.anim.frames[frameId | 0];
                const index = loc.getDrawRangeIndex(false, false, false);
                if (index !== -1) {
                    map.objectDrawCall.offsets[index] = frame[0];
                    (map.objectDrawCall as any).numElements[index] = frame[1];
                    map.objectDrawRanges[index] = frame;
                }
                if (loc.anim.framesAlpha) {
                    const alphaFrame = loc.anim.framesAlpha[frameId | 0];
                    const alphaIndex = loc.getDrawRangeIndex(true, false, false);
                    if (alphaIndex !== -1) {
                        map.objectDrawCallAlpha.offsets[alphaIndex] = alphaFrame[0];
                        (map.objectDrawCallAlpha as any).numElements[alphaIndex] = alphaFrame[1];
                        map.objectDrawRangesAlpha[alphaIndex] = alphaFrame;
                    }
                }
            }
        }

        if (this.host.objectsVisible) {
            for (let i = 0; i < this.mapManager.visibleMapCount; i++) {
                const map = this.mapManager.visibleMaps[i];
                if (map.objectDrawRanges.length > 0) {
                    this.draw(map.objectDrawCall, map.objectDrawRanges);
                }
            }
            for (let i = this.mapManager.visibleMapCount - 1; i >= 0; i--) {
                const map = this.mapManager.visibleMaps[i];
                if (map.objectDrawRangesAlpha.length > 0) {
                    this.draw(map.objectDrawCallAlpha, map.objectDrawRangesAlpha);
                }
            }
        }

        if (this.hoverWorldX !== -1 && this.hoverWorldY !== -1) {
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

        this.tilePickingDrawCall.uniform("u_level", this.host.selectedLevel);

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

                this.host.debugText = `Map33: ${mapX}, ${mapY} Tile: ${tileX}, ${tileY} World: ${worldX}, ${worldY}`;
            } else {
                this.hoverWorldX = -1;
                this.hoverWorldY = -1;
                this.host.debugText = "No tile selected";
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

    private getHoveredTileObjectCount(): number | undefined {
        if (this.hoverWorldX === -1 || this.hoverWorldY === -1) {
            return undefined;
        }

        const mapX = Math.floor(this.hoverWorldX / 64);
        const mapY = Math.floor(this.hoverWorldY / 64);
        const map = this.mapManager.getMapById(getMapSquareId(mapX, mapY));
        if (!map) {
            return undefined;
        }

        const localX = ((this.hoverWorldX % 64) + 64) % 64;
        const localY = ((this.hoverWorldY % 64) + 64) % 64;
        const sceneX = localX + map.borderSize;
        const sceneY = localY + map.borderSize;
        const scene = map.scene;
        if (sceneX < 0 || sceneX >= scene.sizeX || sceneY < 0 || sceneY >= scene.sizeY) {
            return undefined;
        }

        let count = 0;
        for (let level = 0; level < scene.levels; level++) {
            const tile = scene.tiles[level][sceneX][sceneY];
            if (!tile) {
                continue;
            }
            count += tile.locs.length;
            if (tile.floorDecoration) {
                count += 1;
            }
            if (tile.wall) {
                count += 1;
            }
            if (tile.wallDecoration) {
                count += 1;
            }
        }
        return count;
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
        const inputManager = this.host.inputManager;

        if (this.hoverWorldX === -1 || this.hoverWorldY === -1 || !inputManager.isHolding()) {
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
                scene.tileUnderlays[level][sceneX][sceneY] = paintId + 1;

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

                scene.tileOverlays[level][sceneX][sceneY] = overlayValue;

                if (overlayValue === 0) {
                    scene.tileShapes[level][sceneX][sceneY] = 0;
                    scene.tileRotations[level][sceneX][sceneY] = 0;
                }

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
        const map = this.mapManager.getMapById(getMapSquareId(mapX, mapY));
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

        scene.tileOverlays[level][sceneX][sceneY] = overlayValue;

        if (overlayValue === 0) {
            scene.tileShapes[level][sceneX][sceneY] = 0;
            scene.tileRotations[level][sceneX][sceneY] = 0;
        }

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

            let endLevel = selectedLevel + 1;

            if (map.heightUpdated) {
                map.heightMapTextureData = loadHeightMapTextureData(scene);
                map.updateHeightMapTexture(this.app);

                for (let level = selectedLevel; level < scene.levels; level++) {
                    scene.calculateTileLights(level, true);
                }
                endLevel = scene.levels;

                map.heightUpdated = false;
            }

            if (map.underlayUpdated) {
                sceneBuilder.blendUnderlays(scene, selectedLevel, this.host.terrainSmoothingEnabled, true);

                map.underlayUpdated = false;
            }

            if (map.overlayUpdated) {
                map.overlayUpdated = false;
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

                for (let level = selectedLevel; level < endLevel; level++) {
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
