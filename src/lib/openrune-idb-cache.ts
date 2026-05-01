/**
 * IndexedDB-backed conditional GET (If-None-Match) for large diff/gameval JSON and sprite PNGs.
 * Cache hit/miss is logged on the OpenRune WebServer (see `openRuneCacheDebug` in DiffRoutes.kt).
 */

const DB_NAME = "openrune-cache-v1";
const DB_VERSION = 2;
const STORE_JSON = "json";
const STORE_BLOBS = "blobs";
const STORE_TABLE_SEARCH = "table-search";

export function stripEtagHeader(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().replace(/^W\//i, "").trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) return t.slice(1, -1);
  return t;
}

function formatIfNoneMatch(etag: string): string {
  if (etag.startsWith('"')) return etag;
  return `"${etag}"`;
}

function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/** Single shared connection; opening/closing per transaction was dominating sprite grids. */
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!idbAvailable()) {
    return Promise.reject(new Error("indexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error ?? new Error("indexedDB open failed"));
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_JSON)) db.createObjectStore(STORE_JSON);
        if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS);
        if (!db.objectStoreNames.contains(STORE_TABLE_SEARCH)) db.createObjectStore(STORE_TABLE_SEARCH);
      };
    });
  }
  return dbPromise;
}

async function idbJsonGet(key: string): Promise<{ etag: string; text: string } | undefined> {
  if (!idbAvailable()) return undefined;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_JSON, "readonly");
      const g = tx.objectStore(STORE_JSON).get(key);
      g.onsuccess = () => resolve(g.result as { etag: string; text: string } | undefined);
      g.onerror = () => reject(g.error);
    });
  } catch {
    return undefined;
  }
}

async function idbJsonPut(key: string, value: { etag: string; text: string }): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_JSON, "readwrite");
      const p = tx.objectStore(STORE_JSON).put(value, key);
      p.onsuccess = () => resolve();
      p.onerror = () => reject(p.error);
    });
  } catch {
    // ignore quota / private mode
  }
}

async function idbBlobGet(key: string): Promise<{ etag: string; buffer: ArrayBuffer } | undefined> {
  if (!idbAvailable()) return undefined;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BLOBS, "readonly");
      const g = tx.objectStore(STORE_BLOBS).get(key);
      g.onsuccess = () => resolve(g.result as { etag: string; buffer: ArrayBuffer } | undefined);
      g.onerror = () => reject(g.error);
    });
  } catch {
    return undefined;
  }
}

async function idbBlobPut(key: string, value: { etag: string; buffer: ArrayBuffer }): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BLOBS, "readwrite");
      const p = tx.objectStore(STORE_BLOBS).put(value, key);
      p.onsuccess = () => resolve();
      p.onerror = () => reject(p.error);
    });
  } catch {
    // ignore
  }
}

export type ConditionalJsonResult<T> = {
  data: T;
  fromIndexedDb: boolean;
  etag?: string;
  cacheDebug?: string;
};

/**
 * GET JSON with optional If-None-Match; on 304 rehydrates from IndexedDB.
 */
export async function conditionalJsonFetch<T = unknown>(
  cacheKey: string,
  url: string,
  init: RequestInit = {},
): Promise<ConditionalJsonResult<T>> {
  const existing = await idbJsonGet(cacheKey);
  const headers = new Headers((init.headers as HeadersInit | undefined) ?? {});
  if (existing?.etag) headers.set("If-None-Match", formatIfNoneMatch(existing.etag));

  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const cacheDebug = res.headers.get("x-openrune-cache-debug") ?? undefined;

  if (res.status === 304) {
    if (!existing?.text) {
      throw new Error(`304 Not Modified but no IndexedDB cache for key "${cacheKey}"`);
    }
    return { data: JSON.parse(existing.text) as T, fromIndexedDb: true, etag: existing.etag, cacheDebug };
  }

  if (!res.ok) {
    const errBody = await res.text();
    let message = `HTTP ${res.status}`;
    if (errBody) {
      try {
        const errJson = JSON.parse(errBody) as { message?: string; error?: string };
        message = errJson.message ?? errJson.error ?? errBody;
      } catch {
        message = errBody;
      }
    }
    throw new Error(message);
  }

  const text = await res.text();
  const etag = stripEtagHeader(res.headers.get("etag"));
  if (text.length > 0 && etag) {
    void idbJsonPut(cacheKey, { etag, text });
  }
  return { data: JSON.parse(text) as T, fromIndexedDb: false, etag, cacheDebug };
}

const tableSearchMemory = new Map<string, unknown>();

async function idbTableSearchGet<T>(key: string): Promise<T | undefined> {
  if (!idbAvailable()) return undefined;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TABLE_SEARCH, "readonly");
      const g = tx.objectStore(STORE_TABLE_SEARCH).get(key);
      g.onsuccess = () => resolve(g.result as T | undefined);
      g.onerror = () => reject(g.error);
    });
  } catch {
    return undefined;
  }
}

async function idbTableSearchPut<T>(key: string, value: T): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_TABLE_SEARCH, "readwrite");
      const p = tx.objectStore(STORE_TABLE_SEARCH).put(value, key);
      p.onsuccess = () => resolve();
      p.onerror = () => reject(p.error);
    });
  } catch {
    // ignore quota / private mode
  }
}

export async function getTableSearchIndex<T = unknown>(cacheKey: string): Promise<T | undefined> {
  if (tableSearchMemory.has(cacheKey)) {
    return tableSearchMemory.get(cacheKey) as T;
  }
  const value = await idbTableSearchGet<T>(cacheKey);
  if (value !== undefined) {
    tableSearchMemory.set(cacheKey, value);
  }
  return value;
}

export async function putTableSearchIndex<T = unknown>(cacheKey: string, value: T): Promise<void> {
  tableSearchMemory.set(cacheKey, value);
  await idbTableSearchPut(cacheKey, value);
}

export type ConditionalBlobFetchOptions = {
  /** After a local fast return, revalidate in the background; if the server sends 200, this runs with the new body. */
  onBackgroundBlob?: (blob: Blob) => void;
};

export type ConditionalBlobResult = {
  blob: Blob;
  fromIndexedDb: boolean;
  cacheDebug?: string;
};

/** In-RAM LRU for sprite bytes: skips IndexedDB on repeat keys in the same tab (lists, virtualization). */
const BLOB_MEM_MAX_BYTES = 48 * 1024 * 1024;
const BLOB_MEM_MAX_KEYS = 800;
let blobMemBytes = 0;
const blobMem = new Map<string, { etag: string; buffer: ArrayBuffer }>();

function blobMemoryGet(cacheKey: string): { etag: string; buffer: ArrayBuffer } | undefined {
  const v = blobMem.get(cacheKey);
  if (!v) return undefined;
  blobMem.delete(cacheKey);
  blobMem.set(cacheKey, v);
  return { etag: v.etag, buffer: v.buffer };
}

function blobMemoryTouch(cacheKey: string): void {
  const v = blobMem.get(cacheKey);
  if (!v) return;
  blobMem.delete(cacheKey);
  blobMem.set(cacheKey, v);
}

async function revalidateSpriteBlobInBackground(
  cacheKey: string,
  url: string,
  init: RequestInit,
  etag: string,
  onBackgroundBlob?: (blob: Blob) => void,
): Promise<void> {
  try {
    const headers = new Headers((init.headers as HeadersInit | undefined) ?? {});
    headers.set("If-None-Match", formatIfNoneMatch(etag));
    const res = await fetch(url, { ...init, headers, cache: "no-store" });
    if (res.status === 304 || !res.ok) return;
    const ab = await res.arrayBuffer();
    const newEtag = stripEtagHeader(res.headers.get("etag"));
    const mime = normalizeImageContentType(res.headers.get("content-type"));
    if (newEtag) {
      void idbBlobPut(cacheKey, { etag: newEtag, buffer: ab });
      blobMemorySet(cacheKey, newEtag, ab);
    }
    onBackgroundBlob?.(new Blob([ab], { type: mime }));
  } catch {
    // ignore network / parse errors for background pass
  }
}

function blobMemorySet(cacheKey: string, etag: string, buffer: ArrayBuffer): void {
  const bytes = buffer.byteLength;
  if (blobMem.has(cacheKey)) {
    const prev = blobMem.get(cacheKey)!;
    blobMemBytes -= prev.buffer.byteLength;
    blobMem.delete(cacheKey);
  }
  while (
    blobMem.size > 0 &&
    (blobMemBytes + bytes > BLOB_MEM_MAX_BYTES || blobMem.size >= BLOB_MEM_MAX_KEYS)
  ) {
    const oldest = blobMem.keys().next().value;
    if (oldest === undefined) break;
    const o = blobMem.get(oldest)!;
    blobMemBytes -= o.buffer.byteLength;
    blobMem.delete(oldest);
  }
  blobMem.set(cacheKey, { etag, buffer });
  blobMemBytes += bytes;
}

/**
 * GET binary (e.g. PNG). If bytes + etag already exist for `cacheKey` (RAM or IDB), returns them
 * immediately (sprite cache keys include rev/base). A follow-up conditional GET is scheduled on
 * the next microtask so the server can still push a new body (`onBackgroundBlob`) without blocking UI.
 * Otherwise: conditional GET with If-None-Match; on 304 rebuilds from IndexedDB.
 */
export async function conditionalBlobFetch(
  cacheKey: string,
  url: string,
  init: RequestInit = {},
  options?: ConditionalBlobFetchOptions,
): Promise<ConditionalBlobResult> {
  let existing = blobMemoryGet(cacheKey);
  if (!existing) {
    existing = await idbBlobGet(cacheKey);
    if (existing) blobMemorySet(cacheKey, existing.etag, existing.buffer);
  }

  const etagLocal = existing?.etag?.trim();
  if (existing?.buffer && existing.buffer.byteLength > 0 && etagLocal) {
    blobMemoryTouch(cacheKey);
    const onBg = options?.onBackgroundBlob;
    queueMicrotask(() => {
      void revalidateSpriteBlobInBackground(cacheKey, url, init, etagLocal, onBg);
    });
    return {
      blob: new Blob([existing.buffer], { type: "image/png" }),
      fromIndexedDb: true,
      cacheDebug: undefined,
    };
  }

  const headers = new Headers((init.headers as HeadersInit | undefined) ?? {});
  if (etagLocal) headers.set("If-None-Match", formatIfNoneMatch(etagLocal));

  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const cacheDebug = res.headers.get("x-openrune-cache-debug") ?? undefined;

  if (res.status === 304) {
    if (!existing?.buffer) {
      throw new Error(`304 Not Modified but no IndexedDB blob for key "${cacheKey}"`);
    }
    blobMemoryTouch(cacheKey);
    return {
      blob: new Blob([existing.buffer], { type: "image/png" }),
      fromIndexedDb: true,
      cacheDebug,
    };
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const ab = await res.arrayBuffer();
  const etag = stripEtagHeader(res.headers.get("etag"));
  /** Strip params (e.g. `; charset=utf-8`) — those break `Blob` + `readAsDataURL` for `<img>` in some browsers. */
  const mime = normalizeImageContentType(res.headers.get("content-type"));
  if (etag) {
    void idbBlobPut(cacheKey, { etag, buffer: ab });
    blobMemorySet(cacheKey, etag, ab);
  }
  return { blob: new Blob([ab], { type: mime }), fromIndexedDb: false, cacheDebug };
}

function normalizeImageContentType(raw: string | null): string {
  const base = raw?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base.startsWith("image/")) return base;
  return "image/png";
}
