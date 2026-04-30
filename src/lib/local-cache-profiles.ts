export type LocalCacheProfile = {
  id: string;
  name: string;
  revision: string;
  locationNotes: string;
  description?: string;
  iconDataUrl?: string;
  systemCachePath?: string;
  useSystemFolder?: boolean;
};

const LEGACY_PROFILES_KEY = "openrune-local-cache-profiles-v1";
const LEGACY_ACTIVE_KEY = "openrune-active-cache-profile-id-v1";
const DB_NAME = "openrune-cache-profiles-v2";
const DB_VERSION = 1;
const META_STORE = "meta";
const META_KEY = "profiles";
const ACTIVE_KEY = "activeProfileId";
const MIGRATED_KEY = "migratedFromLocalStorage";

function safeParse(json: string | null): LocalCacheProfile[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (x): x is LocalCacheProfile =>
          typeof x === "object" &&
          x !== null &&
          typeof (x as LocalCacheProfile).id === "string" &&
          typeof (x as LocalCacheProfile).name === "string",
      )
      .map((p) => ({
        ...p,
        revision: typeof p.revision === "string" ? p.revision : "",
        locationNotes: typeof p.locationNotes === "string" ? p.locationNotes : "",
        description: typeof p.description === "string" ? p.description : undefined,
        iconDataUrl: typeof p.iconDataUrl === "string" ? p.iconDataUrl : undefined,
        systemCachePath: typeof p.systemCachePath === "string" ? p.systemCachePath : undefined,
        useSystemFolder: p.useSystemFolder === true,
      }));
  } catch {
    return [];
  }
}

export function newProfileId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open profile DB"));
  });
}

function txGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const store = tx.objectStore(META_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error("IDB read failed"));
  });
}

function txPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    const store = tx.objectStore(META_STORE);
    store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB write aborted"));
  });
}

async function ensureMigratedFromLegacy(db: IDBDatabase): Promise<void> {
  const already = await txGet<boolean>(db, MIGRATED_KEY);
  if (already === true || typeof window === "undefined") return;

  const legacyProfiles = safeParse(localStorage.getItem(LEGACY_PROFILES_KEY));
  const legacyActive = localStorage.getItem(LEGACY_ACTIVE_KEY);
  if (legacyProfiles.length > 0) {
    await txPut(db, META_KEY, legacyProfiles);
  }
  if (legacyActive != null) {
    await txPut(db, ACTIVE_KEY, legacyActive);
  }
  await txPut(db, MIGRATED_KEY, true);
}

export async function loadLocalCacheProfilesAsync(): Promise<LocalCacheProfile[]> {
  if (typeof window === "undefined") return [];
  const db = await openDb();
  try {
    await ensureMigratedFromLegacy(db);
    const raw = await txGet<unknown>(db, META_KEY);
    const json = raw == null ? null : JSON.stringify(raw);
    return safeParse(json);
  } finally {
    db.close();
  }
}

export async function saveLocalCacheProfilesAsync(profiles: LocalCacheProfile[]): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDb();
  try {
    await ensureMigratedFromLegacy(db);
    await txPut(db, META_KEY, profiles);
  } finally {
    db.close();
  }
}

export async function getActiveProfileIdAsync(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const db = await openDb();
  try {
    await ensureMigratedFromLegacy(db);
    const v = await txGet<string>(db, ACTIVE_KEY);
    return typeof v === "string" ? v : null;
  } finally {
    db.close();
  }
}

export async function setActiveProfileIdAsync(id: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDb();
  try {
    await ensureMigratedFromLegacy(db);
    await txPut(db, ACTIVE_KEY, id);
  } finally {
    db.close();
  }
}
