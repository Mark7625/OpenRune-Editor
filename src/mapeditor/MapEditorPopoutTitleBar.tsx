import { GripHorizontal, X } from "lucide-react";

import { Button } from "../components/ui/button";
import { isTauriRuntime } from "../lib/tauri/is-tauri";

export interface MapEditorPopoutTitleBarProps {
    title: string;
    onClose: () => void;
}

export function MapEditorPopoutTitleBar({ title, onClose }: MapEditorPopoutTitleBarProps): JSX.Element {
    const useTauriDragRegion = isTauriRuntime();

    return (
        <div
            className="flex shrink-0 select-none items-center gap-1 border-b border-border/70 bg-muted/40 px-1.5 py-1"
            data-tauri-drag-region={useTauriDragRegion ? "" : undefined}
        >
            <div
                className="flex min-w-0 flex-1 items-center gap-1.5"
                data-tauri-drag-region={useTauriDragRegion ? "" : undefined}
            >
                <GripHorizontal className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-tight text-foreground">
                    {title}
                </span>
            </div>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6 shrink-0 hover:bg-destructive/15 hover:text-destructive"
                aria-label="Close panel"
                onClick={onClose}
            >
                <X className="size-3.5" aria-hidden />
            </Button>
        </div>
    );
}
