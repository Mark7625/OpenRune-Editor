import type { IDockviewPanelProps } from "dockview";
import { History, Redo2, Undo2 } from "lucide-react";
import { useCallback, useContext, useSyncExternalStore } from "react";

import { Button } from "../components/ui/button";
import { formatMapSquareLabel } from "./map-editor-history-apply";
import { EMPTY_MAP_EDITOR_HISTORY_SNAPSHOT } from "./map-editor-history";
import { MapEditorWorkbenchContext } from "./map-editor-workbench-context";

function formatHistoryTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

export function MapEditorHistoryWorkspacePanel(_props: IDockviewPanelProps): JSX.Element {
    const pluginHost = useContext(MapEditorWorkbenchContext);

    const subscribeHistory = useCallback(
        (onStoreChange: () => void) => pluginHost?.subscribeHistory(onStoreChange) ?? (() => {}),
        [pluginHost],
    );
    const getHistorySnapshot = useCallback(
        () => pluginHost?.getHistorySnapshot() ?? EMPTY_MAP_EDITOR_HISTORY_SNAPSHOT,
        [pluginHost],
    );
    const history = useSyncExternalStore(subscribeHistory, getHistorySnapshot, getHistorySnapshot);

    if (!pluginHost) {
        return (
            <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
                History unavailable
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-card-foreground">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <History className="size-3.5 shrink-0" aria-hidden />
                <span>Ctrl+Z undo · Ctrl+Y redo</span>
            </div>

            <div className="flex gap-1">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 gap-1 text-xs"
                    disabled={!history.canUndo}
                    onClick={() => pluginHost.undoHistory()}
                    title="Undo (Ctrl+Z)"
                >
                    <Undo2 className="size-3" />
                    Undo
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 gap-1 text-xs"
                    disabled={!history.canRedo}
                    onClick={() => pluginHost.redoHistory()}
                    title="Redo (Ctrl+Y)"
                >
                    <Redo2 className="size-3" />
                    Redo
                </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/80 bg-muted/10">
                {history.entries.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">
                        Terrain and paint edits appear here as you work.
                    </p>
                ) : (
                    <ul className="divide-y divide-border/60 p-1">
                        {[...history.entries].reverse().map((entry, displayIdx) => {
                            const index = history.entries.length - 1 - displayIdx;
                            const isCurrent = index === history.currentIndex;
                            const isUndone = index > history.currentIndex;
                            return (
                                <li
                                    key={entry.id}
                                    className={[
                                        "flex items-start gap-2 rounded px-2 py-1.5 text-xs",
                                        isCurrent ? "bg-primary/10 ring-1 ring-primary/30" : "",
                                        isUndone ? "opacity-50" : "",
                                    ].join(" ")}
                                >
                                    <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground">
                                        {index + 1}.
                                    </span>
                                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                        {formatHistoryTime(entry.timestamp)}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium">{entry.label}</span>
                                        <span className="block truncate text-[10px] text-muted-foreground">
                                            {entry.tileCount} tile{entry.tileCount === 1 ? "" : "s"}
                                            {entry.mapIds.length > 0
                                                ? ` · ${entry.mapIds.map((id) => formatMapSquareLabel(id)).join(", ")}`
                                                : ""}
                                        </span>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
