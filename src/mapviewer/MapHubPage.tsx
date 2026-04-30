import { Map, Pencil, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { cn } from "../util/cn";

/**
 * Landing route for Map: user picks viewer or editor (uses active cache on both).
 */
export function MapHubPage(): JSX.Element {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const searchSuffix = searchParams.toString() ? `?${searchParams.toString()}` : "";

    return (
        <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-6 p-6">
            <div className="w-1/2 min-w-0 max-w-full rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                            <Map className="size-5" aria-hidden />
                        </div>
                        <div>
                            <h1 className="text-lg font-semibold tracking-tight">Map</h1>
                            <p className="text-xs text-muted-foreground">
                                Uses your active cache from Cache Repository.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Close"
                        onClick={() => navigate("/")}
                    >
                        <X className="size-4" />
                    </button>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                    Pick a mode. Both use the cache you have loaded in Cache Repository.
                </p>
                <div className="flex flex-col gap-3">
                    <button
                        type="button"
                        className={cn(
                            "flex w-full gap-3 rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors",
                            "hover:border-primary/40 hover:bg-accent",
                        )}
                        onClick={() => navigate(`/map/viewer${searchSuffix}`)}
                    >
                        <Map className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">Viewer</span>
                            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                                Fly around the world, inspect locations, and use the full map UI.
                            </span>
                        </span>
                    </button>
                    <button
                        type="button"
                        className={cn(
                            "flex w-full gap-3 rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors",
                            "hover:border-primary/40 hover:bg-accent",
                        )}
                        onClick={() => navigate(`/map/editor${searchSuffix}`)}
                    >
                        <Pencil className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">Editor</span>
                            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                                Paint terrain and underlays in 3D with the same loaded cache data.
                            </span>
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}
