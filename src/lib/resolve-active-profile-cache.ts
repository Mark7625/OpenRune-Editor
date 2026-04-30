import type { LoadedCache } from "../mapviewer/Caches";
import { clearRuntimeLoadedCache, getRuntimeLoadedCache, setRuntimeLoadedCache } from "./active-cache-runtime";
import type { LocalCacheProfile } from "./local-cache-profiles";
import { hasProfileCache, loadProfileCache } from "./profile-cache-store";

/**
 * Returns the cache for `profile`: warm runtime copy if present, otherwise loads from IndexedDB
 * (full page reload clears in-memory runtime only).
 */
export async function resolveActiveProfileCache(profile: LocalCacheProfile): Promise<LoadedCache | null> {
    const warm = getRuntimeLoadedCache(profile.id);
    if (warm) {
        return warm;
    }
    if (!(await hasProfileCache(profile.id))) {
        return null;
    }
    clearRuntimeLoadedCache();
    const loaded = await loadProfileCache(profile);
    setRuntimeLoadedCache(profile.id, loaded);
    return loaded;
}
