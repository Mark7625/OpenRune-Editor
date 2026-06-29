import { memo, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, Check, LayoutGrid, Shuffle, Sparkles, Wand2, X } from "lucide-react";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Label } from "../../../components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { Separator } from "../../../components/ui/separator";
import { OverlayFloorType } from "../../../rs/config/floortype/OverlayFloorType";
import { cn } from "../../../util/cn";
import { getOverlayTexturePreviewDataUrl } from "../../overlaySwatchTexture";
import "../../MapEditorPanel.css";
import { isEditorToolKeybindHeld } from "../../editor-tool-input";
import type { EditorToolDataFns, EditorToolPlugin, MapEditorPalettePanelProps } from "./builtin-plugin-types";
import { getOverlayGradientModel } from "./overlay-gradient-model";
import {
    UNDERLAY_GRADIENT_PATTERNS,
    shuffleUnderlayIdsInPlace,
    underlayGradientPatternLabel,
    type UnderlayGradientPattern,
    type UnderlayPanelTab,
} from "../../map-editor-underlay-gradient";

type OverlaySwatchFilter = "all" | "textured" | "plain";

function overlayIsTextured(overlay: OverlayFloorType): boolean {
    return overlay.textureId >= 0;
}

function rgbToCss(rgb: number): string {
    const r = rgb >> 16;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    return `rgb(${r}, ${g}, ${b})`;
}

const overlayToolData: EditorToolDataFns = {
    selectPrimary: (host, id) => {
        host.selectedOverlayId = id;
        host.setEditorTool("overlay");
    },
    clearPrimary: (host) => {
        host.selectedOverlayId = -1;
    },
};

function OverlayEditorToolPanelInner({ pluginHost: host }: MapEditorPalettePanelProps): JSX.Element {
    const workbenchSnap = useSyncExternalStore(
        host.subscribeWorkbenchPlugins,
        host.getWorkbenchPluginsStateSnapshot,
        host.getWorkbenchPluginsStateSnapshot,
    );
    const [selectedOverlayId, setSelectedOverlayId] = useState<number>(host.selectedOverlayId);
    const [swatchFilter, setSwatchFilter] = useState<OverlaySwatchFilter>("all");
    const [basePickerOpen, setBasePickerOpen] = useState(false);
    const [replaceOpenIndex, setReplaceOpenIndex] = useState<number | null>(null);

    useEffect(() => {
        setSelectedOverlayId(host.selectedOverlayId);
    }, [host, workbenchSnap]);

    const overlayTypeLoader = host.overlayTypeLoader;
    const textureLoader = host.textureLoader;
    const og = getOverlayGradientModel(host);

    const overlays = useMemo((): OverlayFloorType[] => {
        const list: OverlayFloorType[] = [];
        for (let i = 0; i < overlayTypeLoader.getCount(); i++) {
            list.push(overlayTypeLoader.load(i) as OverlayFloorType);
        }
        return list;
    }, [overlayTypeLoader]);

    const texturePreviewById = useMemo(() => {
        const map = new Map<number, string | null>();
        for (const overlay of overlays) {
            map.set(overlay.id, getOverlayTexturePreviewDataUrl(textureLoader, overlay));
        }
        return map;
    }, [overlays, textureLoader]);
    const overlayById = useMemo(() => new Map(overlays.map((o) => [o.id, o])), [overlays]);

    const filteredOverlays = useMemo(() => {
        if (swatchFilter === "textured") {
            return overlays.filter(overlayIsTextured);
        }
        if (swatchFilter === "plain") {
            return overlays.filter((o) => !overlayIsTextured(o));
        }
        return overlays;
    }, [overlays, swatchFilter]);

    const setNoOverlay = useCallback(() => {
        overlayToolData.clearPrimary?.(host);
        setSelectedOverlayId(-1);
    }, [host]);

    const isNoOverlaySelected = selectedOverlayId === -1;
    const panelTab = og.overlayPanelTab;
    const gradientIds = og.overlayGradientIds;
    const baseOverlay = overlayById.get(og.overlayGradientBaseOverlayId);

    const [overlayPanelTabEx, setOverlayPanelTabEx] = useState<UnderlayPanelTab>(panelTab);
    const setTab = useCallback(
        (tab: UnderlayPanelTab) => {
            setOverlayPanelTabEx(tab);
            og.setOverlayPanelTab(tab);
        },
        [og],
    );

    const findSimilarSorted = useCallback(() => {
        og.setOverlayGradientIds(og.pickSimilarSorted(overlays));
    }, [og, overlays]);

    const randomMix = useCallback(() => {
        og.bumpOverlayGradientMixSeed();
        og.setOverlayGradientIds(og.pickSimilarMixed(overlays));
    }, [og, overlays]);

    const shuffleOrder = useCallback(() => {
        const next = [...og.overlayGradientIds];
        shuffleUnderlayIdsInPlace(next, (performance.now() * 1000) ^ (next.length * 0x9e3779b9));
        og.setOverlayGradientIds(next);
    }, [og]);

    const removeGradientId = useCallback(
        (id: number) => {
            og.setOverlayGradientIds(og.overlayGradientIds.filter((x) => x !== id));
        },
        [og],
    );

    const moveGradientId = useCallback(
        (index: number, dir: -1 | 1) => {
            const arr = [...og.overlayGradientIds];
            const j = index + dir;
            if (j < 0 || j >= arr.length) {
                return;
            }
            const t = arr[index]!;
            arr[index] = arr[j]!;
            arr[j] = t;
            og.setOverlayGradientIds(arr);
        },
        [og],
    );

    const replaceGradientIdAt = useCallback(
        (index: number, newId: number) => {
            const oldId = og.overlayGradientIds[index];
            if (oldId === undefined || oldId === newId) {
                return;
            }
            const next = [...og.overlayGradientIds];
            next[index] = newId;
            og.setOverlayGradientIds(next);
            setReplaceOpenIndex(null);
        },
        [og],
    );

    return (
        <div className="map-editor-panel flex min-h-0 flex-1 flex-col">
            <CardHeader className="space-y-1.5 border-b border-border bg-muted/20 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold tracking-tight text-foreground">Overlays</CardTitle>
                    <Badge
                        variant="outline"
                        className="h-5 border-border px-2 font-mono text-[10px] font-normal tabular-nums"
                        title={
                            swatchFilter === "all"
                                ? `${overlays.length} overlays`
                                : `${filteredOverlays.length} shown (${overlays.length} total)`
                        }
                    >
                        {swatchFilter === "all" ? overlays.length : `${filteredOverlays.length}/${overlays.length}`}
                    </Badge>
                </div>
                <div className="flex gap-0.5 rounded-md border border-border bg-background/80 p-0.5">
                    {(
                        [
                            ["swatches", "Swatches"] as const,
                            ["gradient", "Gradient"] as const,
                        ] as const
                    ).map(([id, label]) => (
                        <Button
                            key={id}
                            type="button"
                            size="sm"
                            variant={overlayPanelTabEx === id ? "secondary" : "ghost"}
                            className={cn("h-7 flex-1 text-[11px] font-medium", overlayPanelTabEx === id && "ring-1 ring-primary/35")}
                            onClick={() => setTab(id)}
                        >
                            {label}
                        </Button>
                    ))}
                </div>
                {overlayPanelTabEx === "swatches" ? (
                    <>
                        <div className="rounded-md border border-primary/35 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-foreground" role="status">
                            <span className="text-muted-foreground">Active overlay: </span>
                            <span className="font-mono tabular-nums text-primary">
                                {selectedOverlayId === -1 ? "None" : `#${selectedOverlayId}`}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Show swatches</span>
                            <div className="flex flex-wrap gap-1">
                                {(
                                    [
                                        ["all", "All"] as const,
                                        ["textured", "Textured"] as const,
                                        ["plain", "Non-textured"] as const,
                                    ] as const
                                ).map(([value, label]) => (
                                    <Button
                                        key={value}
                                        type="button"
                                        size="sm"
                                        variant={swatchFilter === value ? "secondary" : "outline"}
                                        className={cn("h-7 flex-1 min-w-[4.5rem] px-2 text-[11px] font-medium", swatchFilter === value && "ring-1 ring-primary/40")}
                                        aria-pressed={swatchFilter === value}
                                        onClick={() => setSwatchFilter(value)}
                                    >
                                        {label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="rounded-md border border-muted bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                        Gradient mode paints from a generated overlay palette.
                    </div>
                )}
            </CardHeader>
            <Separator />
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                {overlayPanelTabEx === "swatches" ? (
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="map-editor-swatch-grid grid gap-1.5 p-3">
                            <button
                                type="button"
                                onClick={setNoOverlay}
                                className={cn(
                                    "map-editor-swatch group relative flex aspect-square min-h-[2.5rem] flex-col items-center justify-center rounded-md border-2 border-dashed transition-all",
                                    "border-muted-foreground/25 bg-muted/30 text-muted-foreground",
                                    "hover:border-muted-foreground/45 hover:bg-muted/50",
                                    isNoOverlaySelected &&
                                        "border-primary border-solid bg-primary/15 text-foreground ring-4 ring-primary/70 ring-offset-2 ring-offset-background",
                                )}
                            >
                                {isNoOverlaySelected ? (
                                    <span className="absolute left-1 top-1 z-[2] flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                                        <Check className="size-3 stroke-[3]" aria-hidden />
                                    </span>
                                ) : null}
                                <span className="text-base font-light leading-none">-</span>
                                <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wide">None</span>
                            </button>
                            {filteredOverlays.map((overlay) => {
                                const rgb = overlay.getRgb();
                                const cssBg = rgbToCss(rgb);
                                const previewUrl = texturePreviewById.get(overlay.id) ?? null;
                                const useTexturePreview = previewUrl !== null && overlay.textureId >= 0;
                                const missingTextureRaster = overlay.textureId >= 0 && previewUrl === null;
                                const isSelected = overlay.id === selectedOverlayId;

                                return (
                                    <button
                                        key={overlay.id}
                                        type="button"
                                        title={`Overlay ${overlay.id}${overlay.name ? ` - ${overlay.name}` : ""}`}
                                        onClick={() => {
                                            overlayToolData.selectPrimary?.(host, overlay.id);
                                            setSelectedOverlayId(overlay.id);
                                        }}
                                        className={cn(
                                            "map-editor-swatch group relative aspect-square min-h-[2.5rem] overflow-hidden rounded-md border-2 transition-all",
                                            "border-border/80 hover:border-primary/40",
                                            isSelected
                                                ? "border-primary ring-4 ring-primary/80 ring-offset-2 ring-offset-background"
                                                : "hover:ring-1 hover:ring-primary/15",
                                        )}
                                        style={{ backgroundColor: useTexturePreview ? "var(--muted)" : cssBg }}
                                    >
                                        {isSelected ? (
                                            <span className="absolute left-1 top-1 z-[2] flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                                                <Check className="size-3 stroke-[3]" aria-hidden />
                                            </span>
                                        ) : null}
                                        {useTexturePreview && previewUrl ? (
                                            <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" draggable={false} />
                                        ) : null}
                                        {missingTextureRaster ? (
                                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-0.5 text-center text-[8px] font-medium leading-tight text-muted-foreground">
                                                No preview
                                            </span>
                                        ) : null}
                                        <span className="absolute bottom-0.5 right-0.5 z-[1] rounded border border-border/60 bg-background/90 px-0.5 py-px font-mono text-[9px] font-medium tabular-nums leading-none text-foreground">
                                            {overlay.id}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </ScrollArea>
                ) : (
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="space-y-2 p-2">
                            <div className="flex flex-wrap items-end gap-1.5">
                                <div className="flex min-w-[8rem] flex-1 flex-col gap-0.5">
                                    <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">Base overlay</Label>
                                    <Popover open={basePickerOpen} onOpenChange={setBasePickerOpen}>
                                        <PopoverTrigger asChild>
                                            <Button type="button" variant="outline" className="h-8 w-full justify-start gap-1.5 px-1.5 font-normal">
                                                <span
                                                    className="size-6 shrink-0 rounded border border-border"
                                                    style={{ backgroundColor: baseOverlay ? rgbToCss(baseOverlay.getRgb()) : "var(--muted)" }}
                                                />
                                                <span className="min-w-0 flex-1 truncate text-left font-mono text-[11px] tabular-nums text-foreground">
                                                    #{og.overlayGradientBaseOverlayId}
                                                </span>
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80 p-2" align="start">
                                            <p className="mb-2 text-xs font-medium text-foreground">Pick base overlay</p>
                                            <ScrollArea className="h-48">
                                                <div className="map-editor-swatch-grid grid gap-1 pr-2">
                                                    {overlays.map((o) => {
                                                        const previewUrl = texturePreviewById.get(o.id) ?? null;
                                                        return (
                                                            <button
                                                                key={o.id}
                                                                type="button"
                                                                className={cn(
                                                                    "map-editor-swatch relative aspect-square min-h-8 overflow-hidden rounded-md border-2 border-border/80 hover:border-primary/50",
                                                                    o.id === og.overlayGradientBaseOverlayId && "ring-2 ring-primary ring-offset-2 ring-offset-popover",
                                                                )}
                                                                style={{ backgroundColor: rgbToCss(o.getRgb()) }}
                                                                onClick={() => {
                                                                    og.setOverlayGradientBaseOverlayId(o.id);
                                                                    setBasePickerOpen(false);
                                                                }}
                                                            >
                                                                {previewUrl ? <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" /> : null}
                                                                <span className="absolute bottom-0.5 right-0.5 rounded bg-background/90 px-0.5 font-mono text-[8px]">
                                                                    {o.id}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </ScrollArea>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div className="flex shrink-0 items-end gap-1">
                                    <Button type="button" size="sm" variant="secondary" className="h-8 gap-1 px-2 text-[11px]" onClick={findSimilarSorted}>
                                        <Wand2 className="size-3.5 shrink-0" />
                                        Generate
                                    </Button>
                                    <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={() => og.bumpOverlayGradientPaintSeed()}>
                                        Phase
                                    </Button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                <div className="flex flex-col gap-1">
                                    <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">Palette size ({og.overlayGradientPaletteSize})</Label>
                                    <input
                                        type="range"
                                        min={2}
                                        max={24}
                                        value={og.overlayGradientPaletteSize}
                                        onChange={(e) => og.setOverlayGradientPaletteSize(Number(e.target.value))}
                                        className="h-2 w-full accent-primary"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">Pool ({og.overlayGradientCandidatePool})</Label>
                                    <input
                                        type="range"
                                        min={8}
                                        max={64}
                                        value={og.overlayGradientCandidatePool}
                                        onChange={(e) => og.setOverlayGradientCandidatePool(Number(e.target.value))}
                                        className="h-2 w-full accent-primary"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">Pattern when painting</Label>
                                <select
                                    className="h-8 rounded-md border border-border bg-background px-2 text-[11px]"
                                    value={og.overlayGradientPattern}
                                    onChange={(e) => og.setOverlayGradientPattern(e.target.value as UnderlayGradientPattern)}
                                >
                                    {UNDERLAY_GRADIENT_PATTERNS.map((p) => (
                                        <option key={p} value={p}>
                                            {underlayGradientPatternLabel(p)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={randomMix}>
                                    <Sparkles className="size-3.5" />
                                    Random mix
                                </Button>
                                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={shuffleOrder}>
                                    <Shuffle className="size-3.5" />
                                    Shuffle
                                </Button>
                            </div>
                            <div className="flex min-h-8 flex-wrap gap-0.5 rounded-md border border-border bg-muted/20 p-1">
                                {gradientIds.map((id, i) => {
                                    const o = overlayById.get(id);
                                    const bg = o ? rgbToCss(o.getRgb()) : "#333";
                                    return <div key={`strip-${i}`} className="size-6 rounded-sm border border-border/80" style={{ backgroundColor: bg }} />;
                                })}
                                {gradientIds.length === 0 ? <span className="px-2 py-1 text-[10px] text-muted-foreground">No palette yet</span> : null}
                            </div>
                            <Separator />
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Palette order</p>
                            <ul className="space-y-1.5">
                                {gradientIds.map((id, index) => {
                                    const o = overlayById.get(id);
                                    const bg = o ? rgbToCss(o.getRgb()) : "#333";
                                    const previewUrl = o ? texturePreviewById.get(o.id) ?? null : null;
                                    return (
                                        <li key={`row-${index}`} className="flex items-center gap-1.5 rounded-md border border-border/80 bg-card/50 px-1.5 py-1">
                                            <div className="relative size-8 shrink-0 rounded border border-border" style={{ backgroundColor: bg }}>
                                                {previewUrl ? <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full rounded object-cover opacity-80" /> : null}
                                            </div>
                                            <span className="min-w-0 flex-1 font-mono text-xs tabular-nums text-foreground">#{id}</span>
                                            <div className="flex shrink-0 items-center gap-0.5">
                                                <Button type="button" size="sm" variant="ghost" className="size-7 p-0" disabled={index === 0} onClick={() => moveGradientId(index, -1)}>
                                                    <ArrowUp className="size-3.5" />
                                                </Button>
                                                <Button type="button" size="sm" variant="ghost" className="size-7 p-0" disabled={index === gradientIds.length - 1} onClick={() => moveGradientId(index, 1)}>
                                                    <ArrowDown className="size-3.5" />
                                                </Button>
                                                <Popover open={replaceOpenIndex === index} onOpenChange={(open) => setReplaceOpenIndex(open ? index : null)}>
                                                    <PopoverTrigger asChild>
                                                        <Button type="button" size="sm" variant="secondary" className="h-7 px-2 text-[10px]">
                                                            Swap
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-80 p-2" align="end">
                                                        <p className="mb-2 text-xs font-medium text-foreground">Replace with...</p>
                                                        <ScrollArea className="h-48">
                                                            <div className="map-editor-swatch-grid grid gap-1 pr-2">
                                                                {overlays.map((f) => {
                                                                    const preview = texturePreviewById.get(f.id) ?? null;
                                                                    return (
                                                                        <button
                                                                            key={f.id}
                                                                            type="button"
                                                                            className="map-editor-swatch relative aspect-square min-h-8 overflow-hidden rounded-md border-2 border-border/80 hover:border-primary/50"
                                                                            style={{ backgroundColor: rgbToCss(f.getRgb()) }}
                                                                            onClick={() => replaceGradientIdAt(index, f.id)}
                                                                        >
                                                                            {preview ? <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" /> : null}
                                                                            <span className="absolute bottom-0.5 right-0.5 rounded bg-background/90 px-0.5 font-mono text-[8px]">{f.id}</span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </ScrollArea>
                                                    </PopoverContent>
                                                </Popover>
                                                <Button type="button" size="sm" variant="ghost" className="size-7 p-0 text-destructive hover:text-destructive" onClick={() => removeGradientId(id)}>
                                                    <X className="size-3.5" />
                                                </Button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </ScrollArea>
                )}
            </CardContent>
        </div>
    );
}

export const OverlayEditorToolPanel = memo(OverlayEditorToolPanelInner);

export const overlayEditorTool: EditorToolPlugin = {
    id: "overlay",
    name: "Overlay",
    description:
        "Paint overlay floors on tiles. Use the Overlays panel to pick a type. Fill/target modes are controlled by held keybinds.",
    icon: LayoutGrid,
    workspaces: [
        { panelId: "editor-overlays", activateTab: true },
        { panelId: "editor-underlays", activateTab: true },
    ],
    actions: [{ kind: "select-tool", tool: "overlay" }],
    data: overlayToolData,
    palettePanel: OverlayEditorToolPanel,
    keyBindings: [
        {
            id: "select-tool",
            name: "Select Overlay tool",
            description: "Switch active paint tool to Overlay.",
            defaultChords: [{ code: "Digit2" }],
            action: ({ host }) => {
                host.setEditorTool("overlay");
            },
        },
        {
            id: "toggle-flood-mode",
            name: "Toggle fill mode",
            description: "Enable same-id flood fill while Ctrl+Shift or Ctrl+Alt is held.",
            defaultChords: [
                { code: ["ControlLeft", "ShiftLeft"] },
                { code: ["ControlRight", "ShiftRight"] },
                { code: ["ControlLeft", "AltLeft"] },
                { code: ["ControlRight", "AltRight"] },
            ],
            trigger: "HELD",
            shouldProcess: ({ host }) => host.getEditorTool() === "overlay",
            action: () => true,
        },
        {
            id: "toggle-target-mode",
            name: "Hold target mode",
            description: "Restrict to overlay footprint while Ctrl is held.",
            defaultChords: [{ code: "ControlLeft" }, { code: "ControlRight" }],
            trigger: "HELD",
            shouldProcess: ({ host }) => host.getEditorTool() === "overlay",
            action: () => true,
        },
    ],
    paintPolicy: {
        resolveOverlayPaintTypeId: ({ host, worldX, worldY }) =>
            getOverlayGradientModel(host).resolvePaintTypeId(worldX, worldY, host.selectedOverlayId),
        getPaintModifiers: ({ host, input }) => {
            const floodHeldByKeybind = isEditorToolKeybindHeld(host, "overlay:toggle-flood-mode", [
                { code: ["ControlLeft", "ShiftLeft"] },
                { code: ["ControlRight", "ShiftRight"] },
                { code: ["ControlLeft", "AltLeft"] },
                { code: ["ControlRight", "AltRight"] },
            ]);
            const targetHeldByKeybind = isEditorToolKeybindHeld(host, "overlay:toggle-target-mode", [
                { code: "ControlLeft" },
                { code: "ControlRight" },
            ]);
            // Hard fallback so default behavior still works even if user keybind overrides are cleared/remapped.
            const targetHeld = targetHeldByKeybind || input.isControlDown();
            const floodHeld =
                floodHeldByKeybind ||
                (input.isControlDown() && (input.isShiftDown() || input.isAltDown()));
            return {
                overlayRestrictToFootprintWithControl: targetHeld || floodHeld,
                overlaySameIdFloodWithControlAlt: floodHeld,
            };
        },
    },
};
