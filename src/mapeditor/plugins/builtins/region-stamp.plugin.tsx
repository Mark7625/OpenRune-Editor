import { memo, useSyncExternalStore } from "react";
import { Copy } from "lucide-react";

import { Label } from "../../../components/ui/label";
import { boundsHeight, boundsWidth } from "./region-stamp-types";
import { RegionStampCopyDialog } from "./RegionStampCopyDialog";
import { REGION_STAMP_COPY_OPTION_ROWS } from "./region-stamp-copy-options";
import type { EditorToolPlugin, MapEditorPalettePanelProps } from "./builtin-plugin-types";

function formatBounds(bounds: { minWorldX: number; minWorldY: number; maxWorldX: number; maxWorldY: number }): string {
    const w = boundsWidth(bounds);
    const h = boundsHeight(bounds);
    return `${w}×${h} tiles (${bounds.minWorldX},${bounds.minWorldY})–(${bounds.maxWorldX},${bounds.maxWorldY})`;
}

function RegionStampToolPanelInner({ pluginHost }: MapEditorPalettePanelProps): JSX.Element {
    useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );
    const bounds = pluginHost.getRegionStampSelectBounds();
    const draft = pluginHost.getRegionStampDraftBounds();
    const pasteActive = pluginHost.isRegionStampPlacementActive();
    const rotation = pluginHost.getRegionStampRotation();
    const stamp = pluginHost.getRegionStampClipboard();

    return (
        <div className="map-editor-panel flex min-h-0 flex-1 flex-col gap-3 p-4">
            <RegionStampCopyDialog pluginHost={pluginHost} />
            <p className="text-xs text-muted-foreground">
                Drag to select a region, then press C to choose what to copy. Paste preview renders real terrain and
                objects — use R to rotate before clicking to place.
            </p>
            {pasteActive && stamp ? (
                <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100/90">
                    Paste mode — left-drag pan · click place · R rotate ({rotation & 3}) · Esc cancel
                </div>
            ) : null}
            {draft ? (
                <div className="rounded-md border border-cyan-500/40 bg-cyan-500/10 p-2 text-xs">
                    <Label className="text-xs text-muted-foreground">Selecting</Label>
                    <p className="mt-1 font-mono tabular-nums">{formatBounds(draft)}</p>
                </div>
            ) : bounds ? (
                <div className="rounded-md border border-cyan-500/40 bg-cyan-500/10 p-2 text-xs">
                    <Label className="text-xs text-muted-foreground">Selected region</Label>
                    <p className="mt-1 font-mono tabular-nums">{formatBounds(bounds)}</p>
                    <p className="mt-1 text-muted-foreground">C copy · Delete clear region</p>
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">Drag on the map to select tiles.</p>
            )}
            {stamp && !pasteActive ? (
                <div className="rounded-md border bg-muted/30 p-2 text-xs">
                    <Label className="text-xs text-muted-foreground">Clipboard</Label>
                    <p className="mt-1 font-mono tabular-nums">
                        {stamp.width}×{stamp.height} · {new Set(stamp.tiles.map((tile) => tile.level)).size} levels ·{" "}
                        {stamp.objects.length} objects
                    </p>
                    <p className="mt-1 text-muted-foreground">
                        Includes:{" "}
                        {REGION_STAMP_COPY_OPTION_ROWS.filter((row) => (stamp.copyOptions ?? {})[row.key]).map((row) => row.label).join(", ") ||
                            "nothing"}
                    </p>
                    <p className="mt-1 text-muted-foreground">Press C again to enter paste mode</p>
                </div>
            ) : null}
        </div>
    );
}

export const RegionStampToolPanel = memo(RegionStampToolPanelInner);

export const regionStampEditorTool: EditorToolPlugin = {
    id: "region-stamp",
    name: "Region Stamp",
    description: "Select a tile region, copy it, and paste terrain plus objects elsewhere.",
    icon: Copy,
    workspaces: [{ panelId: "editor-region-stamp", activateTab: true }],
    actions: [{ kind: "select-tool", tool: "region-stamp" }],
    palettePanel: RegionStampToolPanel,
    usesBrushControls: false,
    keyBindings: [
        {
            id: "select-tool",
            name: "Select Region Stamp tool",
            description: "Switch active tool to Region Stamp.",
            defaultChords: [{ code: "Digit6" }],
            action: ({ host }) => {
                host.setEditorTool("region-stamp");
            },
        },
        {
            id: "copy-region",
            name: "Copy region / start paste",
            description: "Copy the selected region to the clipboard and enter paste mode.",
            defaultChords: [{ code: "KeyC" }],
            shouldProcess: ({ host }) =>
                host.isRegionStampToolActive() &&
                !host.isRegionStampCopyDialogOpen() &&
                host.getRegionStampSelectBounds() != null,
            action: ({ host }) => {
                host.openRegionStampCopyDialog();
                host.notifyWorkbenchStateChanged();
            },
        },
        {
            id: "copy-region-suppress",
            name: "Copy region (camera suppress)",
            defaultChords: [{ code: "KeyC" }],
            trigger: "HELD",
            shouldProcess: ({ host }) =>
                host.isRegionStampToolActive() &&
                (host.isRegionStampCopyDialogOpen() ||
                    host.isRegionStampPlacementActive() ||
                    host.getRegionStampSelectBounds() != null),
            action: () => true,
        },
        {
            id: "rotate-stamp",
            name: "Rotate region stamp",
            description: "Rotate the clipboard stamp 90° while pasting.",
            defaultChords: [{ code: "KeyR" }],
            shouldProcess: ({ host }) => host.isRegionStampToolActive() && host.isRegionStampPlacementActive(),
            action: ({ host }) => {
                host.rotateRegionStamp();
            },
        },
        {
            id: "rotate-stamp-suppress",
            name: "Rotate stamp (camera suppress)",
            defaultChords: [{ code: "KeyR" }],
            trigger: "HELD",
            shouldProcess: ({ host }) => host.isRegionStampToolActive() && host.isRegionStampPlacementActive(),
            action: () => true,
        },
        {
            id: "delete-region",
            name: "Delete selected region",
            description: "Clear terrain, objects, and flags in the selected region.",
            defaultChords: [{ code: "Delete" }, { code: "Backspace" }],
            shouldProcess: ({ host }) =>
                host.isRegionStampToolActive() &&
                !host.isRegionStampPlacementActive() &&
                host.getRegionStampSelectBounds() != null,
            action: ({ host }) => {
                host.deleteRegionStampSelection();
            },
        },
        {
            id: "cancel-stamp",
            name: "Cancel paste / clear selection",
            defaultChords: [{ code: "Escape" }],
            shouldProcess: ({ host }) =>
                host.isRegionStampToolActive() &&
                (host.isRegionStampCopyDialogOpen() ||
                    host.isRegionStampPlacementActive() ||
                    host.getRegionStampSelectBounds() != null ||
                    host.getRegionStampDraftBounds() != null),
            action: ({ host }) => {
                if (host.isRegionStampCopyDialogOpen()) {
                    host.cancelRegionStampCopyDialog();
                } else if (host.isRegionStampPlacementActive()) {
                    host.cancelRegionStampPlacement();
                } else {
                    host.clearRegionStampSelection();
                }
                host.notifyWorkbenchStateChanged();
            },
        },
    ],
};
