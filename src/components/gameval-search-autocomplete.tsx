"use client";

import * as React from "react";

import { cn } from "../lib/utils";
import { GameValGroupType } from "../rs/config/gameval/GameValGroupType";


/**
 * -----------------------------
 * TYPES
 * -----------------------------
 */

export type GamevalSearchAutocompleteConfig = {
    type: GameValGroupType;
    rev: number | "latest";
    enabled: boolean;

    /**
     * undefined = no filter
     * null = blocked/uninitialized state
     */
    allowedIds?: ReadonlySet<number> | null;
};

export type GamevalEntry = {
    id: number;
    name: string;
    lowerName: string;
};

/**
 * -----------------------------
 * FILTER ENGINE
 * -----------------------------
 */

function filterGamevalSuggestions(entries: GamevalEntry[], rawQuery: string, limit = 30) {
    const q = rawQuery.trim().toLowerCase();
    if (!q) return [];

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

/**
 * -----------------------------
 * HOOK (CACHE DRIVEN)
 * -----------------------------
 */

export function useGamevalSearchSuggestions(
    config: GamevalSearchAutocompleteConfig | null | undefined,
    value: string,
    active: boolean,
    entries: GamevalEntry[] | null | undefined,
) {
    const suggestions = React.useMemo(() => {
        if (!config?.enabled || !active) return [];
        if (!entries) return [];

        let filtered = entries;

        // optional ID filter
        if (config.allowedIds !== undefined) {
            if (config.allowedIds === null) return [];
            if (config.allowedIds.size === 0) return [];

            filtered = filtered.filter((e) => config.allowedIds!.has(e.id));
        }

        return filterGamevalSuggestions(filtered, value);
    }, [config, value, active, entries]);

    return { suggestions };
}

/**
 * -----------------------------
 * UI COMPONENT
 * -----------------------------
 */

type GamevalSearchSuggestionListProps = {
    suggestions: GamevalEntry[];
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
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">
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
