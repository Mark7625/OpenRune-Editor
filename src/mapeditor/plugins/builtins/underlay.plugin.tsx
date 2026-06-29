import { memo, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, Check, Layers2, Shuffle, Sparkles, Wand2, X } from "lucide-react";

import type { EditorToolPlugin, MapEditorPalettePanelProps } from "./builtin-plugin-types";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Label } from "../../../components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { Separator } from "../../../components/ui/separator";
import { cn } from "../../../util/cn";
import "../../MapEditorPanel.css";
import type { UnderlayFloorType } from "../../../rs/config/floortype/UnderlayFloorType";
import { getUnderlayGradientModel } from "./underlay-gradient-model";
import {
    UNDERLAY_GRADIENT_PATTERNS,
    shuffleUnderlayIdsInPlace,
    underlayGradientPatternLabel,
    type UnderlayGradientPattern,
    type UnderlayPanelTab,
} from "../../map-editor-underlay-gradient";
import { isEditorToolKeybindHeld } from "../../editor-tool-input";

function rgbToCss(rgb: number): string {
    const r = rgb >> 16;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    return `rgb(${r}, ${g}, ${b})`;
}

function UnderlayEditorToolPanelInner({ pluginHost: host }: MapEditorPalettePanelProps): JSX.Element {
    const workbenchSnap = useSyncExternalStore(
        host.subscribeWorkbenchPlugins,
        host.getWorkbenchPluginsStateSnapshot,
        host.getWorkbenchPluginsStateSnapshot,
    );
    const [selectedUnderlayId, setSelectedUnderlayId] = useState<number>(host.selectedUnderlayId);
    const [basePickerOpen, setBasePickerOpen] = useState(false);
    const [replaceOpenIndex, setReplaceOpenIndex] = useState<number | null>(null);

    useEffect(() => {
        setSelectedUnderlayId(host.selectedUnderlayId);
    }, [host, workbenchSnap]);

    const ug = getUnderlayGradientModel(host);
    const underlays = useMemo((): UnderlayFloorType[] => {
        const list: UnderlayFloorType[] = [];
        for (let i = 0; i < host.underlayTypeLoader.getCount(); i++) {
            list.push(host.underlayTypeLoader.load(i) as UnderlayFloorType);
        }
        return list;
    }, [host.underlayTypeLoader]);
    const underlayById = useMemo(() => new Map(underlays.map((u) => [u.id, u])), [underlays]);

    const panelTab = ug.underlayPanelTab;
    const gradientIds = ug.underlayGradientIds;
    const baseUnderlay = underlayById.get(ug.underlayGradientBaseUnderlayId);
    const [underlayPanelTabEx, setUnderlayPanelTabEx] = useState<UnderlayPanelTab>(panelTab);

    const setTab = useCallback(
        (tab: UnderlayPanelTab) => {
            setUnderlayPanelTabEx(tab);
            ug.setUnderlayPanelTab(tab);
        },
        [ug],
    );
    const findSimilarSorted = useCallback(() => {
        ug.setUnderlayGradientIds(ug.pickSimilarSorted(underlays));
    }, [ug, underlays]);
    const randomMix = useCallback(() => {
        ug.bumpUnderlayGradientMixSeed();
        ug.setUnderlayGradientIds(ug.pickSimilarMixed(underlays));
    }, [ug, underlays]);
    const shuffleOrder = useCallback(() => {
        const next = [...ug.underlayGradientIds];
        shuffleUnderlayIdsInPlace(next, (performance.now() * 1000) ^ (next.length * 0x9e3779b9));
        ug.setUnderlayGradientIds(next);
    }, [ug]);
    const removeGradientId = useCallback(
        (id: number) => {
            ug.setUnderlayGradientIds(ug.underlayGradientIds.filter((x) => x !== id));
        },
        [ug],
    );
    const moveGradientId = useCallback(
        (index: number, dir: -1 | 1) => {
            const arr = [...ug.underlayGradientIds];
            const j = index + dir;
            if (j < 0 || j >= arr.length) {
                return;
            }
            const t = arr[index]!;
            arr[index] = arr[j]!;
            arr[j] = t;
            ug.setUnderlayGradientIds(arr);
        },
        [ug],
    );
    const replaceGradientIdAt = useCallback(
        (index: number, newId: number) => {
            const oldId = ug.underlayGradientIds[index];
            if (oldId === undefined || oldId === newId) {
                return;
            }
            const next = [...ug.underlayGradientIds];
            next[index] = newId;
            ug.setUnderlayGradientIds(next);
            setReplaceOpenIndex(null);
        },
        [ug],
    );

    return (
        <div className="map-editor-panel flex min-h-0 flex-1 flex-col">
            <CardHeader className="space-y-1.5 border-b border-border bg-muted/20 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold tracking-tight text-foreground">Underlays</CardTitle>
                    <Badge variant="outline" className="h-5 border-border px-2 font-mono text-[10px] font-normal tabular-nums">
                        {underlays.length}
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
                            variant={underlayPanelTabEx === id ? "secondary" : "ghost"}
                            className={cn("h-7 flex-1 text-[11px] font-medium", underlayPanelTabEx === id && "ring-1 ring-primary/35")}
                            onClick={() => setTab(id)}
                        >
                            {label}
                        </Button>
                    ))}
                </div>
                {underlayPanelTabEx === "swatches" ? (
                    <div className="rounded-md border border-primary/35 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-foreground">
                        <span className="text-muted-foreground">Active underlay: </span>
                        <span className="font-mono tabular-nums text-primary">#{selectedUnderlayId}</span>
                    </div>
                ) : (
                    <div className="rounded-md border border-muted bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                        Gradient mode paints from a generated underlay palette.
                    </div>
                )}
            </CardHeader>
            <Separator />
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                {underlayPanelTabEx === "swatches" ? (
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="map-editor-swatch-grid grid gap-1.5 p-3">
                            {underlays.map((underlay) => {
                                const rgb = underlay.getRgb();
                                const cssBg = rgbToCss(rgb);
                                const isSelected = underlay.id === selectedUnderlayId;
                                return (
                                    <button
                                        key={underlay.id}
                                        type="button"
                                        title={`Underlay ${underlay.id}`}
                                        onClick={() => {
                                            host.selectedUnderlayId = underlay.id;
                                            host.setEditorTool("underlay");
                                            setSelectedUnderlayId(underlay.id);
                                        }}
                                        className={cn(
                                            "map-editor-swatch group relative aspect-square min-h-[2.5rem] overflow-hidden rounded-md border-2 transition-all",
                                            "border-border/80 hover:border-primary/40",
                                            isSelected
                                                ? "border-primary ring-4 ring-primary/80 ring-offset-2 ring-offset-background"
                                                : "hover:ring-1 hover:ring-primary/15",
                                        )}
                                        style={{ backgroundColor: cssBg }}
                                    >
                                        {isSelected ? (
                                            <span className="absolute left-1 top-1 z-[2] flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                                                <Check className="size-3 stroke-[3]" aria-hidden />
                                            </span>
                                        ) : null}
                                        <span className="absolute bottom-0.5 right-0.5 z-[1] rounded bg-background/90 px-0.5 py-px font-mono text-[9px] font-medium tabular-nums leading-none text-foreground">
                                            {underlay.id}
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
                                    <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">Base underlay</Label>
                                    <Popover open={basePickerOpen} onOpenChange={setBasePickerOpen}>
                                        <PopoverTrigger asChild>
                                            <Button type="button" variant="outline" className="h-8 w-full justify-start gap-1.5 px-1.5 font-normal">
                                                <span
                                                    className="size-6 shrink-0 rounded border border-border"
                                                    style={{ backgroundColor: baseUnderlay ? rgbToCss(baseUnderlay.getRgb()) : "var(--muted)" }}
                                                />
                                                <span className="min-w-0 flex-1 truncate text-left font-mono text-[11px] tabular-nums text-foreground">
                                                    #{ug.underlayGradientBaseUnderlayId}
                                                </span>
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80 p-2" align="start">
                                            <p className="mb-2 text-xs font-medium text-foreground">Pick base underlay</p>
                                            <ScrollArea className="h-48">
                                                <div className="map-editor-swatch-grid grid gap-1 pr-2">
                                                    {underlays.map((u) => (
                                                        <button
                                                            key={u.id}
                                                            type="button"
                                                            className={cn(
                                                                "map-editor-swatch relative aspect-square min-h-8 overflow-hidden rounded-md border-2 border-border/80 hover:border-primary/50",
                                                                u.id === ug.underlayGradientBaseUnderlayId && "ring-2 ring-primary ring-offset-2 ring-offset-popover",
                                                            )}
                                                            style={{ backgroundColor: rgbToCss(u.getRgb()) }}
                                                            onClick={() => {
                                                                ug.setUnderlayGradientBaseUnderlayId(u.id);
                                                                setBasePickerOpen(false);
                                                            }}
                                                        >
                                                            <span className="absolute bottom-0.5 right-0.5 rounded bg-background/90 px-0.5 font-mono text-[8px]">
                                                                {u.id}
                                                            </span>
                                                        </button>
                                                    ))}
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
                                    <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-[11px]" onClick={() => ug.bumpUnderlayGradientPaintSeed()}>
                                        Phase
                                    </Button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                <div className="flex flex-col gap-1">
                                    <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">
                                        Palette size ({ug.underlayGradientPaletteSize})
                                    </Label>
                                    <input
                                        type="range"
                                        min={2}
                                        max={24}
                                        value={ug.underlayGradientPaletteSize}
                                        onChange={(e) => ug.setUnderlayGradientPaletteSize(Number(e.target.value))}
                                        className="h-2 w-full accent-primary"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">
                                        Pool ({ug.underlayGradientCandidatePool})
                                    </Label>
                                    <input
                                        type="range"
                                        min={8}
                                        max={64}
                                        value={ug.underlayGradientCandidatePool}
                                        onChange={(e) => ug.setUnderlayGradientCandidatePool(Number(e.target.value))}
                                        className="h-2 w-full accent-primary"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">Pattern when painting</Label>
                                <select
                                    className="h-8 rounded-md border border-border bg-background px-2 text-[11px]"
                                    value={ug.underlayGradientPattern}
                                    onChange={(e) => ug.setUnderlayGradientPattern(e.target.value as UnderlayGradientPattern)}
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
                                    const u = underlayById.get(id);
                                    const bg = u ? rgbToCss(u.getRgb()) : "#333";
                                    return <div key={`strip-${i}`} className="size-6 rounded-sm border border-border/80" style={{ backgroundColor: bg }} />;
                                })}
                                {gradientIds.length === 0 ? <span className="px-2 py-1 text-[10px] text-muted-foreground">No palette yet</span> : null}
                            </div>
                            <Separator />
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Palette order</p>
                            <ul className="space-y-1.5">
                                {gradientIds.map((id, index) => {
                                    const u = underlayById.get(id);
                                    const bg = u ? rgbToCss(u.getRgb()) : "#333";
                                    return (
                                        <li key={`row-${index}`} className="flex items-center gap-1.5 rounded-md border border-border/80 bg-card/50 px-1.5 py-1">
                                            <div className="size-8 shrink-0 rounded border border-border" style={{ backgroundColor: bg }} />
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
                                                                {underlays.map((f) => (
                                                                    <button
                                                                        key={f.id}
                                                                        type="button"
                                                                        className="map-editor-swatch relative aspect-square min-h-8 overflow-hidden rounded-md border-2 border-border/80 hover:border-primary/50"
                                                                        style={{ backgroundColor: rgbToCss(f.getRgb()) }}
                                                                        onClick={() => replaceGradientIdAt(index, f.id)}
                                                                    >
                                                                        <span className="absolute bottom-0.5 right-0.5 rounded bg-background/90 px-0.5 font-mono text-[8px]">{f.id}</span>
                                                                    </button>
                                                                ))}
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

export const UnderlayEditorToolPanel = memo(UnderlayEditorToolPanelInner);

export const underlayEditorTool: EditorToolPlugin = {
    id: "underlay",
    name: "Underlay",
    description: "Paint underlay floors with swatches or generated gradient palettes.",
    icon: Layers2,
    workspaces: [
        { panelId: "editor-underlays", activateTab: true },
        { panelId: "editor-overlays", activateTab: true },
    ],
    actions: [{ kind: "select-tool", tool: "underlay" }],
    data: {
        selectPrimary: (host, id) => {
            host.selectedUnderlayId = id;
            host.setEditorTool("underlay");
        },
    },
    palettePanel: UnderlayEditorToolPanel,
    keyBindings: [
        {
            id: "select-tool",
            name: "Select Underlay tool",
            description: "Switch active paint tool to Underlay.",
            defaultChords: [{ code: "Digit1" }],
            action: ({ host }) => {
                host.setEditorTool("underlay");
            },
        },
        {
            id: "toggle-gradient-phase",
            name: "Hold gradient phase modifier",
            description: "Reserved keybind for underlay gradient workflows.",
            defaultChords: [{ code: "ControlLeft" }, { code: "ControlRight" }],
            trigger: "HELD",
            shouldProcess: ({ host }) => host.getEditorTool() === "underlay",
            action: () => true,
        },
    ],
    paintPolicy: {
        resolveUnderlayPaintTypeId: ({ host, worldX, worldY }) =>
            getUnderlayGradientModel(host).resolvePaintTypeId(worldX, worldY, host.selectedUnderlayId),
        getPaintModifiers: ({ host }) => {
            const ctrlHeld = isEditorToolKeybindHeld(host, "underlay:toggle-gradient-phase", [
                { code: "ControlLeft" },
                { code: "ControlRight" },
            ]);
            return {
                overlayRestrictToFootprintWithControl: false,
                overlaySameIdFloodWithControlAlt: false,
                heightInvertWithAlt: false,
                controlWheelAdjustsBrushSize: !ctrlHeld,
            };
        },
    },
};
