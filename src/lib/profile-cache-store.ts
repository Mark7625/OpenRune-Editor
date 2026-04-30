import { CacheFiles } from "../rs/cache/CacheFiles";
import { detectCacheType } from "../rs/cache/CacheType";
import type { CacheInfo } from "../rs/cache/CacheInfo";
import type { LoadedCache, XteaMap } from "../mapviewer/Caches";
import type { LocalCacheProfile } from "./local-cache-profiles";

const DB_NAME = "openrune-cache-files-v1";
const DB_VERSION = 1;
const STORE = "profile-cache-files";

type StoredProfileCache = {
  files: Record<string, ArrayBuffer>;
  savedAt: string;
};

function profileKey(profileId: string): string {
  return `profile:${profileId}`;
}

async function getStoredProfileCache(
  db: IDBDatabase,
  profileId: string,
): Promise<StoredProfileCache | undefined> {
  // Read namespaced key first; fallback supports older saves.
  const namespaced = await txGet<StoredProfileCache>(db, profileKey(profileId));
  if (namespaced) {
    return namespaced;
  }
  return txGet<StoredProfileCache>(db, profileId);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open cache DB"));
  });
}

function txGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error("IDB read failed"));
  });
}

function txPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB write aborted"));
  });
}

function txDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB delete failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB delete aborted"));
  });
}

function normalizeName(file: File): string {
  const rel = file.webkitRelativePath || file.name;
  const parts = rel.split(/[\\/]/g);
  return parts[parts.length - 1];
}

function parseXteas(files: Map<string, ArrayBuffer>): XteaMap {
  const keysBuffer = files.get("keys.json");
  if (!keysBuffer) {
    return new Map();
  }
  try {
    const text = new TextDecoder().decode(keysBuffer);
    const data = JSON.parse(text) as Record<string, number[]>;
    return new Map(Object.keys(data).map((k) => [parseInt(k, 10), data[k]]));
  } catch {
    return new Map();
  }
}

function buildInfo(profile: LocalCacheProfile, files: Map<string, ArrayBuffer>): CacheInfo {
  const hasDat2 = files.has("main_file_cache.dat2");
  const parsedRevision = Number.parseInt(profile.revision, 10);
  const revision = Number.isFinite(parsedRevision) ? parsedRevision : hasDat2 ? 700 : 317;
  let size = 0;
  for (const buf of files.values()) {
    size += buf.byteLength;
  }
  return {
    name: profile.name || "local-cache",
    game: hasDat2 ? "oldschool" : "runescape",
    environment: "local",
    revision,
    timestamp: new Date().toISOString(),
    size,
  };
}

export async function saveProfileCacheFiles(profileId: string, files: FileList | File[]): Promise<void> {
  const fileArray = Array.from(files);
  const record: Record<string, ArrayBuffer> = {};
  for (const file of fileArray) {
    const key = normalizeName(file);
    record[key] = await file.arrayBuffer();
  }
  const db = await openDb();
  try {
    try {
      await txPut(db, profileKey(profileId), {
        files: record,
        savedAt: new Date().toISOString(),
      } satisfies StoredProfileCache);
      // Clean up legacy key if it exists.
      await txDelete(db, profileId);
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") {
        throw new Error(
          "Browser storage is full. Remove an imported cache or use a smaller cache before importing again.",
        );
      }
      throw error;
    }
  } finally {
    db.close();
  }
}

export async function hasProfileCache(profileId: string): Promise<boolean> {
  const db = await openDb();
  try {
    const stored = await getStoredProfileCache(db, profileId);
    return Boolean(stored && Object.keys(stored.files).length > 0);
  } finally {
    db.close();
  }
}

export async function deleteProfileCache(profileId: string): Promise<void> {
  const db = await openDb();
  try {
    await txDelete(db, profileKey(profileId));
    // Remove legacy key too.
    await txDelete(db, profileId);
  } finally {
    db.close();
  }
}

export async function loadProfileCache(profile: LocalCacheProfile): Promise<LoadedCache> {
  const db = await openDb();
  try {
    const stored = await getStoredProfileCache(db, profile.id);
    if (!stored || !stored.files) {
      throw new Error("No imported cache files found for selected profile");
    }

    const filesMap = new Map<string, ArrayBuffer>(Object.entries(stored.files));
    const info = buildInfo(profile, filesMap);
    const type = detectCacheType(info);
    const files = new CacheFiles(filesMap);
    const xteas = parseXteas(filesMap);

    return {
      info,
      type,
      files,
      xteas,
    };
  } finally {
    db.close();
  }
}
