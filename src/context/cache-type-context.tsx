"use client";

import * as React from "react";
import { Globe } from "lucide-react";
import {
  BASE_CACHE_TYPES,
  LOCALHOST_CACHE_TYPE,
  LOCAL_STORAGE_KEY,
  STORAGE_KEY,
  type CacheType,
} from "@/lib/cache-types";
import { syncCacheTypeCookie } from "@/lib/cache-proxy-client";
import {
  CacheStatusInfo,
  ServerStatus,
  StatusResponse,
  checkCacheStatus,
  isStatusOnline,
  limitConcurrency,
} from "@/lib/cache-status";
import { fetchSSE, type SseConnection } from "@/lib/sse/fetch-sse";
import { SseEventType } from "@/lib/sse/types";

function buildCacheStatusInfo(statusResponse: StatusResponse | null): Omit<CacheStatusInfo, "lastChecked"> {
  const status = statusResponse?.status ?? ServerStatus.ERROR;
  return {
    status,
    isOnline: statusResponse ? isStatusOnline(statusResponse.status) : false,
    statusResponse,
  };
}

/** Avoid context churn when a poll/SSE repeats the same server snapshot (pages already have their data). */
function cacheStatusMeaningfullyChanged(
  prev: CacheStatusInfo | undefined,
  statusResponse: StatusResponse | null,
): boolean {
  if (!prev) return true;
  const next = buildCacheStatusInfo(statusResponse);
  if (prev.status !== next.status || prev.isOnline !== next.isOnline) return true;
  const a = prev.statusResponse;
  const b = next.statusResponse;
  if (!a && !b) return false;
  if (!a || !b) return true;
  return (
    a.revision !== b.revision ||
    a.progress !== b.progress ||
    (a.statusMessage ?? "") !== (b.statusMessage ?? "")
  );
}

type CacheTypeContextValue = {
  cacheTypes: CacheType[];
  availableCacheTypes: CacheType[];
  selectedCacheType: CacheType;
  setSelectedCacheType: (cacheType: CacheType) => void;
  setSelectedCacheTypeById: (id: string) => void;
  cacheStatuses: Map<string, CacheStatusInfo>;
  checkingStatuses: Set<string>;
  refreshCacheStatuses: (options?: { silent?: boolean }) => Promise<void>;
  setStatusLiveUpdatesEnabled: (enabled: boolean) => void;
  manuallySelected: boolean;
};

const CacheTypeContext = React.createContext<CacheTypeContextValue | null>(null);

function isLocalEnvironment(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    process.env.NEXT_PUBLIC_IS_LOCAL === "true" ||
    process.env.NODE_ENV === "development" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

export function CacheTypeProvider({ children }: { children: React.ReactNode }) {
  const useLocalhostType = React.useMemo(() => isLocalEnvironment(), []);
  const localhostWithIcon = React.useMemo(
    () => ({
      ...LOCALHOST_CACHE_TYPE,
      icon: <Globe size={24} />,
    }),
    [],
  );
  const cacheTypes = React.useMemo(() => {
    return useLocalhostType
      ? [localhostWithIcon, ...BASE_CACHE_TYPES]
      : BASE_CACHE_TYPES;
  }, [localhostWithIcon, useLocalhostType]);

  const [selectedId, setSelectedId] = React.useState<string>(BASE_CACHE_TYPES[0].id);
  const [manuallySelected, setManuallySelected] = React.useState(false);
  const [cacheStatuses, setCacheStatuses] = React.useState<Map<string, CacheStatusInfo>>(
    () => new Map(),
  );
  const [checkingStatuses, setCheckingStatuses] = React.useState<Set<string>>(
    () => new Set(cacheTypes.map((cacheType) => cacheType.id)),
  );
  const [statusLiveUpdatesEnabled, setStatusLiveUpdatesEnabled] = React.useState(false);

  const applyStatusUpdate = React.useCallback(
    (cacheTypeId: string, statusResponse: StatusResponse | null) => {
      setCacheStatuses((prev) => {
        const existing = prev.get(cacheTypeId);
        if (!cacheStatusMeaningfullyChanged(existing, statusResponse)) {
          return prev;
        }
        const next = new Map(prev);
        const core = buildCacheStatusInfo(statusResponse);
        next.set(cacheTypeId, { ...core, lastChecked: Date.now() });
        return next;
      });

      setCheckingStatuses((prev) => {
        if (!prev.has(cacheTypeId)) return prev;
        const next = new Set(prev);
        next.delete(cacheTypeId);
        return next;
      });
    },
    [],
  );

  React.useEffect(() => {
    try {
      const manual = localStorage.getItem(LOCAL_STORAGE_KEY) === "true";
      const storedId = localStorage.getItem(STORAGE_KEY);
      setManuallySelected(manual);

      if (useLocalhostType && !manual) {
        setSelectedId(localhostWithIcon.id);
        localStorage.setItem(STORAGE_KEY, localhostWithIcon.id);
        return;
      }

      if (storedId && cacheTypes.some((cacheType) => cacheType.id === storedId)) {
        setSelectedId(storedId);
        return;
      }

      setSelectedId(cacheTypes[0].id);
      localStorage.setItem(STORAGE_KEY, cacheTypes[0].id);
    } catch {
      // Ignore storage failures.
    }
  }, [cacheTypes, localhostWithIcon.id, useLocalhostType]);

  const refreshCacheStatuses = React.useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      if (!silent) {
        setCheckingStatuses(new Set(cacheTypes.map((cacheType) => cacheType.id)));
      }

      await limitConcurrency(cacheTypes, 3, async (cacheType) => {
        const statusResponse = await checkCacheStatus(cacheType);
        applyStatusUpdate(cacheType.id, statusResponse);
      });
    },
    [applyStatusUpdate, cacheTypes],
  );

  React.useEffect(() => {
    void refreshCacheStatuses();
  }, [refreshCacheStatuses]);

  React.useEffect(() => {
    if (!statusLiveUpdatesEnabled) return;

    const connections: SseConnection[] = [];

    for (const cacheType of cacheTypes) {
      const backendUrl = `http://${cacheType.ip}:${cacheType.port}`;
      const connection = fetchSSE(
        SseEventType.STATUS,
        (event) => {
          applyStatusUpdate(cacheType.id, event);
        },
        () => {
          // Selector view will still work with manual refresh if SSE drops.
        },
        backendUrl,
      );

      if (connection) {
        connections.push(connection);
      }
    }

    return () => {
      for (const connection of connections) {
        connection.close();
      }
    };
  }, [applyStatusUpdate, cacheTypes, statusLiveUpdatesEnabled]);

  const setSelectedCacheType = React.useCallback((cacheType: CacheType) => {
    if (!cacheTypes.some((entry) => entry.id === cacheType.id)) {
      return;
    }
    setSelectedId(cacheType.id);
    setManuallySelected(true);

    try {
      localStorage.setItem(STORAGE_KEY, cacheType.id);
      localStorage.setItem(LOCAL_STORAGE_KEY, "true");
    } catch {
      // Ignore storage failures.
    }
  }, [cacheTypes]);

  const setSelectedCacheTypeById = React.useCallback(
    (id: string) => {
      const cacheType = cacheTypes.find((entry) => entry.id === id);
      if (!cacheType) return;
      setSelectedCacheType(cacheType);
    },
    [cacheTypes, setSelectedCacheType],
  );

  const selectedCacheType = React.useMemo(() => {
    return (
      cacheTypes.find((cacheType) => cacheType.id === selectedId) ?? cacheTypes[0]
    );
  }, [cacheTypes, selectedId]);

  React.useEffect(() => {
    syncCacheTypeCookie(selectedCacheType);
  }, [selectedCacheType]);

  const value = React.useMemo(
    () => ({
      cacheTypes,
      availableCacheTypes: cacheTypes,
      selectedCacheType,
      setSelectedCacheType,
      setSelectedCacheTypeById,
      cacheStatuses,
      checkingStatuses,
      refreshCacheStatuses,
      setStatusLiveUpdatesEnabled,
      manuallySelected,
    }),
    [
      cacheStatuses,
      cacheTypes,
      checkingStatuses,
      manuallySelected,
      refreshCacheStatuses,
      selectedCacheType,
      setSelectedCacheType,
      setSelectedCacheTypeById,
      setStatusLiveUpdatesEnabled,
    ],
  );

  return (
    <CacheTypeContext.Provider value={value}>{children}</CacheTypeContext.Provider>
  );
}

export function useCacheType() {
  const context = React.useContext(CacheTypeContext);
  if (!context) {
    throw new Error("useCacheType must be used within CacheTypeProvider");
  }
  return context;
}
