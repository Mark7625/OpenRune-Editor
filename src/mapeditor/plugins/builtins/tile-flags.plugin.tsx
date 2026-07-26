import { memo, useSyncExternalStore } from "react";
import { Flag } from "lucide-react";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Label } from "../../../components/ui/label";
import { Separator } from "../../../components/ui/separator";
import { cn } from "../../../util/cn";
import type { EditorToolPlugin, MapEditorPalettePanelProps } from "./builtin-plugin-types";
import { getTileFlagsToolModel } from "./tile-flags-tool-model";
import "../../MapEditorPanel.css";

function TileFlagsEditorToolPanelInner({ pluginHost: host }: MapEditorPalettePanelProps): JSX.Element {
    useSyncExternalStore(
        host.subscribeWorkbenchPlugins,
        host.getWorkbenchPluginsStateSnapshot,
        host.getWorkbenchPluginsStateSnapshot,
    );
    const model = getTileFlagsToolModel(host);
    const paintCount = model.paintFlags.size;

    return (
        <div className="map-editor-panel flex min-h-0 flex-1 flex-col">
            <CardHeader className="space-y-1.5 border-b border-border bg-muted/20 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold tracking-tight text-foreground">Tile flags</CardTitle>
                    <Badge variant="outline" className="h-5 border-border px-2 font-mono text-[10px] font-normal">
                        {paintCount} paint
                    </Badge>
                </div>
                <div className="rounded-md border border-muted bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    Left-click or drag to add selected flags. Hold Ctrl while painting to clear them.
                </div>
            </CardHeader>
            <Separator />
            <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Flag</span>
                    <span className="text-center">Show</span>
                    <span className="text-center">Paint</span>
                </div>
                {model.descriptors.map((descriptor) => {
                    const showEnabled = model.isShowEnabled(descriptor.flag);
                    const paintEnabled = model.isPaintEnabled(descriptor.flag);
                    return (
                        <div
                            key={descriptor.flag}
                            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 rounded-md border border-border/70 bg-card/40 px-2 py-1.5"
                        >
                            <div className="flex min-w-0 items-center gap-2">
                                <span
                                    className="size-3 shrink-0 rounded-sm border border-border/60"
                                    style={{
                                        backgroundColor: `rgba(${Math.round(descriptor.color[0] * 255)}, ${Math.round(descriptor.color[1] * 255)}, ${Math.round(descriptor.color[2] * 255)}, ${descriptor.color[3]})`,
                                    }}
                                    aria-hidden
                                />
                                <Label className="min-w-0 text-xs font-normal leading-snug text-foreground">
                                    {descriptor.label}
                                </Label>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant={showEnabled ? "secondary" : "outline"}
                                className="mx-auto h-7 w-14 px-1 text-[10px]"
                                onClick={() => model.setShowFlag(descriptor.flag, !showEnabled)}
                            >
                                {showEnabled ? "On" : "Off"}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={paintEnabled ? "default" : "outline"}
                                className={cn("mx-auto h-7 w-14 px-1 text-[10px]", paintEnabled && "ring-1 ring-primary/35")}
                                onClick={() => model.setPaintFlag(descriptor.flag, !paintEnabled)}
                            >
                                {paintEnabled ? "On" : "Off"}
                            </Button>
                        </div>
                    );
                })}
                <div className="rounded-md border border-border/80 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
                    Show overlays stay visible while this tool is active. Paint adds selected bits; Ctrl+paint clears
                    them. Bridge / Render Z-1 on plane 1 show on ground (plane 0) in the 3D view; painting
                    those flags on plane 0 also writes plane 1 (OSRS storage).
                </div>
            </CardContent>
        </div>
    );
}

export const TileFlagsEditorToolPanel = memo(TileFlagsEditorToolPanelInner);

export const tileFlagsEditorTool: EditorToolPlugin = {
    id: "tile-flags",
    name: "Tile flags",
    description: "View and paint OSRS tile render flags (unwalkable, bridge, roof, Z-1, map draw).",
    icon: Flag,
    palettePanel: TileFlagsEditorToolPanel,
    workspaces: [{ panelId: "editor-tile-flags", activateTab: true }],
    actions: [{ kind: "select-tool", tool: "tile-flags" }],
    keyBindings: [
        {
            id: "select-tool",
            name: "Select Tile flags tool",
            description: "Switch active paint tool to Tile flags.",
            defaultChords: [{ code: "Digit5" }],
            action: ({ host }) => {
                host.setEditorTool("tile-flags");
            },
        },
    ],
};
