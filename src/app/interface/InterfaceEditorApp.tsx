import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OsrsLoadingBar } from "../../components/rs/loading/OsrsLoadingBar";
import { getActiveProfileIdAsync, loadLocalCacheProfilesAsync } from "../../lib/local-cache-profiles";
import { resolveActiveProfileCache } from "../../lib/resolve-active-profile-cache";
import { InterfaceViewer } from "./InterfaceViewer";
import { InterfaceViewerContainer } from "./InterfaceViewerContainer";



function InterfaceEditorApp(): JSX.Element {
    const navigate = useNavigate();
    const location = useLocation();

    const [errorMessage, setErrorMessage] = useState<string>();
    const [loadingLabel, setLoadingLabel] = useState<string>("Loading selected cache...");
    const [loadingProgress, setLoadingProgress] = useState<number>(0);
    const [mapViewer, setMapViewer] = useState<InterfaceViewer>();

    // Same as map editor: do not key the loader on `location.search` or camera URL sync remounts the viewer.
    useEffect(() => {
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
            setLoadingLabel(`Loading "${activeProfile.name}" cache...`);
            setLoadingProgress(30);

            const resolvedCache = await resolveActiveProfileCache(activeProfile);
            if (!resolvedCache) {
                const returnTo = `${location.pathname}${location.search}`;
                navigate(`/cache-test?autoload=1&returnTo=${encodeURIComponent(returnTo)}`, {
                    replace: true,
                });
                return;
            }

            setLoadingLabel(`Using "${activeProfile.name}" cache...`);
            setLoadingProgress(45);

            let cache;

            try {
                const cachePromise = Promise.resolve(resolvedCache).then((loaded) => {
                    setLoadingLabel("Loading world data...");
                    setLoadingProgress(70);
                    return loaded;
                });

                [cache] = await Promise.all([cachePromise]);
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

            const mapViewer = new InterfaceViewer(cache);

            setLoadingLabel("Starting renderer...");
            setLoadingProgress(100);
            setMapViewer(mapViewer);
        };

        load().catch((error) => {
            if (!isAbortError(error)) {
                console.error(error);
            }
        });

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
        content = <InterfaceViewerContainer viewer={mapViewer} />;
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

export default InterfaceEditorApp;
