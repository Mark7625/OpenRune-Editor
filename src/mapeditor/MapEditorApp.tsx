import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Globe, Layers3, MapPinned, Play } from "lucide-react";
import { registerSerializer } from "threads";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { OsrsLoadingBar } from "../components/rs/loading/OsrsLoadingBar";
import { WorldMapModal } from "../components/rs/worldmap/WorldMapModal";
import { getActiveProfileIdAsync, loadLocalCacheProfilesAsync } from "../lib/local-cache-profiles";
import { resolveActiveProfileCache } from "../lib/resolve-active-profile-cache";
import { isIos } from "../util/DeviceUtil";
import type { CacheList } from "../mapviewer/Caches";
import { getMapRenderWorkerPool } from "../mapviewer/map-render-worker-pool";
import { renderDataLoaderSerializer } from "../mapviewer/worker/RenderDataLoader";
import { cn } from "../util/cn";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { MapEditor } from "./MapEditor";
import { MapEditorContainer } from "./MapEditorContainer";
import {
    registerMapEditorExternalHost,
    setMapEditorExternalPanelCloseHandler,
    unregisterMapEditorExternalHost,
} from "./map-editor-external-panel";
import { isMapEditorFloatablePanel } from "./map-editor-panel-display";
import { restoreMapEditorExternalPopout } from "./map-editor-popout-actions";

registerSerializer(renderDataLoaderSerializer);

interface LastLoadedMapEntry {
    id: string;
    name: string;
    date: string;
    imageUrl: string;
    mode: "region" | "sandbox";
    regionId: number;
    mapX: number;
    mapY: number;
    radius: number;
    cacheProfileId: string;
    cacheProfileName: string;
}

interface LaunchSnapshotMeta {
    mode: "region" | "sandbox";
    mapX: number;
    mapY: number;
    regionId: number;
    radius: number;
}

const LAST_LOADED_STORAGE_PREFIX = "map-editor-last-loaded:";
const LAST_LOADED_STORAGE_INDEX_KEY = "map-editor-last-loaded:index";
const LAST_LOADED_MAX_ITEMS = 30;

function getStorageKey(cacheProfileId: string): string {
    return `${LAST_LOADED_STORAGE_PREFIX}${cacheProfileId}`;
}

function loadLastLoadedFromStorage(cacheProfileId: string, cacheProfileName?: string): LastLoadedMapEntry[] {
    try {
        const raw = window.localStorage.getItem(getStorageKey(cacheProfileId));
        let indexRaw = "";
        if (!raw && cacheProfileName) {
            indexRaw = window.localStorage.getItem(LAST_LOADED_STORAGE_INDEX_KEY) ?? "";
        }
        const index =
            indexRaw && typeof indexRaw === "string"
                ? (JSON.parse(indexRaw) as Record<string, string>)
                : undefined;
        const fallbackId = cacheProfileName ? index?.[cacheProfileName] : undefined;
        const fallbackRaw =
            !raw && fallbackId ? window.localStorage.getItem(getStorageKey(fallbackId)) : null;
        const sourceRaw = raw ?? fallbackRaw;
        if (!sourceRaw) {
            return [];
        }
        const parsed = JSON.parse(sourceRaw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter(
            (entry): entry is LastLoadedMapEntry =>
                !!entry &&
                typeof entry.id === "string" &&
                typeof entry.name === "string" &&
                typeof entry.date === "string" &&
                typeof entry.imageUrl === "string" &&
                typeof entry.mode === "string" &&
                typeof entry.regionId === "number" &&
                typeof entry.mapX === "number" &&
                typeof entry.mapY === "number" &&
                typeof entry.radius === "number" &&
                typeof entry.cacheProfileId === "string" &&
                typeof entry.cacheProfileName === "string",
        );
    } catch {
        return [];
    }
}

function persistLastLoadedToStorage(
    cacheProfileId: string,
    cacheProfileName: string,
    entries: LastLoadedMapEntry[],
): void {
    try {
        window.localStorage.setItem(getStorageKey(cacheProfileId), JSON.stringify(entries));
        const indexRaw = window.localStorage.getItem(LAST_LOADED_STORAGE_INDEX_KEY);
        const index =
            indexRaw && typeof indexRaw === "string"
                ? (JSON.parse(indexRaw) as Record<string, string>)
                : {};
        index[cacheProfileName] = cacheProfileId;
        window.localStorage.setItem(LAST_LOADED_STORAGE_INDEX_KEY, JSON.stringify(index));
    } catch (error) {
        console.warn("Failed to persist last loaded maps.", error);
    }
}

function formatLastLoadedDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
    });
}

function fallbackPreviewDataUrl(label: string): string {
    return (
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#0f172a"/><rect x="4" y="4" width="56" height="56" rx="6" fill="#1e293b"/><text x="32" y="30" font-family="Arial, sans-serif" font-size="10" text-anchor="middle" fill="#e2e8f0">${label}</text><text x="32" y="44" font-family="Arial, sans-serif" font-size="9" text-anchor="middle" fill="#94a3b8">64x64</text></svg>`,
        )
    );
}

function buildEntryName(mode: "region" | "sandbox", regionId: number, mapX: number, mapY: number): string {
    if (Number.isFinite(regionId)) {
        return `${mode === "sandbox" ? "Sandbox" : "Region"} ${regionId}`;
    }
    return `${mode === "sandbox" ? "Sandbox" : "Coords"} ${mapX}, ${mapY}`;
}

function sanitizePersistedImage(previewUrl: string, regionId: number): string {
    // Avoid blowing localStorage quota with large data URLs.
    if (!previewUrl) {
        return fallbackPreviewDataUrl(`R${regionId}`);
    }
    if (previewUrl.startsWith("data:image") && previewUrl.length > 120_000) {
        return fallbackPreviewDataUrl(`R${regionId}`);
    }
    return previewUrl;
}

export function MapEditorApp(): JSX.Element {
    const SANDBOX_PREVIEW_FOOTPRINT_PX = 177;
    const [, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();

    const [showLaunchPanel, setShowLaunchPanel] = useState(true);
    const [isWorldMapOpen, setWorldMapOpen] = useState(false);
    const [activeMode, setActiveMode] = useState<"region" | "sandbox">("region");
    const [targetRegion, setTargetRegion] = useState<string>("12342");
    const [targetRegionX, setTargetRegionX] = useState<string>("");
    const [targetRegionY, setTargetRegionY] = useState<string>("");
    const [regionRadius, setRegionRadius] = useState<number>(1);
    const [sandboxRegionRadius, setSandboxRegionRadius] = useState<number>(1);
    const [selectedLoadFileName, setSelectedLoadFileName] = useState<string>("");
    const [errorMessage, setErrorMessage] = useState<string>();
    const [loadingLabel, setLoadingLabel] = useState<string>("Loading selected cache...");
    const [loadingProgress, setLoadingProgress] = useState<number>(0);
    const [isEnteringEditor, setIsEnteringEditor] = useState(false);
    const [launchMode, setLaunchMode] = useState<"region" | "sandbox" | null>(null);
    const [enteringDisplayProgress, setEnteringDisplayProgress] = useState<number>(0);
    const [enteringLoadedRegions, setEnteringLoadedRegions] = useState<number>(0);
    const [enteringTotalRegions, setEnteringTotalRegions] = useState<number>(0);
    const [enteringBounds, setEnteringBounds] = useState<
        { minX: number; minY: number; maxX: number; maxY: number } | undefined
    >();
    const [isSandboxPostProcessing, setIsSandboxPostProcessing] = useState(false);
    const [sandboxSweepBounds, setSandboxSweepBounds] = useState<
        { minX: number; minY: number; maxX: number; maxY: number } | undefined
    >();
    const [activeCacheProfileId, setActiveCacheProfileId] = useState<string>("");
    const [activeCacheProfileName, setActiveCacheProfileName] = useState<string>("");
    const [lastLoadedMaps, setLastLoadedMaps] = useState<LastLoadedMapEntry[]>([]);
    const [lastLaunchMeta, setLastLaunchMeta] = useState<LaunchSnapshotMeta>();
    const [mapEditor, setMapEditor] = useState<MapEditor>();
    const [pluginHost, setPluginHost] = useState<IEditorPluginHost>();
    const latestLastLaunchMetaRef = useRef<LaunchSnapshotMeta | undefined>(undefined);
    const lastSavedSessionKeyRef = useRef<string>("");
    const lastLoadedMapsRef = useRef<LastLoadedMapEntry[]>([]);
    const launchMetaRef = useRef<LaunchSnapshotMeta | undefined>(undefined);
    useEffect(() => {
        lastLoadedMapsRef.current = lastLoadedMaps;
    }, [lastLoadedMaps]);

    const regionPreviewCells = useMemo(() => {
        const safeRadius = Math.max(0, Math.floor(regionRadius || 0));
        const safeCount = (safeRadius * 2 + 1) ** 2;
        const cellCount = Math.min(100, safeCount);
        const columns = Math.max(3, Math.min(14, safeRadius * 2 + 1));
        const rows = Math.max(1, Math.ceil(cellCount / columns));
        const sizeRatio = Math.min(1, 24 / Math.max(24, safeCount));
        const tileSize = Math.max(5, Math.round(17 * Math.sqrt(sizeRatio)));
        return { safeRadius, safeCount, cellCount, columns, rows, tileSize };
    }, [regionRadius]);
    const sandboxPreviewCells = useMemo(() => {
        const safeRadius = Math.max(0, Math.floor(sandboxRegionRadius || 0));
        const safeCount = (safeRadius * 2 + 1) ** 2;
        const cellCount = Math.min(100, safeCount);
        const columns = Math.max(3, Math.min(14, safeRadius * 2 + 1));
        const rows = Math.max(1, Math.ceil(cellCount / columns));
        const sizeRatio = Math.min(1, 24 / Math.max(24, safeCount));
        const tileSize = Math.max(5, Math.round(17 * Math.sqrt(sizeRatio)));
        return { safeRadius, safeCount, cellCount, columns, rows, tileSize };
    }, [sandboxRegionRadius]);
    const sandboxRegionPreviewTileSize = useMemo(() => {
        const fitByCols = Math.floor(SANDBOX_PREVIEW_FOOTPRINT_PX / Math.max(1, sandboxPreviewCells.columns));
        const fitByRows = Math.floor(SANDBOX_PREVIEW_FOOTPRINT_PX / Math.max(1, sandboxPreviewCells.rows));
        return Math.max(2, Math.min(fitByCols, fitByRows));
    }, [SANDBOX_PREVIEW_FOOTPRINT_PX, sandboxPreviewCells.columns, sandboxPreviewCells.rows]);
    const hasRegionIdInput = targetRegion.trim().length > 0;
    const hasRegionXInput = targetRegionX.trim().length > 0;
    const hasRegionYInput = targetRegionY.trim().length > 0;
    const hasAnyCoordInput = hasRegionXInput || hasRegionYInput;
    const isRegionIdValid = /^\d+$/.test(targetRegion.trim());
    const isRegionCoordsValid =
        /^\d+$/.test(targetRegionX.trim()) && /^\d+$/.test(targetRegionY.trim());
    const canOpenRegion = isRegionIdValid || isRegionCoordsValid;
    const parseSandboxSeed = (seed: string): number => {
        const trimmed = seed.trim();
        if (!trimmed) {
            return 0;
        }
        if (/^-?\d+$/.test(trimmed)) {
            return Number.parseInt(trimmed, 10) || 0;
        }
        let hash = 2166136261;
        for (let i = 0; i < trimmed.length; i++) {
            hash ^= trimmed.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash | 0;
    };

    const saveLastLoadedEntry = useCallback((meta: LaunchSnapshotMeta, reason: "enter" | "exit"): void => {
        if (!mapEditor || !activeCacheProfileId || !activeCacheProfileName) {
            return;
        }
        const now = Date.now();
        const sessionKey = `${meta.mode}:${meta.regionId}:${meta.mapX}:${meta.mapY}:${meta.radius}:${activeCacheProfileId}`;
        if (reason === "enter" && lastSavedSessionKeyRef.current === sessionKey) {
            return;
        }
        const imageUrl =
            mapEditor.getMinimapImageUrl(meta.mapX, meta.mapY) ??
            fallbackPreviewDataUrl(`R${meta.regionId}`);
        const entry: LastLoadedMapEntry = {
            id: `${now}-${meta.mode}-${meta.regionId}-${meta.radius}-${reason}`,
            name: buildEntryName(meta.mode, meta.regionId, meta.mapX, meta.mapY),
            date: formatLastLoadedDate(now),
            imageUrl: sanitizePersistedImage(imageUrl, meta.regionId),
            mode: meta.mode,
            regionId: meta.regionId,
            mapX: meta.mapX,
            mapY: meta.mapY,
            radius: meta.radius,
            cacheProfileId: activeCacheProfileId,
            cacheProfileName: activeCacheProfileName,
        };
        const prev = lastLoadedMapsRef.current;
        const deduped = prev.filter(
            (item) =>
                !(
                    item.mode === entry.mode &&
                    item.regionId === entry.regionId &&
                    item.mapX === entry.mapX &&
                    item.mapY === entry.mapY &&
                    item.radius === entry.radius
                ),
        );
        const next = [entry, ...deduped].slice(0, LAST_LOADED_MAX_ITEMS);
        persistLastLoadedToStorage(activeCacheProfileId, activeCacheProfileName, next);
        lastLoadedMapsRef.current = next;
        setLastLoadedMaps(next);
        lastSavedSessionKeyRef.current = sessionKey;
    }, [activeCacheProfileId, activeCacheProfileName, mapEditor]);

    // Load once per route (not per query string).
    useEffect(() => {
        if (pluginHost) {
            return;
        }

        const abortController = new AbortController();

        const isAbortError = (error: unknown): boolean =>
            error instanceof DOMException && error.name === "AbortError";

        const load = async () => {
            setLoadingLabel("Resolving cache profile...");
            setLoadingProgress(10);

            const [profiles, activeProfileId] = await Promise.all([
                loadLocalCacheProfilesAsync(),
                getActiveProfileIdAsync(),
            ]);
            if (!activeProfileId) {
                setErrorMessage("No cache selected. Pick one in Cache Repository.");
                return;
            }
            const activeProfile = profiles.find((p) => p.id === activeProfileId);
            if (!activeProfile) {
                setErrorMessage("Selected cache profile missing. Re-select in Cache Repository.");
                return;
            }
            setActiveCacheProfileId(activeProfile.id);
            setActiveCacheProfileName(activeProfile.name);
            setLastLoadedMaps(loadLastLoadedFromStorage(activeProfile.id, activeProfile.name));
            setLoadingLabel(`Loading "${activeProfile.name}" cache...`);
            setLoadingProgress(30);

            const cache = await resolveActiveProfileCache(activeProfile);
            if (!cache) {
                const returnTo = `${location.pathname}${location.search}`;
                navigate(
                    `/cache-test?autoload=1&returnTo=${encodeURIComponent(returnTo)}`,
                    { replace: true },
                );
                return;
            }

            setLoadingLabel(`Using "${activeProfile.name}" cache...`);
            setLoadingProgress(45);
            const cacheListForEditor: CacheList = {
                caches: [cache.info],
                latest: cache.info,
            };

            if (abortController.signal.aborted) {
                return;
            }

            setLoadingLabel("Preparing editor setup...");
            setLoadingProgress(85);

            const mapEditorInstance = new MapEditor(
                getMapRenderWorkerPool(),
                cacheListForEditor,
                cache,
            );
            setLoadingProgress(100);
            setMapEditor(mapEditorInstance);
            setPluginHost(mapEditorInstance.pluginHost);
            setSearchParams({}, { replace: true });
        };

        if (isIos) {
            setErrorMessage("iOS is not supported.");
        } else {
            load().catch((error) => {
                if (!isAbortError(error)) {
                    console.error(error);
                }
                if (!abortController.signal.aborted) {
                    setErrorMessage(
                        error instanceof Error
                            ? error.message
                            : "Failed to load selected cache. Import it in Cache Repository.",
                    );
                }
            });
        }

        return () => {
            if (!abortController.signal.aborted) {
                abortController.abort("component-unmount");
            }
        };
    }, [location.pathname, navigate, pluginHost, setSearchParams]);

    useEffect(() => {
        latestLastLaunchMetaRef.current = lastLaunchMeta;
    }, [lastLaunchMeta]);

    useEffect(() => {
        if (!pluginHost) {
            return;
        }
        registerMapEditorExternalHost(pluginHost);
        setMapEditorExternalPanelCloseHandler((panelId) => {
            if (panelId === "editor-brush-workspace" || isMapEditorFloatablePanel(panelId)) {
                restoreMapEditorExternalPopout(panelId);
            }
        });
        return () => {
            setMapEditorExternalPanelCloseHandler(null);
            unregisterMapEditorExternalHost();
        };
    }, [pluginHost]);

    useEffect(() => {
        if (!showLaunchPanel || !activeCacheProfileId) {
            return;
        }
        const restored = loadLastLoadedFromStorage(activeCacheProfileId, activeCacheProfileName);
        lastLoadedMapsRef.current = restored;
        setLastLoadedMaps(restored);
    }, [activeCacheProfileId, activeCacheProfileName, showLaunchPanel]);

    useEffect(() => {
        const saveOnExit = () => {
            const latestMeta = launchMetaRef.current ?? latestLastLaunchMetaRef.current;
            if (!latestMeta || showLaunchPanel) {
                return;
            }
            saveLastLoadedEntry(latestMeta, "exit");
        };
        window.addEventListener("beforeunload", saveOnExit);
        return () => {
            saveOnExit();
            window.removeEventListener("beforeunload", saveOnExit);
        };
    }, [saveLastLoadedEntry, showLaunchPanel]);

    const launchIntoEditor = (
        bounds?: { minX: number; minY: number; maxX: number; maxY: number },
        mode?: "region" | "sandbox",
    ): void => {
        if (!pluginHost) {
            return;
        }
        setErrorMessage(undefined);
        pluginHost.setSandboxModeActive(mode === "sandbox");
        if (mode !== "sandbox") {
            pluginHost.setSandboxBounds(undefined);
        }
        setIsEnteringEditor(true);
        setIsSandboxPostProcessing(false);
        setLaunchMode(mode ?? null);
        setEnteringDisplayProgress(10);
        setEnteringLoadedRegions(0);
        setEnteringBounds(bounds);
        if (bounds) {
            setEnteringTotalRegions((bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1));
        } else {
            setEnteringTotalRegions(0);
        }
    };

    const launchRegionIntoEditor = (mode: "region" | "sandbox" = activeMode): void => {
        if (!mapEditor || !pluginHost || (mode === "region" && !canOpenRegion)) {
            return;
        }

        const launchWithRadius = (radius: number, mode: "region" | "sandbox"): void => {
            const resolvedTarget = (() => {
                if (mode === "sandbox") {
                    return { mapX: 10353 >> 8, mapY: 10353 & 0xff };
                }
                if (isRegionIdValid) {
                    const regionId = Number.parseInt(targetRegion.trim(), 10);
                    return { mapX: regionId >> 8, mapY: regionId & 0xff };
                }
                if (isRegionCoordsValid) {
                    return {
                        mapX: Number.parseInt(targetRegionX.trim(), 10),
                        mapY: Number.parseInt(targetRegionY.trim(), 10),
                    };
                }
                return undefined;
            })();
            if (!resolvedTarget || Number.isNaN(resolvedTarget.mapX) || Number.isNaN(resolvedTarget.mapY)) {
                return;
            }

            const safeMapX = Math.max(0, Math.min(99, resolvedTarget.mapX));
            const safeMapY = Math.max(0, Math.min(199, resolvedTarget.mapY));
            const safeRadius = Math.max(0, Math.floor(radius));
            const regionId = safeMapX * 256 + safeMapY;
            const bounds = {
                minX: Math.max(0, safeMapX - safeRadius),
                maxX: Math.min(99, safeMapX + safeRadius),
                minY: Math.max(0, safeMapY - safeRadius),
                maxY: Math.min(199, safeMapY + safeRadius),
            };

            mapEditor.configureRegionFocus(safeMapX, safeMapY, safeRadius);
            for (let x = bounds.minX; x <= bounds.maxX; x++) {
                for (let y = bounds.minY; y <= bounds.maxY; y++) {
                    mapEditor.renderer.mapManager.loadMap(x, y);
                }
            }
            if (mode === "sandbox") {
                pluginHost.setSandboxModeActive(true);
                pluginHost.setSandboxBounds(bounds);
                setSandboxSweepBounds(bounds);
            } else {
                pluginHost.setSandboxModeActive(false);
                pluginHost.setSandboxBounds(undefined);
                setSandboxSweepBounds(undefined);
            }
            const nextLaunchMeta = {
                mode,
                mapX: safeMapX,
                mapY: safeMapY,
                regionId,
                radius: safeRadius,
            };
            launchMetaRef.current = nextLaunchMeta;
            setLastLaunchMeta(nextLaunchMeta);
            // Persist immediately so rapid tab switches cannot miss Last Loaded.
            saveLastLoadedEntry(nextLaunchMeta, "enter");
            launchIntoEditor(bounds, mode);
        };

        launchWithRadius(mode === "sandbox" ? sandboxRegionRadius : regionRadius, mode);
    };

    useEffect(() => {
        if (!isEnteringEditor || !pluginHost) {
            return;
        }

        let raf = 0;
        let done = false;
        const startedAt = performance.now();

        const checkReady = () => {
            if (done) {
                return;
            }

            const elapsed = performance.now() - startedAt;
            let loaded = 0;
            let total = enteringTotalRegions;

            if (enteringBounds) {
                for (let x = enteringBounds.minX; x <= enteringBounds.maxX; x++) {
                    for (let y = enteringBounds.minY; y <= enteringBounds.maxY; y++) {
                        const mapId = x * 256 + y;
                        if (pluginHost.mapManager.mapSquares.has(mapId)) {
                            loaded += 1;
                        }
                    }
                }
            } else {
                loaded = pluginHost.mapManager.mapSquares.size;
                total = Math.max(1, loaded);
            }

            const smoothProgress = Math.min(92, 10 + Math.round(elapsed / 28));
            const realProgress =
                total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : smoothProgress;
            const nextProgress = Math.max(smoothProgress, realProgress);
            const safeProgress = Number.isFinite(nextProgress) ? nextProgress : 0;
            const displayedLoaded =
                total > 0
                    ? Math.min(total, Math.max(0, Math.round((safeProgress / 100) * total)))
                    : loaded;
            setEnteringLoadedRegions(displayedLoaded);
            if (!enteringBounds) {
                setEnteringTotalRegions(total);
            }
            setEnteringDisplayProgress((prev) => Math.max(prev, safeProgress));

            const hasUsableRegion = loaded > 0;
            const sandboxTimeout = launchMode === "sandbox" && elapsed > 12000;

            if (
                (launchMode === "sandbox" &&
                    ((enteringTotalRegions > 0 && loaded >= enteringTotalRegions) || sandboxTimeout)) ||
                (launchMode !== "sandbox" && ((hasUsableRegion && elapsed > 650) || elapsed > 4500))
            ) {
                done = true;
                setEnteringDisplayProgress(100);
                setIsEnteringEditor(false);
                if (launchMode === "sandbox") {
                    setIsSandboxPostProcessing(true);
                } else {
                    setLaunchMode(null);
                    const launchMeta = launchMetaRef.current ?? lastLaunchMeta;
                    if (launchMeta) {
                        saveLastLoadedEntry(launchMeta, "enter");
                    }
                    setShowLaunchPanel(false);
                }
                return;
            }
            raf = requestAnimationFrame(checkReady);
        };

        raf = requestAnimationFrame(checkReady);
        return () => {
            done = true;
            if (raf) {
                cancelAnimationFrame(raf);
            }
        };
    }, [
        enteringBounds,
        enteringTotalRegions,
        isEnteringEditor,
        launchMode,
        lastLaunchMeta,
        pluginHost,
        saveLastLoadedEntry,
    ]);

    useEffect(() => {
        if (!isSandboxPostProcessing || !mapEditor || !enteringBounds || !pluginHost) {
            return;
        }

        let cancelled = false;
        const timeout = window.setTimeout(() => {
            if (cancelled) {
                return;
            }

            mapEditor.applyFlatHeightInBounds(
                enteringBounds.minX,
                enteringBounds.minY,
                enteringBounds.maxX,
                enteringBounds.maxY,
                0,
                {
                    noiseEnabled: pluginHost.sandboxTerrainSettings.preset !== "flat",
                    terrainPreset: pluginHost.sandboxTerrainSettings.preset,
                    landform: pluginHost.sandboxTerrainSettings.landform,
                    noiseSeed: parseSandboxSeed(pluginHost.sandboxTerrainSettings.seed),
                    noiseAmplitude: pluginHost.sandboxTerrainSettings.amplitude,
                    noiseScale: pluginHost.sandboxTerrainSettings.scale,
                    roughness: pluginHost.sandboxTerrainSettings.roughness,
                    cliffiness: pluginHost.sandboxTerrainSettings.cliffiness,
                    valleyDepth: pluginHost.sandboxTerrainSettings.valleyDepth,
                    waterLevel: pluginHost.sandboxTerrainSettings.waterLevel,
                    waterDepth: pluginHost.sandboxTerrainSettings.waterDepth,
                    beachWidth: pluginHost.sandboxTerrainSettings.beachWidth,
                    inlandness: pluginHost.sandboxTerrainSettings.inlandness,
                },
            );

            if (cancelled) {
                return;
            }
            setIsSandboxPostProcessing(false);
            setLaunchMode(null);
            const launchMeta = launchMetaRef.current ?? lastLaunchMeta;
            if (launchMeta) {
                saveLastLoadedEntry(launchMeta, "enter");
            }
            setShowLaunchPanel(false);
        }, 50);

        return () => {
            cancelled = true;
            clearTimeout(timeout);
        };
    }, [
        enteringBounds,
        isSandboxPostProcessing,
        lastLaunchMeta,
        mapEditor,
        pluginHost,
        saveLastLoadedEntry,
    ]);

    useEffect(() => {
        if (!sandboxSweepBounds || showLaunchPanel || !mapEditor || !pluginHost) {
            return;
        }
        let cancelled = false;
        let runs = 0;
        const runSweep = () => {
            if (cancelled) {
                return;
            }
            mapEditor.applyFlatHeightInBounds(
                sandboxSweepBounds.minX,
                sandboxSweepBounds.minY,
                sandboxSweepBounds.maxX,
                sandboxSweepBounds.maxY,
                0,
                {
                    noiseEnabled: pluginHost.sandboxTerrainSettings.preset !== "flat",
                    terrainPreset: pluginHost.sandboxTerrainSettings.preset,
                    landform: pluginHost.sandboxTerrainSettings.landform,
                    noiseSeed: parseSandboxSeed(pluginHost.sandboxTerrainSettings.seed),
                    noiseAmplitude: pluginHost.sandboxTerrainSettings.amplitude,
                    noiseScale: pluginHost.sandboxTerrainSettings.scale,
                    roughness: pluginHost.sandboxTerrainSettings.roughness,
                    cliffiness: pluginHost.sandboxTerrainSettings.cliffiness,
                    valleyDepth: pluginHost.sandboxTerrainSettings.valleyDepth,
                    waterLevel: pluginHost.sandboxTerrainSettings.waterLevel,
                    waterDepth: pluginHost.sandboxTerrainSettings.waterDepth,
                    beachWidth: pluginHost.sandboxTerrainSettings.beachWidth,
                    inlandness: pluginHost.sandboxTerrainSettings.inlandness,
                },
            );
            runs += 1;
            if (runs >= 8) {
                setSandboxSweepBounds(undefined);
                return;
            }
            window.setTimeout(runSweep, 300);
        };
        runSweep();
        return () => {
            cancelled = true;
        };
    }, [
        mapEditor,
        pluginHost,
        sandboxSweepBounds,
        showLaunchPanel,
    ]);

    const onWorldMapClicked = (x: number, y: number): void => {
        const mapX = Math.max(0, Math.floor(x / 64));
        const mapY = Math.max(0, Math.floor(y / 64));
        const regionId = mapX * 256 + mapY;
        setTargetRegion(regionId.toString());
        setTargetRegionX("");
        setTargetRegionY("");
        setActiveMode("region");
        setWorldMapOpen(false);
    };

    const renderStartCard = (
        mode: "region" | "sandbox",
        title: string,
        ariaLabel: string,
    ): JSX.Element => (
        <section
            className={cn(
                "relative rounded-lg border border-border bg-background/50 p-4 transition-all",
                activeMode === mode ? "border-primary/60 shadow-sm" : "cursor-pointer",
            )}
            onClick={() => setActiveMode(mode)}
            aria-label={ariaLabel}
        >
            <div
                className={cn(
                    "transition-all",
                    activeMode === mode
                        ? "opacity-100 blur-0"
                        : "opacity-55 blur-[1px] hover:opacity-75 hover:blur-0",
                )}
            >
                <div className="mb-4 flex items-center gap-2">
                    <div className="rounded-md bg-primary/15 p-2 text-primary">
                        <MapPinned className="size-4" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold">{title}</h2>
                        <p className="text-xs text-muted-foreground">
                            Jump directly to a target region, or open world map.
                        </p>
                    </div>
                </div>
                {mode === "sandbox" ? null : (
                    <>
                        <label className="mb-2 block text-xs font-medium text-muted-foreground">
                            Target region ID
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. 12850"
                            value={targetRegion}
                            onChange={(event) => setTargetRegion(event.target.value)}
                            disabled={activeMode !== mode || hasAnyCoordInput}
                            className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        />
                        <label className="mb-2 block text-xs font-medium text-muted-foreground">
                            Or target coordinates (X, Y)
                        </label>
                        <div className="mb-3 grid grid-cols-2 gap-2">
                            <input
                                type="number"
                                min={0}
                                placeholder="X"
                                value={targetRegionX}
                                onChange={(event) => setTargetRegionX(event.target.value)}
                                disabled={activeMode !== mode || hasRegionIdInput}
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                            />
                            <input
                                type="number"
                                min={0}
                                placeholder="Y"
                                value={targetRegionY}
                                onChange={(event) => setTargetRegionY(event.target.value)}
                                disabled={activeMode !== mode || hasRegionIdInput}
                                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                            />
                        </div>
                    </>
                )}
                <label className="mb-2 block text-xs font-medium text-muted-foreground">
                    Regions around target
                </label>
                <input
                    type="number"
                    min={0}
                    max={3}
                    value={mode === "sandbox" ? sandboxRegionRadius : regionRadius}
                    onChange={(event) => {
                        const next = Math.min(3, Math.max(0, Number(event.target.value) || 0));
                        if (mode === "sandbox") {
                            setSandboxRegionRadius(next);
                        } else {
                            setRegionRadius(next);
                        }
                    }}
                    disabled={activeMode !== mode}
                    className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                {mode === "sandbox" ? (
                    <div className="mb-3 rounded-md border border-border/70 bg-background/60 p-3">
                        <div className="mt-2">
                            <p className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                Region area preview
                            </p>
                            <div
                                className="mx-auto mt-1 grid w-fit justify-center gap-1"
                                style={{
                                        gridTemplateColumns: `repeat(${sandboxPreviewCells.columns}, ${sandboxRegionPreviewTileSize}px)`,
                                }}
                            >
                                    {Array.from({ length: sandboxPreviewCells.cellCount }).map((_, index) => (
                                    <div
                                        key={index}
                                        className="rounded-[3px] bg-primary/70"
                                        style={{
                                            width: sandboxRegionPreviewTileSize,
                                            height: sandboxRegionPreviewTileSize,
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}
                {mode !== "sandbox" ? (
                <div className="mb-3">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Region area preview
                    </p>
                    <div
                        className="mx-auto grid w-fit justify-center gap-1"
                        style={{
                            gridTemplateColumns: `repeat(${regionPreviewCells.columns}, ${regionPreviewCells.tileSize}px)`,
                        }}
                    >
                        {Array.from({ length: regionPreviewCells.cellCount }).map((_, index) => (
                            <div
                                key={index}
                                className="rounded-[3px] bg-primary/70"
                                style={{
                                    width: regionPreviewCells.tileSize,
                                    height: regionPreviewCells.tileSize,
                                }}
                            />
                        ))}
                    </div>
                    {regionPreviewCells.safeCount > regionPreviewCells.cellCount ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                            Radius {regionPreviewCells.safeRadius} = {regionPreviewCells.safeCount}{" "}
                            regions (showing first {regionPreviewCells.cellCount}).
                        </p>
                    ) : (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                            Radius {regionPreviewCells.safeRadius} = {regionPreviewCells.safeCount}{" "}
                            regions in {regionPreviewCells.rows} rows.
                        </p>
                    )}
                </div>
                ) : null}
                <div className="flex gap-2">
                    <button
                        type="button"
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
                        onClick={() => launchRegionIntoEditor(mode)}
                        disabled={activeMode !== mode || (mode === "region" && !canOpenRegion)}
                    >
                        <Layers3 className="size-4" />
                        {mode === "sandbox" ? "Generate" : "Open Region"}
                    </button>
                    {mode === "region" ? (
                        <button
                            type="button"
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
                            onClick={() => setWorldMapOpen(true)}
                            disabled={activeMode !== mode}
                        >
                            <Globe className="size-4" />
                            World Map
                        </button>
                    ) : null}
                </div>
                <div className="mt-3 rounded-md border border-border/70 bg-background/60 p-2">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                            {isEnteringEditor && launchMode === mode
                                ? mode === "sandbox"
                                    ? "Preparing sandbox..."
                                    : "Preparing region..."
                                : "Ready"}
                        </span>
                        <span>
                            {isEnteringEditor && launchMode === mode
                                ? `${enteringDisplayProgress}%`
                                : "Idle"}
                        </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className={cn(
                                "h-full rounded-full bg-primary transition-all duration-300",
                                isEnteringEditor && launchMode === mode ? "animate-pulse" : "",
                            )}
                            style={{
                                width:
                                    isEnteringEditor && launchMode === mode
                                        ? `${Math.max(6, enteringDisplayProgress)}%`
                                        : "0%",
                            }}
                        />
                    </div>
                    {isEnteringEditor && launchMode === mode && enteringTotalRegions > 0 ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            Loaded ~{enteringLoadedRegions} / {enteringTotalRegions} regions
                        </p>
                    ) : null}
                </div>
            </div>
            {activeMode !== mode ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full border border-border bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow-sm">
                        Click to activate
                    </span>
                </div>
            ) : null}
        </section>
    );

    let content: JSX.Element | undefined;
    if (showLaunchPanel && !pluginHost && !errorMessage) {
        content = (
            <div className="center-container max-height">
                <OsrsLoadingBar
                    text={`${loadingLabel} - ${Math.max(0, Math.min(100, loadingProgress))}%`}
                    progress={Math.max(0, Math.min(100, loadingProgress))}
                />
            </div>
        );
    } else if (showLaunchPanel) {
        content = (
            <div className="flex h-full min-h-0 w-full items-center justify-center p-6">
                <div className="relative w-full max-w-4xl rounded-xl border border-border bg-card p-6 shadow-sm">
                    {mapEditor ? (
                        <WorldMapModal
                            isOpen={isWorldMapOpen}
                            onRequestClose={() => setWorldMapOpen(false)}
                            onDoubleClick={onWorldMapClicked}
                            onRegionSelect={(_mapX: number, _mapY: number, regionId: number) => {
                                setTargetRegion(regionId.toString());
                                setTargetRegionX("");
                                setTargetRegionY("");
                                setActiveMode("region");
                            }}
                            getPosition={() => ({
                                x: mapEditor.camera.getPosX(),
                                y: mapEditor.camera.getPosZ(),
                            })}
                            loadMapImageUrl={(mapX: number, mapY: number) =>
                                mapEditor.getMinimapImageUrl(mapX, mapY)
                            }
                        />
                    ) : null}
                    <div className="mb-5 flex items-start justify-between gap-3">
                        <div>
                            <h1 className="text-xl font-semibold tracking-tight">Map Editor Setup</h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Choose a start mode before loading the editor. UI only for now.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs"
                            onClick={() => navigate("/map")}
                        >
                            Back
                        </button>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                        <div className="grid gap-4 md:grid-cols-2">
                            {renderStartCard("region", "Region / World Start", "Activate region mode")}
                            {renderStartCard("sandbox", "Sandbox Mode", "Activate sandbox mode")}
                        </div>
                        <aside className="rounded-lg border border-border bg-background/60 p-3">
                            <section className="mb-4 rounded-md border border-border bg-card p-2.5">
                                <h3 className="text-sm font-semibold">Load From File</h3>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    Import a saved map file directly.
                                </p>
                                <input
                                    type="file"
                                    className="mt-2 block w-full text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-xs"
                                    onChange={(event) =>
                                        setSelectedLoadFileName(
                                            event.target.files?.[0]?.name ?? "",
                                        )
                                    }
                                />
                                <div className="mt-2 flex items-center justify-between gap-2">
                                    <span className="truncate text-xs text-muted-foreground">
                                        {selectedLoadFileName || "No file selected"}
                                    </span>
                                    <button
                                        type="button"
                                        className="inline-flex items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                                        disabled={!selectedLoadFileName}
                                        onClick={() => launchIntoEditor()}
                                    >
                                        <Play className="size-3.5" />
                                        Load File
                                    </button>
                                </div>
                            </section>
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-sm font-semibold">Last Loaded</h3>
                                <span className="text-xs text-muted-foreground">
                                    {lastLoadedMaps.length} total
                                </span>
                            </div>
                            <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
                                {lastLoadedMaps.map((save) => (
                                    <div
                                        key={save.id}
                                        className="rounded-md border border-border bg-card p-2"
                                    >
                                        <div className="flex items-start gap-2">
                                            <img
                                                src={
                                                    mapEditor?.getMinimapImageUrl(save.mapX, save.mapY) ??
                                                    (save.imageUrl ||
                                                        fallbackPreviewDataUrl(`R${save.regionId}`))
                                                }
                                                alt={`${save.name} preview 64 by 64`}
                                                width={64}
                                                height={64}
                                                className="h-16 w-16 rounded-md border border-border object-cover"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium">{save.name}</p>
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    {save.date}
                                                </p>
                                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                                    Region {save.regionId} | Radius {save.radius}
                                                </p>
                                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                                    Cache: {save.cacheProfileName}
                                                </p>
                                                <button
                                                    type="button"
                                                    className="mt-2 inline-flex items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
                                                    onClick={() => {
                                                        setActiveMode(save.mode);
                                                        if (save.mode === "region") {
                                                            setTargetRegion(save.regionId.toString());
                                                            setRegionRadius(save.radius);
                                                        } else {
                                                            setSandboxRegionRadius(save.radius);
                                                        }
                                                        setTargetRegionX("");
                                                        setTargetRegionY("");
                                                        const bounds = {
                                                            minX: Math.max(0, save.mapX - save.radius),
                                                            maxX: Math.min(99, save.mapX + save.radius),
                                                            minY: Math.max(0, save.mapY - save.radius),
                                                            maxY: Math.min(199, save.mapY + save.radius),
                                                        };
                                                        mapEditor?.configureRegionFocus(
                                                            save.mapX,
                                                            save.mapY,
                                                            save.radius,
                                                        );
                                                        for (let x = bounds.minX; x <= bounds.maxX; x++) {
                                                            for (let y = bounds.minY; y <= bounds.maxY; y++) {
                                                                mapEditor?.renderer.mapManager.loadMap(x, y);
                                                            }
                                                        }
                                                        if (save.mode === "sandbox") {
                                                            pluginHost?.setSandboxModeActive(true);
                                                            pluginHost?.setSandboxBounds(bounds);
                                                            setSandboxSweepBounds(bounds);
                                                        } else {
                                                            pluginHost?.setSandboxModeActive(false);
                                                            pluginHost?.setSandboxBounds(undefined);
                                                            setSandboxSweepBounds(undefined);
                                                        }
                                                        const nextLaunchMeta = {
                                                            mode: save.mode,
                                                            mapX: save.mapX,
                                                            mapY: save.mapY,
                                                            regionId: save.regionId,
                                                            radius: save.radius,
                                                        };
                                                        launchMetaRef.current = nextLaunchMeta;
                                                        setLastLaunchMeta(nextLaunchMeta);
                                                        launchIntoEditor(bounds, save.mode);
                                                    }}
                                                >
                                                    <Play className="size-3.5" />
                                                    Load
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {lastLoadedMaps.length === 0 ? (
                                    <p className="rounded-md border border-dashed border-border px-2 py-3 text-xs text-muted-foreground">
                                        No last loaded entries yet for this cache profile.
                                    </p>
                                ) : null}
                            </div>
                        </aside>
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground">
                        Values are staged in UI only for now: target region ({targetRegion || "none"}),
                        radius ({regionRadius}).
                    </p>
                    {isSandboxPostProcessing ? (
                        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-background/85 backdrop-blur-[1px]">
                            <div className="h-[50vh] w-[50vw] min-h-[240px] min-w-[340px] rounded-lg border border-border bg-card p-6 shadow-md">
                                <p className="text-sm font-semibold">Processing Sandbox Terrain</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Flattening all loaded tile heights to 0...
                                </p>
                                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                    <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        );
    } else if (errorMessage) {
        content = <div className="center-container max-height content-text">{errorMessage}</div>;
    } else if (pluginHost) {
        content = <MapEditorContainer pluginHost={pluginHost} />;
    } else {
        content = (
            <div className="center-container max-height">
                <OsrsLoadingBar
                    text={`${loadingLabel} - ${Math.max(0, Math.min(100, loadingProgress))}%`}
                    progress={Math.max(0, Math.min(100, loadingProgress))}
                />
            </div>
        );
    }

    return (
        <div className="App max-height flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {content}
        </div>
    );
}
