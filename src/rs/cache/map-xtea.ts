import type { CacheInfo } from "./CacheInfo";

/**
 * OSRS map XTEA packing/decryption is obsolete at this revision and above
 * (see OpenRune-FileStore `RemoveXteas.OBSOLETE_FROM_REVISION` / `PackMaps`).
 */
export const MAP_XTEA_OBSOLETE_FROM_REVISION = 237;

export type XteaMap = Map<number, number[]>;

export function cacheRequiresMapXteas(info: CacheInfo): boolean {
    return info.game === "oldschool" && info.revision < MAP_XTEA_OBSOLETE_FROM_REVISION;
}

type OpenRs2KeysJson = Record<string, number[]>;

type FileStoreXteaEntry = {
    mapsquare?: number;
    key?: number[];
};

/** Parse `keys.json` (OpenRS2 object) or `xteas.json` (FileStore array). */
export function parseXteaMapFromJsonText(text: string): XteaMap {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
        const map: XteaMap = new Map();
        for (const entry of parsed as FileStoreXteaEntry[]) {
            if (typeof entry?.mapsquare !== "number" || !Array.isArray(entry.key) || entry.key.length !== 4) {
                continue;
            }
            map.set(entry.mapsquare, entry.key);
        }
        return map;
    }
    if (parsed && typeof parsed === "object") {
        const data = parsed as OpenRs2KeysJson;
        return new Map(
            Object.keys(data).map((key) => {
                const regionId = parseInt(key, 10);
                return [regionId, data[key]!] as const;
            }),
        );
    }
    return new Map();
}

export function parseXteaMapFromCacheFiles(files: Map<string, ArrayBuffer>): XteaMap {
    const buffer = files.get("keys.json") ?? files.get("xteas.json");
    if (!buffer) {
        return new Map();
    }
    try {
        const text = new TextDecoder().decode(buffer);
        return parseXteaMapFromJsonText(text);
    } catch {
        return new Map();
    }
}
