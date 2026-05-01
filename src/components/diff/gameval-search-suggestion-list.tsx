"use client";

import * as React from "react";

import type { GamevalType } from "@/context/gameval-context";
import { useGamevals } from "@/context/gameval-context";
import { cn } from "@/lib/utils";

export type GamevalSearchAutocompleteConfig = {
  type: GamevalType;
  rev: number | "latest";
  enabled: boolean;
  /**
   * When `undefined`, no id filter (e.g. sprites). When `null`, combined index not ready — return no suggestions.
   * When a non-empty set, only suggest entries whose id is in the set (textures: valid combined sprites only).
   */
  allowedIds?: ReadonlySet<number> | null;
};

function filterGamevalSuggestions(
  entries: { name: string; id: number; lowerName: string }[],
  rawQuery: string,
  limit = 30,
) {
  const q = rawQuery.trim().toLowerCase();
  if (q.length === 0) return [];
  return entries
    .filter((e) => e.lowerName.includes(q) || String(e.id).includes(q))
    .sort((a, b) => {
      const as = a.lowerName.startsWith(q) ? 0 : String(a.id).startsWith(q) ? 1 : 2;
      const bs = b.lowerName.startsWith(q) ? 0 : String(b.id).startsWith(q) ? 1 : 2;
      if (as !== bs) return as - bs;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

export function useGamevalSearchSuggestions(
  config: GamevalSearchAutocompleteConfig | null | undefined,
  value: string,
  active: boolean,
) {
  const { getGamevalEntries, hasLoaded, loadGamevalType, isLoading } = useGamevals();

  React.useEffect(() => {
    if (!config?.enabled) return;
    void loadGamevalType(config.type, config.rev);
  }, [config?.enabled, config?.type, config?.rev, loadGamevalType]);

  const suggestions = React.useMemo(() => {
    if (!config?.enabled || !active) return [];
    if (!hasLoaded(config.type, config.rev)) return [];
    let entries = getGamevalEntries(config.type, config.rev) ?? [];
    if (config.allowedIds !== undefined) {
      if (config.allowedIds === null) return [];
      if (config.allowedIds.size === 0) return [];
      entries = entries.filter((e) => config.allowedIds!.has(e.id));
    }
    return filterGamevalSuggestions(entries, value);
  }, [active, config, value, getGamevalEntries, hasLoaded]);

  const loaded = Boolean(config?.enabled && hasLoaded(config.type, config.rev));
  const loading = Boolean(config?.enabled && isLoading(config.type, config.rev));

  return { suggestions, loaded, loading };
}

type GamevalSearchSuggestionListProps = {
  suggestions: { name: string; id: number }[];
  activeIndex: number;
  onHoverIndex: (index: number) => void;
  onPick: (name: string) => void;
  loading: boolean;
  showEmpty: boolean;
  className?: string;
};

export function GamevalSearchSuggestionList({
  suggestions,
  activeIndex,
  onHoverIndex,
  onPick,
  loading,
  showEmpty,
  className,
}: GamevalSearchSuggestionListProps) {
  if (loading) {
    return (
      <ul
        className={cn(
          "absolute left-0 right-0 top-full z-[100] mt-1 max-h-64 overflow-auto rounded-md border bg-popover py-2 text-sm text-muted-foreground shadow-md",
          className,
        )}
        role="listbox"
      >
        <li className="px-3 py-1.5">Loading gamevals…</li>
      </ul>
    );
  }

  if (suggestions.length > 0) {
    return (
      <ul
        className={cn(
          "absolute left-0 right-0 top-full z-[100] mt-1 max-h-64 overflow-auto rounded-md border bg-popover py-1 shadow-md",
          className,
        )}
        role="listbox"
      >
        {suggestions.map((s, i) => (
          <li key={`${s.id}-${s.name}`} role="option" aria-selected={i === activeIndex}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm",
                i === activeIndex && "bg-muted",
              )}
              onMouseEnter={() => onHoverIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(s.name);
              }}
            >
              <span className="truncate font-mono text-xs">{s.name}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                id: {s.id}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  if (showEmpty) {
    return (
      <ul
        className={cn(
          "absolute left-0 right-0 top-full z-[100] mt-1 rounded-md border bg-popover py-2 text-sm text-muted-foreground shadow-md",
          className,
        )}
      >
        <li className="px-3 py-1.5">No matching gamevals</li>
      </ul>
    );
  }

  return null;
}
