/**
 * Injectable host for map editor plugins and UI — prefer this over `MapEditor` in new code.
 * `EditorPluginHost` forwards to the concrete editor; the interface is what you type against.
 */
import type { AddPanelOptions } from "dockview";
import type { URLSearchParamsInit } from "react-router-dom";

import type { CacheList, LoadedCache } from "../../mapviewer/Caches";
import type { Camera } from "../../mapviewer/Camera";
import type { InputManager } from "../../mapviewer/InputManager";
import type { MapManager, MapSquare } from "../../mapviewer/MapManager";
import type { RenderDataWorkerPool } from "../../mapviewer/worker/RenderDataWorkerPool";
import type { CacheSystem } from "../../rs/cache/CacheSystem";
import type { CacheLoaderFactory } from "../../rs/cache/loader/CacheLoaderFactory";
import type { BasTypeLoader } from "../../rs/config/bastype/BasTypeLoader";
import type { FloorTypeLoader, OverlayFloorTypeLoader } from "../../rs/config/floortype/FloorTypeLoader";
import type { LocModelLoader } from "../../rs/config/loctype/LocModelLoader";
import type { LocTypeLoader } from "../../rs/config/loctype/LocTypeLoader";
import type { NpcTypeLoader } from "../../rs/config/npctype/NpcTypeLoader";
import type { ObjTypeLoader } from "../../rs/config/objtype/ObjTypeLoader";
import type { SeqFrameLoader } from "../../rs/model/seq/SeqFrameLoader";
import type { SeqTypeLoader } from "../../rs/config/seqtype/SeqTypeLoader";
import type { VarManager } from "../../rs/config/vartype/VarManager";
import type { MapFileIndex } from "../../rs/map/MapFileIndex";
import type { ModelLoader } from "../../rs/model/ModelLoader";
import type { SceneBuilder } from "../../rs/scene/SceneBuilder";
import type { TextureLoader } from "../../rs/texture/TextureLoader";
import type { MapEditorBrushType, MapEditorTool } from "../map-editor-kinds";
import type { MapEditorGizmoAppearance } from "../map-editor-gizmo-settings";
import type {
    MapEditor,
    MapEditorViewMode,
    SandboxTerrainPreset,
    SandboxTerrainSettings,
} from "../MapEditor";
import type { MapEditorRenderer } from "../MapEditorRenderer";
import type { MapEditorViewerControlSettings } from "../map-editor-viewer-control-settings";
import type { MapEditorWorkbenchUiPluginId } from "../map-editor-workbench-layout";
import type { EditorToolKeyChord } from "./builtins/builtin-plugin-types";

/** Cache + archive loaders. */
export interface EditorCacheServices {
    readonly loadedCache: LoadedCache;
    readonly cacheList: CacheList;
    readonly cacheSystem: CacheSystem;
    readonly loaderFactory: CacheLoaderFactory;
}

export interface EditorTerrainPaintServices extends EditorCacheServices {
    readonly underlayTypeLoader: FloorTypeLoader;
    readonly overlayTypeLoader: OverlayFloorTypeLoader;
    getUnderlayTypeLoader(): FloorTypeLoader;
    getOverlayTypeLoader(): OverlayFloorTypeLoader;
}

export interface EditorRsConfigServices extends EditorTerrainPaintServices {
    readonly textureLoader: TextureLoader;
    readonly modelLoader: ModelLoader;
    readonly locTypeLoader: LocTypeLoader;
    readonly objTypeLoader: ObjTypeLoader;
    readonly locModelLoader: LocModelLoader;
    readonly sceneBuilder: SceneBuilder;
    readonly mapFileIndex: MapFileIndex;
    readonly basTypeLoader: BasTypeLoader;
    readonly npcTypeLoader: NpcTypeLoader;
    readonly seqTypeLoader: SeqTypeLoader;
    readonly seqFrameLoader: SeqFrameLoader;
    readonly varManager: VarManager;
}

export interface EditorRuntimeServices {
    readonly camera: Camera;
    readonly inputManager: InputManager;
    readonly workerPool: RenderDataWorkerPool;
    readonly renderer: MapEditorRenderer;
    readonly mapManager: MapManager<MapSquare>;
}

/**
 * Full editor session API for plugins, renderer, and workbench UI.
 */
export interface IEditorPluginHost extends EditorRsConfigServices, EditorRuntimeServices {
    notifyWorkbenchStateChanged(): void;

    getViewerControlSettings(): MapEditorViewerControlSettings;
    setViewerControlSettings(partial: Partial<MapEditorViewerControlSettings>): MapEditorViewerControlSettings;

    setEditorInputSuspended(suspended: boolean): void;
    setEditorInputSuspendedBySource(source: string, suspended: boolean): void;
    isEditorInputSuspended(): boolean;

    setEditorTool(tool: MapEditorTool): void;
    subscribeEditorTool(listener: () => void): () => void;
    getEditorTool(): MapEditorTool;

    getUnderlayPaintTypeId(worldX: number, worldY: number): number;
    getOverlayPaintTypeId(worldX: number, worldY: number): number;

    setBrushType(type: MapEditorBrushType): void;
    cycleBrushType(): void;
    adjustBrushSize(delta: number): void;
    toggleOverlayFloodMode(): void;
    toggleOverlayTargetMode(): void;
    cyclePaintMouseButton(): void;
    setObjectsVisible(visible: boolean): void;
    toggleObjectsVisible(): void;
    setTerrainSmoothingEnabled(enabled: boolean): void;
    toggleTerrainSmoothingEnabled(): void;

    isEditorToolPluginEnabled(tool: MapEditorTool): boolean;
    setEditorToolPluginEnabled(tool: MapEditorTool, enabled: boolean): boolean;
    isWorkbenchUiPluginEnabled(id: MapEditorWorkbenchUiPluginId): boolean;
    setWorkbenchUiPluginEnabled(id: MapEditorWorkbenchUiPluginId, enabled: boolean): void;
    isBrushShapePluginEnabled(shape: MapEditorBrushType): boolean;
    setBrushShapePluginEnabled(shape: MapEditorBrushType, enabled: boolean): boolean;

    subscribeWorkbenchPlugins(listener: () => void): () => void;
    getWorkbenchPluginsStateSnapshot(): string;

    saveDockPanelRestore(panelId: string, options: AddPanelOptions): void;
    peekDockPanelRestore(panelId: string): AddPanelOptions | undefined;
    consumeDockPanelRestore(panelId: string): void;
    clearDockPanelRestore(): void;

    getResolvedKeybindChords(
        bindingKey: string,
        defaultChords: readonly EditorToolKeyChord[],
    ): readonly EditorToolKeyChord[];
    setKeybindOverride(bindingKey: string, chord: EditorToolKeyChord | null): void;
    clearKeybindOverride(bindingKey: string): boolean;
    clearAllKeybindOverrides(): boolean;

    getGizmoAppearance(): MapEditorGizmoAppearance;
    setGizmoAppearance(partial: Partial<MapEditorGizmoAppearance>): MapEditorGizmoAppearance;

    getSearchParams(): URLSearchParamsInit;
    applySearchParams(searchParams: URLSearchParams): void;
    updateSearchParams(): void;
    setViewMode(mode: MapEditorViewMode): void;

    getMinimapImageUrl(mapX: number, mapY: number): string | undefined;
    scheduleMinimapRefreshAfterEdit(): void;
    accumulateMinimapDirtyFromEditedTiles(
        mapId: number,
        borderSize: number,
        tileIds: Set<number>,
        sceneSizeX: number,
        sceneSizeY: number,
    ): void;
    refreshMinimapAroundCamera(): void;
    applyFlatHeightInBounds(
        minX: number,
        minY: number,
        maxX: number,
        maxY: number,
        flatHeight: number,
        options?: {
            noiseEnabled?: boolean;
            terrainPreset?: SandboxTerrainPreset;
            landform?: "normal" | "island";
            noiseSeed?: number;
            noiseAmplitude?: number;
            noiseScale?: number;
            roughness?: number;
            cliffiness?: number;
            valleyDepth?: number;
            waterLevel?: number;
            waterDepth?: number;
            beachWidth?: number;
            inlandness?: number;
        },
        processedMapIds?: Set<number>,
    ): number;
    setSandboxModeActive(active: boolean): void;
    setSandboxBounds(bounds?: { minX: number; minY: number; maxX: number; maxY: number }): void;
    setSandboxTerrainSettings(partial: Partial<SandboxTerrainSettings>): SandboxTerrainSettings;

    /** Mutable session state (delegates to the underlying editor). */
    renderDistance: number;
    unloadDistance: number;
    lodDistance: number;
    needsSearchParamUpdate: boolean;
    lastTimeSearchParamsUpdated: number;
    debugText?: string;
    selectedLevel: number;
    selectedUnderlayId: number;
    selectedOverlayId: number;
    brushSize: number;
    brushType: MapEditorBrushType;
    editorTool: MapEditorTool;
    heightAdjustStep: number;
    overlayFloodModeToggled: boolean;
    overlayTargetModeToggled: boolean;
    paintMouseButton: "left" | "right";
    objectsVisible: boolean;
    terrainSmoothingEnabled: boolean;
    viewMode: MapEditorViewMode;
    sandboxModeActive: boolean;
    sandboxBounds?: { minX: number; minY: number; maxX: number; maxY: number };
    sandboxTerrainSettings: SandboxTerrainSettings;
}

export class EditorPluginHost implements IEditorPluginHost {
    constructor(private readonly _e: MapEditor) {}

    notifyWorkbenchStateChanged(): void {
        this._e.notifyWorkbenchStateChanged();
    }

    get loadedCache(): LoadedCache {
        return this._e.loadedCache;
    }
    get cacheList(): CacheList {
        return this._e.cacheList;
    }
    get cacheSystem(): CacheSystem {
        return this._e.cacheSystem;
    }
    get loaderFactory(): CacheLoaderFactory {
        return this._e.loaderFactory;
    }

    getUnderlayTypeLoader(): FloorTypeLoader {
        return this._e.underlayTypeLoader;
    }
    getOverlayTypeLoader(): OverlayFloorTypeLoader {
        return this._e.overlayTypeLoader;
    }
    get underlayTypeLoader(): FloorTypeLoader {
        return this._e.underlayTypeLoader;
    }
    get overlayTypeLoader(): OverlayFloorTypeLoader {
        return this._e.overlayTypeLoader;
    }

    get textureLoader(): TextureLoader {
        return this._e.textureLoader;
    }
    get modelLoader(): ModelLoader {
        return this._e.modelLoader;
    }
    get locTypeLoader(): LocTypeLoader {
        return this._e.locTypeLoader;
    }
    get objTypeLoader(): ObjTypeLoader {
        return this._e.objTypeLoader;
    }
    get locModelLoader(): LocModelLoader {
        return this._e.locModelLoader;
    }
    get sceneBuilder(): SceneBuilder {
        return this._e.sceneBuilder;
    }
    get mapFileIndex(): MapFileIndex {
        return this._e.mapFileIndex;
    }
    get basTypeLoader(): BasTypeLoader {
        return this._e.basTypeLoader;
    }
    get npcTypeLoader(): NpcTypeLoader {
        return this._e.npcTypeLoader;
    }
    get seqTypeLoader(): SeqTypeLoader {
        return this._e.seqTypeLoader;
    }
    get seqFrameLoader(): SeqFrameLoader {
        return this._e.seqFrameLoader;
    }
    get varManager(): VarManager {
        return this._e.varManager;
    }

    get camera(): Camera {
        return this._e.camera;
    }
    get inputManager(): InputManager {
        return this._e.inputManager;
    }
    get workerPool(): RenderDataWorkerPool {
        return this._e.workerPool;
    }
    get renderer(): MapEditorRenderer {
        return this._e.renderer;
    }
    get mapManager(): MapManager<MapSquare> {
        return this._e.renderer.mapManager;
    }

    getViewerControlSettings(): MapEditorViewerControlSettings {
        return this._e.getViewerControlSettings();
    }
    setViewerControlSettings(partial: Partial<MapEditorViewerControlSettings>): MapEditorViewerControlSettings {
        return this._e.setViewerControlSettings(partial);
    }

    setEditorInputSuspended(suspended: boolean): void {
        this._e.setEditorInputSuspended(suspended);
    }
    setEditorInputSuspendedBySource(source: string, suspended: boolean): void {
        this._e.setEditorInputSuspendedBySource(source, suspended);
    }
    isEditorInputSuspended(): boolean {
        return this._e.isEditorInputSuspended();
    }

    setEditorTool(tool: MapEditorTool): void {
        this._e.setEditorTool(tool);
    }
    /** Arrow properties so bare refs work with `useSyncExternalStore` (no `this` binding). */
    subscribeEditorTool = (listener: () => void): (() => void) => {
        return this._e.subscribeEditorTool(listener);
    };
    getEditorTool = (): MapEditorTool => {
        return this._e.getEditorTool();
    };

    getUnderlayPaintTypeId(worldX: number, worldY: number): number {
        return this._e.getUnderlayPaintTypeId(worldX, worldY);
    }
    getOverlayPaintTypeId(worldX: number, worldY: number): number {
        return this._e.getOverlayPaintTypeId(worldX, worldY);
    }

    setBrushType(type: MapEditorBrushType): void {
        this._e.setBrushType(type);
    }
    cycleBrushType(): void {
        this._e.cycleBrushType();
    }
    adjustBrushSize(delta: number): void {
        this._e.adjustBrushSize(delta);
    }
    toggleOverlayFloodMode(): void {
        this._e.toggleOverlayFloodMode();
    }
    toggleOverlayTargetMode(): void {
        this._e.toggleOverlayTargetMode();
    }
    cyclePaintMouseButton(): void {
        this._e.cyclePaintMouseButton();
    }
    setObjectsVisible(visible: boolean): void {
        this._e.setObjectsVisible(visible);
    }
    toggleObjectsVisible(): void {
        this._e.toggleObjectsVisible();
    }
    setTerrainSmoothingEnabled(enabled: boolean): void {
        this._e.setTerrainSmoothingEnabled(enabled);
    }
    toggleTerrainSmoothingEnabled(): void {
        this._e.toggleTerrainSmoothingEnabled();
    }

    isEditorToolPluginEnabled(tool: MapEditorTool): boolean {
        return this._e.isEditorToolPluginEnabled(tool);
    }
    setEditorToolPluginEnabled(tool: MapEditorTool, enabled: boolean): boolean {
        return this._e.setEditorToolPluginEnabled(tool, enabled);
    }
    isWorkbenchUiPluginEnabled(id: MapEditorWorkbenchUiPluginId): boolean {
        return this._e.isWorkbenchUiPluginEnabled(id);
    }
    setWorkbenchUiPluginEnabled(id: MapEditorWorkbenchUiPluginId, enabled: boolean): void {
        this._e.setWorkbenchUiPluginEnabled(id, enabled);
    }
    isBrushShapePluginEnabled(shape: MapEditorBrushType): boolean {
        return this._e.isBrushShapePluginEnabled(shape);
    }
    setBrushShapePluginEnabled(shape: MapEditorBrushType, enabled: boolean): boolean {
        return this._e.setBrushShapePluginEnabled(shape, enabled);
    }

    subscribeWorkbenchPlugins = (listener: () => void): (() => void) => {
        return this._e.subscribeWorkbenchPlugins(listener);
    };
    getWorkbenchPluginsStateSnapshot = (): string => {
        return this._e.getWorkbenchPluginsStateSnapshot();
    };

    saveDockPanelRestore(panelId: string, options: AddPanelOptions): void {
        this._e.saveDockPanelRestore(panelId, options);
    }
    peekDockPanelRestore(panelId: string): AddPanelOptions | undefined {
        return this._e.peekDockPanelRestore(panelId);
    }
    consumeDockPanelRestore(panelId: string): void {
        this._e.consumeDockPanelRestore(panelId);
    }
    clearDockPanelRestore(): void {
        this._e.clearDockPanelRestore();
    }

    getResolvedKeybindChords(
        bindingKey: string,
        defaultChords: readonly EditorToolKeyChord[],
    ): readonly EditorToolKeyChord[] {
        return this._e.getResolvedKeybindChords(bindingKey, defaultChords);
    }
    setKeybindOverride(bindingKey: string, chord: EditorToolKeyChord | null): void {
        this._e.setKeybindOverride(bindingKey, chord);
    }
    clearKeybindOverride(bindingKey: string): boolean {
        return this._e.clearKeybindOverride(bindingKey);
    }
    clearAllKeybindOverrides(): boolean {
        return this._e.clearAllKeybindOverrides();
    }

    getGizmoAppearance(): MapEditorGizmoAppearance {
        return this._e.getGizmoAppearance();
    }
    setGizmoAppearance(partial: Partial<MapEditorGizmoAppearance>): MapEditorGizmoAppearance {
        return this._e.setGizmoAppearance(partial);
    }

    getSearchParams(): URLSearchParamsInit {
        return this._e.getSearchParams();
    }
    applySearchParams(searchParams: URLSearchParams): void {
        this._e.applySearchParams(searchParams);
    }
    updateSearchParams(): void {
        this._e.updateSearchParams();
    }
    setViewMode(mode: MapEditorViewMode): void {
        this._e.setViewMode(mode);
    }

    getMinimapImageUrl(mapX: number, mapY: number): string | undefined {
        return this._e.getMinimapImageUrl(mapX, mapY);
    }
    scheduleMinimapRefreshAfterEdit(): void {
        this._e.scheduleMinimapRefreshAfterEdit();
    }
    accumulateMinimapDirtyFromEditedTiles(
        mapId: number,
        borderSize: number,
        tileIds: Set<number>,
        sceneSizeX: number,
        sceneSizeY: number,
    ): void {
        this._e.accumulateMinimapDirtyFromEditedTiles(mapId, borderSize, tileIds, sceneSizeX, sceneSizeY);
    }
    refreshMinimapAroundCamera(): void {
        this._e.refreshMinimapAroundCamera();
    }
    applyFlatHeightInBounds(
        minX: number,
        minY: number,
        maxX: number,
        maxY: number,
        flatHeight: number,
        options?: {
            noiseEnabled?: boolean;
            terrainPreset?: SandboxTerrainPreset;
            landform?: "normal" | "island";
            noiseSeed?: number;
            noiseAmplitude?: number;
            noiseScale?: number;
            roughness?: number;
            cliffiness?: number;
            valleyDepth?: number;
            waterLevel?: number;
            waterDepth?: number;
            beachWidth?: number;
            inlandness?: number;
        },
        processedMapIds?: Set<number>,
    ): number {
        return this._e.applyFlatHeightInBounds(
            minX,
            minY,
            maxX,
            maxY,
            flatHeight,
            options,
            processedMapIds,
        );
    }
    setSandboxModeActive(active: boolean): void {
        this._e.setSandboxModeActive(active);
    }
    setSandboxBounds(bounds?: { minX: number; minY: number; maxX: number; maxY: number }): void {
        this._e.setSandboxBounds(bounds);
    }
    setSandboxTerrainSettings(partial: Partial<SandboxTerrainSettings>): SandboxTerrainSettings {
        return this._e.setSandboxTerrainSettings(partial);
    }

    get renderDistance(): number {
        return this._e.renderDistance;
    }
    set renderDistance(v: number) {
        this._e.renderDistance = v;
    }
    get unloadDistance(): number {
        return this._e.unloadDistance;
    }
    set unloadDistance(v: number) {
        this._e.unloadDistance = v;
    }
    get lodDistance(): number {
        return this._e.lodDistance;
    }
    set lodDistance(v: number) {
        this._e.lodDistance = v;
    }
    get needsSearchParamUpdate(): boolean {
        return this._e.needsSearchParamUpdate;
    }
    set needsSearchParamUpdate(v: boolean) {
        this._e.needsSearchParamUpdate = v;
    }
    get lastTimeSearchParamsUpdated(): number {
        return this._e.lastTimeSearchParamsUpdated;
    }
    set lastTimeSearchParamsUpdated(v: number) {
        this._e.lastTimeSearchParamsUpdated = v;
    }
    get debugText(): string | undefined {
        return this._e.debugText;
    }
    set debugText(v: string | undefined) {
        this._e.debugText = v;
    }
    get selectedLevel(): number {
        return this._e.selectedLevel;
    }
    set selectedLevel(v: number) {
        this._e.selectedLevel = v;
    }
    get selectedUnderlayId(): number {
        return this._e.selectedUnderlayId;
    }
    set selectedUnderlayId(v: number) {
        this._e.selectedUnderlayId = v;
    }
    get selectedOverlayId(): number {
        return this._e.selectedOverlayId;
    }
    set selectedOverlayId(v: number) {
        this._e.selectedOverlayId = v;
    }
    get brushSize(): number {
        return this._e.brushSize;
    }
    set brushSize(v: number) {
        this._e.brushSize = v;
    }
    get brushType(): MapEditorBrushType {
        return this._e.brushType;
    }
    set brushType(v: MapEditorBrushType) {
        this._e.brushType = v;
    }
    get editorTool(): MapEditorTool {
        return this._e.editorTool;
    }
    set editorTool(v: MapEditorTool) {
        this._e.editorTool = v;
    }
    get heightAdjustStep(): number {
        return this._e.heightAdjustStep;
    }
    set heightAdjustStep(v: number) {
        this._e.heightAdjustStep = v;
    }
    get overlayFloodModeToggled(): boolean {
        return this._e.overlayFloodModeToggled;
    }
    set overlayFloodModeToggled(v: boolean) {
        this._e.overlayFloodModeToggled = v;
    }
    get overlayTargetModeToggled(): boolean {
        return this._e.overlayTargetModeToggled;
    }
    set overlayTargetModeToggled(v: boolean) {
        this._e.overlayTargetModeToggled = v;
    }
    get paintMouseButton(): "left" | "right" {
        return this._e.paintMouseButton;
    }
    set paintMouseButton(v: "left" | "right") {
        this._e.paintMouseButton = v;
    }
    get objectsVisible(): boolean {
        return this._e.objectsVisible;
    }
    set objectsVisible(v: boolean) {
        this._e.objectsVisible = v;
    }
    get terrainSmoothingEnabled(): boolean {
        return this._e.terrainSmoothingEnabled;
    }
    set terrainSmoothingEnabled(v: boolean) {
        this._e.terrainSmoothingEnabled = v;
    }
    get viewMode(): MapEditorViewMode {
        return this._e.viewMode;
    }
    set viewMode(v: MapEditorViewMode) {
        this._e.viewMode = v;
    }
    get sandboxModeActive(): boolean {
        return this._e.sandboxModeActive;
    }
    set sandboxModeActive(v: boolean) {
        this._e.sandboxModeActive = v;
    }
    get sandboxBounds(): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
        return this._e.sandboxBounds;
    }
    set sandboxBounds(v: { minX: number; minY: number; maxX: number; maxY: number } | undefined) {
        this._e.sandboxBounds = v;
    }
    get sandboxTerrainSettings(): SandboxTerrainSettings {
        return this._e.sandboxTerrainSettings;
    }
    set sandboxTerrainSettings(v: SandboxTerrainSettings) {
        this._e.sandboxTerrainSettings = v;
    }
}
