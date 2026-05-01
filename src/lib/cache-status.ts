import type { CacheType } from "@/lib/cache-types";

export enum ServerStatus {
  BOOTING = "BOOTING",
  UPDATING = "UPDATING",
  LIVE = "LIVE",
  ERROR = "ERROR",
}

export interface StatusResponse {
  status: ServerStatus;
  game: string;
  revision: number;
  environment: string;
  port: number;
  statusMessage?: string | null;
  progress?: number | null;
  /** ORDF v9+ per-chunk CRC32 (items, npcs, sprites, …); absent on old binaries. */
  fileCrcs?: Record<string, number> | null;
}

export interface CacheStatusInfo {
  status: ServerStatus;
  isOnline: boolean;
  statusResponse: StatusResponse | null;
  lastChecked: number;
}

export function isStatusOnline(status: ServerStatus): boolean {
  return status === ServerStatus.LIVE;
}

export async function checkCacheStatus(
  cacheType: CacheType,
): Promise<StatusResponse | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);

  try {
    const cacheTypeHeader = JSON.stringify({
      ip: cacheType.ip,
      port: cacheType.port,
    });

    const response = await fetch("/api/status", {
      method: "GET",
      headers: {
        "x-cache-type": cacheTypeHeader,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (response.status === 503 || response.status === 502) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as StatusResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function limitConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue: Promise<void>[] = [];

  for (const item of items) {
    const pending = fn(item).then(() => {
      const idx = queue.indexOf(pending);
      if (idx >= 0) queue.splice(idx, 1);
    });

    queue.push(pending);

    if (queue.length >= limit) {
      await Promise.race(queue);
    }
  }

  await Promise.all(queue);
}
