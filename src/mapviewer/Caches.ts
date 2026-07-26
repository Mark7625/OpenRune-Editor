import { CacheFiles, ProgressListener } from "../rs/cache/CacheFiles";
import { CacheInfo, getLatestCache } from "../rs/cache/CacheInfo";
import { cacheRequiresMapXteas, parseXteaMapFromJsonText, type XteaMap } from "../rs/cache/map-xtea";
import { CacheType, detectCacheType } from "../rs/cache/CacheType";

const CACHE_PATH = "/caches/";

export async function fetchCacheInfos(): Promise<CacheInfo[]> {
    const resp = await fetch(CACHE_PATH + "caches.json");
    return resp.json();
}

export type CacheList = {
    caches: CacheInfo[];
    latest: CacheInfo;
};

export async function fetchCacheList(): Promise<CacheList | undefined> {
    const caches = await fetchCacheInfos();
    const latest = getLatestCache(caches);
    if (!latest) {
        return undefined;
    }
    return {
        caches,
        latest,
    };
}

export type { XteaMap } from "../rs/cache/map-xtea";

export type LoadedCache = {
    info: CacheInfo;
    type: CacheType;
    files: CacheFiles;
    xteas: XteaMap;
};

export async function loadCacheFiles(
    info: CacheInfo,
    signal?: AbortSignal,
    progressListener?: ProgressListener,
): Promise<LoadedCache> {
    const cachePath = CACHE_PATH + info.name + "/";

    const cacheType = detectCacheType(info);
    const files = await CacheFiles.fetchFiles(
        cacheType,
        cachePath,
        info.name,
        true,
        signal,
        progressListener,
    );

    const xteas = cacheRequiresMapXteas(info)
        ? await fetchMapXteas(cachePath, signal)
        : new Map<number, number[]>();

    return {
        info,
        type: cacheType,
        files,
        xteas,
    };
}

async function fetchMapXteas(cachePath: string, signal?: AbortSignal): Promise<XteaMap> {
    const keysUrl = cachePath + "keys.json";
    const fromKeys = await fetchXteasOptional(keysUrl, signal);
    if (fromKeys.size > 0) {
        return fromKeys;
    }
    return fetchXteasOptional(cachePath + "xteas.json", signal);
}

export async function fetchXteasOptional(url: RequestInfo, signal?: AbortSignal): Promise<XteaMap> {
    try {
        const resp = await fetch(url, { signal });
        if (!resp.ok) {
            return new Map();
        }
        const text = await resp.text();
        return parseXteaMapFromJsonText(text);
    } catch {
        return new Map();
    }
}

/** @deprecated Prefer {@link fetchXteasOptional} or revision-aware loading via {@link loadCacheFiles}. */
export async function fetchXteas(url: RequestInfo, signal?: AbortSignal): Promise<XteaMap> {
    const resp = await fetch(url, { signal });
    if (!resp.ok) {
        throw new Error(`Failed to load map keys: ${resp.status} ${resp.statusText}`);
    }
    const text = await resp.text();
    return parseXteaMapFromJsonText(text);
}
