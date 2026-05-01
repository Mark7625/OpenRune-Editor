import type { CacheType } from "@/lib/cache-types";

const CACHE_TYPE_COOKIE = "cache-type";

/** Header value for `fetch` calls to `/api/cache-proxy/*`. */
export function cacheProxyHeaders(cacheType: Pick<CacheType, "ip" | "port">) {
  return {
    "x-cache-type": JSON.stringify({ ip: cacheType.ip, port: cacheType.port }),
  };
}

/**
 * Keeps `document.cookie` in sync so requests (and e.g. `<img src="/api/cache-proxy/...">`) can reach
 * the right cache server via the Next proxy route.
 */
export function syncCacheTypeCookie(cacheType: Pick<CacheType, "ip" | "port">) {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify({ ip: cacheType.ip, port: cacheType.port }));
  document.cookie = `${CACHE_TYPE_COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}
