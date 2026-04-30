import type { LoadedCache } from "../mapviewer/Caches";

type RuntimeCacheState = {
  profileId: string;
  cache: LoadedCache;
};

let runtimeCacheState: RuntimeCacheState | null = null;

export function setRuntimeLoadedCache(profileId: string, cache: LoadedCache): void {
  runtimeCacheState = { profileId, cache };
}

export function getRuntimeLoadedCache(profileId: string): LoadedCache | null {
  if (!runtimeCacheState) return null;
  if (runtimeCacheState.profileId !== profileId) return null;
  return runtimeCacheState.cache;
}

export function clearRuntimeLoadedCache(): void {
  runtimeCacheState = null;
}
