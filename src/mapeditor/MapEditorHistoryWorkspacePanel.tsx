import type { IDockviewPanelProps } from "dockview";
import { History } from "lucide-react";

import { Badge } from "../components/ui/badge";
import { ScrollArea } from "../components/ui/scroll-area";

/**
 * Placeholder until undo/redo or edit history is wired through the editor.
 */
export function MapEditorHistoryWorkspacePanel(_props: IDockviewPanelProps): JSX.Element {
    const fakeEntries = [
        { id: "1", label: "Paint underlay (stub)", time: "—" },
        { id: "2", label: "Adjust height (stub)", time: "—" },
        { id: "3", label: "Smooth terrain (stub)", time: "—" },
    ];

    return (
        <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-card-foreground">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <History className="size-3.5 shrink-0" aria-hidden />
                <span>Edit history will list brush strokes and terrain changes here.</span>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                    Preview
                </Badge>
            </div>
            <ScrollArea className="min-h-0 flex-1 rounded-md border border-dashed border-border/80 bg-muted/20">
                <ul className="divide-y divide-border/60 p-1">
                    {fakeEntries.map((e) => (
                        <li key={e.id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                            <span className="font-mono text-[10px] text-muted-foreground">{e.time}</span>
                            <span>{e.label}</span>
                        </li>
                    ))}
                </ul>
            </ScrollArea>
        </div>
    );
}
