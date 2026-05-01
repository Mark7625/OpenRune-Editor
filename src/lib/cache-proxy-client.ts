import type { CacheType } from "@/lib/cache-types";

const CACHE_TYPE_COOKIE = "cache-type";

/** Header value for `fetch` calls to `/api/cache-proxy/*`. */
export function cacheProxyHeaders(cacheType: Pick<CacheType, "ip" | "port">) {
  return {
    "x-cache-type": JSON.stringify({ ip: cacheType.ip, port: cacheType.port }),
  };
}

/** Keeps `document.cookie` in sync so `<img src="/api/cache-proxy/...">` can reach the right cache server. */
export function syncCacheTypeCookie(cacheType: Pick<CacheType, "ip" | "port">) {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify({ ip: cacheType.ip, port: cacheType.port }));
  document.cookie = `${CACHE_TYPE_COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}

export function diffRevisionsUrl() {
  return "/api/cache-proxy/diff/revisions";
}

export function diffSupportManifestUrl(rev: number) {
  return `/api/cache-proxy/diff/support/manifest?rev=${rev}`;
}

/**
 * Normalize cache-server diff revisions JSON to sorted unique numeric revisions.
 * Accepts a raw number array, common object shapes, or `revisionOptions` string lists.
 */
export function parseDiffRevisionsResponse(data: unknown): number[] {
  const collectNumbers = (arr: unknown[]): number[] => {
    const out: number[] = [];
    for (const x of arr) {
      if (typeof x === "number" && Number.isFinite(x)) {
        out.push(Math.trunc(x));
        continue;
      }
      if (typeof x === "string") {
        const n = Number.parseInt(x, 10);
        if (Number.isFinite(n)) out.push(n);
      }
    }
    return out;
  };

  const dedupeSort = (nums: number[]) => [...new Set(nums)].sort((a, b) => a - b);

  if (Array.isArray(data)) {
    return dedupeSort(collectNumbers(data));
  }

  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["revisions", "revisionIds", "ids"] as const) {
      const raw = o[key];
      if (Array.isArray(raw)) return dedupeSort(collectNumbers(raw));
    }
    const revisionOptions = o.revisionOptions;
    if (Array.isArray(revisionOptions)) {
      const fromStrings = revisionOptions
        .filter((x): x is string => typeof x === "string")
        .map((s) => {
          const m = /\d+/.exec(s);
          return m ? Number.parseInt(m[0], 10) : NaN;
        })
        .filter((n) => Number.isFinite(n));
      if (fromStrings.length > 0) return dedupeSort(fromStrings);
    }
  }

  return [];
}

/** `GET sprites` on the selected cache server (via Next cache-proxy). */
export function spritesProxyUrl(params: {
  id: string | number;
  width?: number;
  height?: number;
  keepAspectRatio?: boolean;
  base?: number;
  rev?: number;
  indexed?: number;
}) {
  const search = new URLSearchParams({ id: String(params.id) });
  if (params.width != null) search.set("width", String(params.width));
  if (params.height != null) search.set("height", String(params.height));
  if (params.keepAspectRatio != null) search.set("keepAspectRatio", String(params.keepAspectRatio));
  if (params.base != null) search.set("base", String(params.base));
  if (params.rev != null) search.set("rev", String(params.rev));
  if (params.indexed != null) search.set("indexed", String(params.indexed));
  return `/api/cache-proxy/sprites?${search.toString()}`;
}

export function combinedSpritesUrl(rev: number, base = 1) {
  return `/api/cache-proxy/diff/combined/sprites?base=${base}&rev=${rev}`;
}

/** `GET /api/cache-proxy/cache?type=textures&rev=N` — returns full texture definitions map. */
export function cacheTexturesSnapshotUrl(rev: number): string {
  return `/api/cache-proxy/cache?${new URLSearchParams({ type: "textures", rev: String(rev) }).toString()}`;
}

/** `GET textures` on the selected cache server (via Next cache-proxy). */
export function texturesProxyUrl(params: {
  id: string | number;
  width?: number;
  height?: number;
  keepAspectRatio?: boolean;
  base?: number;
  rev?: number;
}) {
  const search = new URLSearchParams({ id: String(params.id) });
  if (params.width != null) search.set("width", String(params.width));
  if (params.height != null) search.set("height", String(params.height));
  if (params.keepAspectRatio != null) search.set("keepAspectRatio", String(params.keepAspectRatio));
  if (params.base != null) search.set("base", String(params.base));
  if (params.rev != null) search.set("rev", String(params.rev));
  return `/api/cache-proxy/textures?${search.toString()}`;
}

/**
 * Diff cache routes expect `base` ≤ `rev` (older build → newer). The workbench may show Base as the
 * latest build and Compare as an older build — normalize before calling `/api/cache-proxy/diff/...`.
 */
export function diffCacheOrderedPair(uiBase: number, uiCompare: number): { base: number; rev: number } {
  const lo = Math.min(uiBase, uiCompare);
  const hi = Math.max(uiBase, uiCompare);
  return { base: lo, rev: hi };
}

/** Sprite image for combined diff; backend resolves `source` revision when omitted. */
export function diffSpriteResolveUrl(spriteId: number, params: { base: number; rev: number }) {
  const search = new URLSearchParams({
    base: String(params.base),
    rev: String(params.rev),
  });
  return `/api/cache-proxy/diff/sprite/${spriteId}?${search.toString()}`;
}

/** Normalize internal section names to the backend API type parameter. */
function normalizeConfigTypeForApi(configType: string): string {
  const normalized = configType.trim().toLowerCase();
  if (normalized === "spotanim") return "spotanims";
  if (normalized === "param") return "params";
  return configType;
}

export function diffConfigTableUrl(
  configType: string,
  params: { base: number; rev: number; offset: number; limit: number; q?: string; mode?: string },
) {
  const search = new URLSearchParams({
    base: String(params.base),
    rev: String(params.rev),
    offset: String(params.offset),
    limit: String(params.limit),
  });
  if (params.q != null && params.q !== "") search.set("q", params.q);
  if (params.mode != null && params.mode !== "") {
    search.set("mode", params.mode);
    search.set("queryType", params.mode);
  }
  return `/api/cache-proxy/diff/config/${encodeURIComponent(normalizeConfigTypeForApi(configType))}/table?${search.toString()}`;
}

export function diffConfigTableAllUrl(configType: string, params: { base: number; rev: number }) {
  const search = new URLSearchParams({
    base: String(params.base),
    rev: String(params.rev),
  });
  return `/api/cache-proxy/diff/config/${encodeURIComponent(normalizeConfigTypeForApi(configType))}/table-all?${search.toString()}`;
}

export function diffConfigContentUrl(configType: string, params: { base: number; rev: number }) {
  const search = new URLSearchParams({
    base: String(params.base),
    rev: String(params.rev),
  });
  return `/api/cache-proxy/diff/config/${encodeURIComponent(normalizeConfigTypeForApi(configType))}/content?${search.toString()}`;
}

export function diffConfigSchemaUrl(configType: string) {
  return `/api/cache-proxy/diff/config/${encodeURIComponent(normalizeConfigTypeForApi(configType))}/props`;
}

export function diffSpriteImageUrl(
  spriteId: number,
  params: { base: number; rev: number; source: number },
) {
  const search = new URLSearchParams({
    base: String(params.base),
    rev: String(params.rev),
    source: String(params.source),
  });
  return `/api/cache-proxy/diff/sprite/${spriteId}?${search.toString()}`;
}

export function diffDeltaSpritesUrl(params: { base: number; rev: number }) {
  return `/api/cache-proxy/diff/delta/sprites?base=${params.base}&rev=${params.rev}`;
}

export function diffDeltaSummaryUrl(params: { base: number; rev: number }) {
  return `/api/cache-proxy/diff/delta/summary?base=${params.base}&rev=${params.rev}`;
}

export function diffDeltaSpritesSummaryUrl(params: { base: number; rev: number }) {
  return `/api/cache-proxy/diff/delta/sprites/summary?base=${params.base}&rev=${params.rev}`;
}
