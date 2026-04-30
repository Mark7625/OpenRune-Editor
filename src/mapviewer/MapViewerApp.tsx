import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { registerSerializer } from "threads";
import WebFont from "webfontloader";

import { OsrsLoadingBar } from "../components/rs/loading/OsrsLoadingBar";
import { isIos } from "../util/DeviceUtil";
import { getActiveProfileIdAsync, loadLocalCacheProfilesAsync } from "../lib/local-cache-profiles";
import { resolveActiveProfileCache } from "../lib/resolve-active-profile-cache";
import { fetchCacheList } from "./Caches";
import { getMapRenderWorkerPool } from "./map-render-worker-pool";
import { MapViewer } from "./MapViewer";
import { MapViewerContainer } from "./MapViewerContainer";
import { getAvailableRenderers } from "./MapViewerRenderers";
import { fetchNpcSpawns, getNpcSpawnsUrl } from "./data/npc/NpcSpawn";
import { fetchObjSpawns } from "./data/obj/ObjSpawn";
import { renderDataLoaderSerializer } from "./worker/RenderDataLoader";

registerSerializer(renderDataLoaderSerializer);

WebFont.load({
    custom: {
        families: ["OSRS Bold", "OSRS Small"],
    },
});

const cachesPromise = fetchCacheList();

function MapViewerApp() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation();

    const [errorMessage, setErrorMessage] = useState<string>();
    const [loadingLabel, setLoadingLabel] = useState<string>("Loading selected cache...");
    const [loadingProgress, setLoadingProgress] = useState<number>(0);
    const [mapViewer, setMapViewer] = useState<MapViewer>();

    // Same as map editor: do not key the loader on `location.search` or camera URL sync remounts the viewer.
    useEffect(() => {
        const abortController = new AbortController();

        const isAbortError = (error: unknown): boolean =>
            error instanceof DOMException && error.name === "AbortError";

        const load = async () => {
            const objSpawnsPromise = fetchObjSpawns();
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
            setLoadingLabel(`Loading "${activeProfile.name}" cache...`);
            setLoadingProgress(30);

            const resolvedCache = await resolveActiveProfileCache(activeProfile);
            if (!resolvedCache) {
                const returnTo = `${location.pathname}${location.search}`;
                navigate(
                    `/cache-test?autoload=1&returnTo=${encodeURIComponent(returnTo)}`,
                    { replace: true },
                );
                return;
            }

            setLoadingLabel(`Using "${activeProfile.name}" cache...`);
            setLoadingProgress(45);

            let cache;
            let objSpawns;
            let npcSpawns;
            try {
                const cacheList = await cachesPromise.catch(() => undefined);
                const spawnCacheInfo = cacheList?.latest ?? resolvedCache.info;
                const cachePromise = Promise.resolve(resolvedCache).then((loaded) => {
                    setLoadingLabel("Loading world data...");
                    setLoadingProgress(70);
                    return loaded;
                });
                const objPromise = objSpawnsPromise.then((spawns) => {
                    setLoadingProgress((v) => Math.max(v, 78));
                    return spawns;
                });
                const npcPromise = fetchNpcSpawns(
                    getNpcSpawnsUrl(
                        spawnCacheInfo ?? {
                            name: "local",
                            game: "oldschool",
                            environment: "local",
                            revision: 0,
                            timestamp: "",
                            size: 0,
                        },
                    ),
                ).then((spawns) => {
                    setLoadingProgress((v) => Math.max(v, 86));
                    return spawns;
                });

                [cache, objSpawns, npcSpawns] = await Promise.all([cachePromise, objPromise, npcPromise]);
            } catch (error) {
                if (isAbortError(error) || abortController.signal.aborted) {
                    return;
                }
                setErrorMessage(
                    error instanceof Error
                        ? error.message
                        : "Failed to load selected cache. Import it in Cache Repository.",
                );
                throw error;
            }

            const mapImageCache = await caches.open("map-images");

            const availableRenderers = getAvailableRenderers();
            if (availableRenderers.length === 0) {
                setErrorMessage("No renderers available");
                return;
            }

            // Add some way to get preferred renderer
            const rendererType = availableRenderers[0];

            const mapViewer = new MapViewer(
                getMapRenderWorkerPool(),
                {
                    caches: [cache.info],
                    latest: cache.info,
                },
                objSpawns,
                npcSpawns,
                mapImageCache,
                rendererType,
                cache,
            );
            mapViewer.applySearchParams(searchParams);
            mapViewer.init();

            setLoadingLabel("Starting renderer...");
            setLoadingProgress(100);
            setMapViewer(mapViewer);
        };

        if (isIos) {
            setErrorMessage("iOS is not supported.");
        } else {
            load().catch((error) => {
                if (!isAbortError(error)) {
                    console.error(error);
                }
            });
        }

        return () => {
            if (!abortController.signal.aborted) {
                abortController.abort("component-unmount");
            }
        };
    }, [location.pathname, navigate]);

    let content: JSX.Element | undefined;
    if (errorMessage) {
        content = <div className="center-container max-height content-text">{errorMessage}</div>;
    } else if (mapViewer) {
        content = <MapViewerContainer mapViewer={mapViewer} />;
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

export default MapViewerApp;
