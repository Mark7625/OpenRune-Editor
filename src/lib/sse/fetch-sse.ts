"use client";

import type { SseEvent, SseEventDataMap, SseEventType } from "@/lib/sse/types";

export type SseEventCallback<T extends SseEventType> = (
  data: SseEventDataMap[T],
) => void;
export type SseErrorCallback = (error: Event | Error) => void;

export interface SseConnection {
  close: () => void;
  readyState: () => number;
}

function buildSseUrl(type: SseEventType, backendUrl?: string): string {
  const search = new URLSearchParams({ type });
  if (!backendUrl) {
    return `/api/server/sse?${search.toString()}`;
  }

  try {
    const parsed = new URL(backendUrl);
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    search.set("ip", parsed.hostname);
    search.set("port", port);
  } catch {
    // ignore invalid URL and let proxy resolve from cookie/header target
  }

  return `/api/server/sse?${search.toString()}`;
}

function parseSsePayload<T extends SseEventType>(
  payload: string,
  expectedType: T,
): SseEventDataMap[T] | null {
  const parsed = JSON.parse(payload) as SseEvent<SseEventDataMap[T]> | SseEventDataMap[T];

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "type" in parsed &&
    "data" in parsed
  ) {
    const wrapped = parsed as SseEvent<SseEventDataMap[T]>;
    return wrapped.type === expectedType ? wrapped.data : null;
  }

  return parsed as SseEventDataMap[T];
}

export function fetchSSE<T extends SseEventType>(
  type: T,
  onEvent: SseEventCallback<T>,
  onError?: SseErrorCallback,
  backendUrl?: string,
): SseConnection | null {
  if (typeof window === "undefined") return null;

  const sseUrl = buildSseUrl(type, backendUrl);

  try {
    const source = new EventSource(sseUrl);

    const handleMessage = (payload: string) => {
      try {
        const eventData = parseSsePayload(payload, type);
        if (eventData !== null) {
          onEvent(eventData);
        }
      } catch (err) {
        onError?.(err as Error);
      }
    };

    source.onmessage = (event) => handleMessage(event.data);

    source.addEventListener(type.toLowerCase(), (event: Event) => {
      handleMessage((event as MessageEvent).data);
    });
    source.addEventListener(type, (event: Event) => {
      handleMessage((event as MessageEvent).data);
    });

    source.onerror = (event) => {
      if (source.readyState === EventSource.CLOSED) return;
      onError?.(event);
    };

    return {
      close: () => source.close(),
      readyState: () => source.readyState,
    };
  } catch (err) {
    onError?.(err as Error);
    return null;
  }
}
