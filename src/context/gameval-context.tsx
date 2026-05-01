"use client";

import * as React from "react";

import { useCacheType } from "@/context/cache-type-context";
import { conditionalJsonFetch } from "@/lib/openrune-idb-cache";

export const GAMEVAL_TYPE_MAP = {
  ITEMTYPES: "items",
  NPCTYPES: "npcs",
  INVTYPES: "inv",
  VARPTYPES: "varp",
  VARBITTYPES: "varbits",
  VARCSTYPES: "varcs",
  OBJTYPES: "objects",
  SEQTYPES: "sequences",
  SPOTTYPES: "spotanims",
  ROWTYPES: "dbrows",
  TABLETYPES: "dbtables",
  SOUNDTYPES: "jingles",
  SPRITETYPES: "sprites",
  IFTYPES: "interfaces",
} as const;

/**
 * Supports both known static gameval groups and server-provided dynamic groups.
 * Static constants are retained for existing call sites.
 */
export type GamevalType = string;
export const ITEMTYPES = GAMEVAL_TYPE_MAP.ITEMTYPES;
export const NPCTYPES = GAMEVAL_TYPE_MAP.NPCTYPES;
export const INVTYPES = GAMEVAL_TYPE_MAP.INVTYPES;
export const VARPTYPES = GAMEVAL_TYPE_MAP.VARPTYPES;
export const VARBITTYPES = GAMEVAL_TYPE_MAP.VARBITTYPES;
export const VARCSTYPES = GAMEVAL_TYPE_MAP.VARCSTYPES;
export const OBJTYPES = GAMEVAL_TYPE_MAP.OBJTYPES;
export const SEQTYPES = GAMEVAL_TYPE_MAP.SEQTYPES;
export const SPOTTYPES = GAMEVAL_TYPE_MAP.SPOTTYPES;
export const ROWTYPES = GAMEVAL_TYPE_MAP.ROWTYPES;
export const TABLETYPES = GAMEVAL_TYPE_MAP.TABLETYPES;
export const SOUNDTYPES = GAMEVAL_TYPE_MAP.SOUNDTYPES;
export const SPRITETYPES = GAMEVAL_TYPE_MAP.SPRITETYPES;
export const IFTYPES = GAMEVAL_TYPE_MAP.IFTYPES;

export type GamevalData = Record<string, number>;
export type GamevalExtraData = {
  searchable: string;
  text: string;
  sub: Record<number, string>;
};
export type GamevalExtrasById = Record<number, GamevalExtraData>;
export type GamevalEntry = {
  name: string;
  id: number;
  lowerName: string;
};

type GamevalContextType = {
  lookupGameval: (type: GamevalType, id: number, rev?: number | "latest") => string | undefined;
  lookupGamevalByName: (type: GamevalType, name: string, rev?: number | "latest") => number | undefined;
  getGamevalData: (type: GamevalType, rev?: number | "latest") => GamevalData | undefined;
  getGamevalExtras: (type: GamevalType, rev?: number | "latest") => GamevalExtrasById | undefined;
  getGamevalExtra: (type: GamevalType, id: number, rev?: number | "latest") => GamevalExtraData | undefined;
  getGamevalEntries: (type: GamevalType, rev?: number | "latest") => GamevalEntry[] | undefined;
  loadGamevalType: (type: GamevalType, rev?: number | "latest") => Promise<void>;
  isLoading: (type: GamevalType, rev?: number | "latest") => boolean;
  hasLoaded: (type: GamevalType, rev?: number | "latest") => boolean;
};

type ParsedPayload = {
  values: GamevalData;
  gameval: GamevalExtrasById;
};

const GamevalContext = React.createContext<GamevalContextType | null>(null);

function normalizeSub(input: unknown): Record<number, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<number, string> = {};
  for (const [rawId, value] of Object.entries(input as Record<string, unknown>)) {
    const id = Number.parseInt(rawId, 10);
    if (!Number.isNaN(id) && typeof value === "string") out[id] = value;
  }
  return out;
}

function parseGamevalPayload(input: unknown): ParsedPayload {
  if (input && typeof input === "object" && "values" in (input as Record<string, unknown>)) {
    const root = input as Record<string, unknown>;
    const valuesRaw = (root.values ?? {}) as Record<string, unknown>;
    const extrasRaw = (root.gameval ?? {}) as Record<string, unknown>;
    const values: GamevalData = {};
    const gameval: GamevalExtrasById = {};

    for (const [name, value] of Object.entries(valuesRaw)) {
      if (typeof value === "number" && Number.isFinite(value)) values[name] = value;
    }
    for (const [rawId, extraValue] of Object.entries(extrasRaw)) {
      const id = Number.parseInt(rawId, 10);
      if (Number.isNaN(id) || !extraValue || typeof extraValue !== "object") continue;
      const extra = extraValue as Record<string, unknown>;
      gameval[id] = {
        searchable: typeof extra.searchable === "string" ? extra.searchable : "",
        text: typeof extra.text === "string" ? extra.text : "",
        sub: normalizeSub(extra.sub),
      };
    }
    return { values, gameval };
  }

  // Legacy fallback payload shape: { [name]: id }
  const values: GamevalData = {};
  const gameval: GamevalExtrasById = {};
  for (const [name, value] of Object.entries((input ?? {}) as Record<string, unknown>)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    values[name] = value;
    gameval[value] = { searchable: name, text: name, sub: {} };
  }
  return { values, gameval };
}

function buildDerived(values: GamevalData, extras: GamevalExtrasById) {
  const reverseData: Record<number, string> = {};
  const entries: GamevalEntry[] = [];
  const searchableToId: Record<string, number> = {};
  const seenIds = new Set<number>();

  const addEntry = (id: number, fallbackName?: string) => {
    if (!Number.isFinite(id) || seenIds.has(id)) return;
    seenIds.add(id);

    const extra = extras[id];
    const searchable = (extra?.searchable || fallbackName || String(id)).trim();
    const text = (extra?.text || searchable).trim();
    reverseData[id] = text;
    entries.push({ name: searchable, id, lowerName: searchable.toLowerCase() });

    const searchKey = searchable.toLowerCase();
    if (searchKey && searchableToId[searchKey] == null) {
      searchableToId[searchKey] = id;
    }
  };

  for (const [name, id] of Object.entries(values)) {
    addEntry(id, name);
  }
  Object.keys(extras)
    .map((rawId) => Number.parseInt(rawId, 10))
    .filter((id) => !Number.isNaN(id))
    .sort((a, b) => a - b)
    .forEach((id) => addEntry(id));

  return { reverseData, entries, searchableToId };
}

function makeKey(cacheTypeId: string, type: GamevalType, rev?: number | "latest"): string {
  return `${cacheTypeId}:${type}:${rev ?? "latest"}`;
}

export function GamevalProvider({ children }: { children: React.ReactNode }) {
  const { selectedCacheType } = useCacheType();
  const loadingPromisesRef = React.useRef(new Map<string, Promise<void>>());
  const loadedKeysRef = React.useRef(new Set<string>());

  const [gamevalData, setGamevalData] = React.useState(new Map<string, GamevalData>());
  const [gamevalReverseData, setGamevalReverseData] = React.useState(new Map<string, Record<number, string>>());
  const [gamevalEntries, setGamevalEntries] = React.useState(new Map<string, GamevalEntry[]>());
  const [gamevalExtras, setGamevalExtras] = React.useState(new Map<string, GamevalExtrasById>());
  const [gamevalSearchIndex, setGamevalSearchIndex] = React.useState(new Map<string, Record<string, number>>());
  const [loadingKeys, setLoadingKeys] = React.useState(new Set<string>());
  const [loadedKeys, setLoadedKeys] = React.useState(new Set<string>());

  React.useEffect(() => {
    loadedKeysRef.current = loadedKeys;
  }, [loadedKeys]);

  // If cache target switches, keep things clean and deterministic.
  React.useEffect(() => {
    loadingPromisesRef.current.clear();
    loadedKeysRef.current.clear();
    setGamevalData(new Map());
    setGamevalReverseData(new Map());
    setGamevalEntries(new Map());
    setGamevalExtras(new Map());
    setGamevalSearchIndex(new Map());
    setLoadingKeys(new Set());
    setLoadedKeys(new Set());
  }, [selectedCacheType.id]);

  const loadGamevalType = React.useCallback(
    async (type: GamevalType, rev?: number | "latest") => {
      const key = makeKey(selectedCacheType.id, type, rev);
      if (loadedKeysRef.current.has(key)) return;

      const existing = loadingPromisesRef.current.get(key);
      if (existing) {
        await existing;
        return;
      }

      setLoadingKeys((prev) => new Set(prev).add(key));

      const request = (async () => {
        try {
          const params = new URLSearchParams({
            rev: String(rev ?? "latest"),
            includeExtras: "true",
          });

          const url = `/api/cache-proxy/gameval/${type}?${params.toString()}`;
          const cacheKey = `gameval:json:${selectedCacheType.id}:${type}:${params.toString()}`;
          const { data: raw } = await conditionalJsonFetch<unknown>(cacheKey, url, {
            headers: {
              "x-cache-type": JSON.stringify({
                ip: selectedCacheType.ip,
                port: selectedCacheType.port,
              }),
            },
          });

          const parsed = parseGamevalPayload(raw);
          const derived = buildDerived(parsed.values, parsed.gameval);

          setGamevalData((prev) => {
            const next = new Map(prev);
            next.set(key, parsed.values);
            return next;
          });
          setGamevalExtras((prev) => {
            const next = new Map(prev);
            next.set(key, parsed.gameval);
            return next;
          });
          setGamevalReverseData((prev) => {
            const next = new Map(prev);
            next.set(key, derived.reverseData);
            return next;
          });
          setGamevalEntries((prev) => {
            const next = new Map(prev);
            next.set(key, derived.entries);
            return next;
          });
          setGamevalSearchIndex((prev) => {
            const next = new Map(prev);
            next.set(key, derived.searchableToId);
            return next;
          });

          loadedKeysRef.current.add(key);
          setLoadedKeys((prev) => new Set(prev).add(key));
        } finally {
          setLoadingKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
          loadingPromisesRef.current.delete(key);
        }
      })();

      loadingPromisesRef.current.set(key, request);
      await request;
    },
    [selectedCacheType.id, selectedCacheType.ip, selectedCacheType.port],
  );

  const lookupGameval = React.useCallback(
    (type: GamevalType, id: number, rev?: number | "latest") => {
      return gamevalReverseData.get(makeKey(selectedCacheType.id, type, rev))?.[id];
    },
    [gamevalReverseData, selectedCacheType.id],
  );

  const lookupGamevalByName = React.useCallback(
    (type: GamevalType, name: string, rev?: number | "latest") => {
      const key = makeKey(selectedCacheType.id, type, rev);
      const normalized = name.trim().toLowerCase();
      const searchIndex = gamevalSearchIndex.get(key);
      if (searchIndex && normalized in searchIndex) {
        return searchIndex[normalized];
      }
      return gamevalData.get(key)?.[name];
    },
    [gamevalData, gamevalSearchIndex, selectedCacheType.id],
  );

  const getGamevalData = React.useCallback(
    (type: GamevalType, rev?: number | "latest") => gamevalData.get(makeKey(selectedCacheType.id, type, rev)),
    [gamevalData, selectedCacheType.id],
  );

  const getGamevalExtras = React.useCallback(
    (type: GamevalType, rev?: number | "latest") => gamevalExtras.get(makeKey(selectedCacheType.id, type, rev)),
    [gamevalExtras, selectedCacheType.id],
  );

  const getGamevalExtra = React.useCallback(
    (type: GamevalType, id: number, rev?: number | "latest") =>
      gamevalExtras.get(makeKey(selectedCacheType.id, type, rev))?.[id],
    [gamevalExtras, selectedCacheType.id],
  );

  const getGamevalEntries = React.useCallback(
    (type: GamevalType, rev?: number | "latest") => gamevalEntries.get(makeKey(selectedCacheType.id, type, rev)),
    [gamevalEntries, selectedCacheType.id],
  );

  const isLoading = React.useCallback(
    (type: GamevalType, rev?: number | "latest") => loadingKeys.has(makeKey(selectedCacheType.id, type, rev)),
    [loadingKeys, selectedCacheType.id],
  );

  const hasLoaded = React.useCallback(
    (type: GamevalType, rev?: number | "latest") => loadedKeys.has(makeKey(selectedCacheType.id, type, rev)),
    [loadedKeys, selectedCacheType.id],
  );

  const value = React.useMemo<GamevalContextType>(
    () => ({
      lookupGameval,
      lookupGamevalByName,
      getGamevalData,
      getGamevalExtras,
      getGamevalExtra,
      getGamevalEntries,
      loadGamevalType,
      isLoading,
      hasLoaded,
    }),
    [
      lookupGameval,
      lookupGamevalByName,
      getGamevalData,
      getGamevalExtras,
      getGamevalExtra,
      getGamevalEntries,
      loadGamevalType,
      isLoading,
      hasLoaded,
    ],
  );

  return <GamevalContext.Provider value={value}>{children}</GamevalContext.Provider>;
}

export function useGamevals(): GamevalContextType {
  const context = React.useContext(GamevalContext);
  if (!context) {
    throw new Error("useGamevals must be used within GamevalProvider");
  }
  return context;
}
