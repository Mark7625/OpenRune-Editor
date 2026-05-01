ï»¿"use client";

import { Maximize2, Monitor, Search, SlidersHorizontal } from "lucide-react";
import * as React from "react";



import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { cn } from "../../lib/utils";
import { GameValGroupType } from "../../rs/config/gameval/GameValGroupType";
import { Interface } from "../../rs/config/gameval/impl/Interface";
import { RsInterface, RsInterfaceMode } from "./RsInterface";
import type { InterfaceViewer } from "./InterfaceViewer";

type InterfaceLegacyFilter = "all" | "new" | "legacy";

type Props = {
    viewer: InterfaceViewer;
};

const COMPONENT_TYPE_NAMES: Record<number, string> = {
    0: "Container",
    1: "Inventory",
    2: "Item Grid",
    3: "Rectangle",
    4: "Text",
    5: "Sprite",
    6: "Model",
    7: "Item Text",
    8: "Tooltip",
    9: "Line",
    10: "Unknown10",
    11: "Advanced Container",
    12: "Input",
};

function InterfaceViewerSettings({
    mode,
    setMode,
    showOverlays,
    setShowOverlays,
    showViewportBorder,
    setShowViewportBorder,
    showPixelGrid,
    setShowPixelGrid,
}: any) {
    const [viewportColor, setViewportColor] = React.useState("#171616");

    return (
        <div className="flex items-center gap-1">
            <Button
                size="icon-xs"
                variant={mode === "fixed" ? "default" : "outline"}
                onClick={() => setMode("fixed")}
            >
                <Monitor className="size-3.5" />
            </Button>

            <Button
                size="icon-xs"
                variant={mode === "fullscreen" ? "default" : "outline"}
                onClick={() => setMode("fullscreen")}
            >
                <Maximize2 className="size-3.5" />
            </Button>

            <details className="relative">
                <summary className="flex h-6 w-6 items-center justify-center rounded-md border bg-background cursor-pointer">
                    <SlidersHorizontal className="size-3.5" />
                </summary>

                <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border bg-popover p-2 text-xs shadow-md space-y-2">
                    <label className="flex items-center justify-between">
                        Viewport
                        <input
                            type="color"
                            value={viewportColor}
                            onChange={(e) => setViewportColor(e.target.value)}
                        />
                    </label>

                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={showOverlays}
                            onChange={(e) => setShowOverlays(e.target.checked)}
                        />
                        Overlays
                    </label>

                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={showViewportBorder}
                            onChange={(e) => setShowViewportBorder(e.target.checked)}
                        />
                        Border
                    </label>

                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={showPixelGrid}
                            onChange={(e) => setShowPixelGrid(e.target.checked)}
                        />
                        Grid
                    </label>
                </div>
            </details>
        </div>
    );
}

export function InterfaceViewerContainer({ viewer }: Props) {
    const [search, setSearch] = React.useState("");
    const [selectedId, setSelectedId] = React.useState<number | null>(null);
    const [mode, setMode] = React.useState<RsInterfaceMode>("fixed");
    const [legacyFilter, setLegacyFilter] = React.useState<InterfaceLegacyFilter>("all");

    const [showOverlays, setShowOverlays] = React.useState(true);
    const [showViewportBorder, setShowViewportBorder] = React.useState(true);
    const [showPixelGrid, setShowPixelGrid] = React.useState(false);

    const [interactiveMode, setInteractiveMode] = React.useState(false);
    const [componentPanelView, setComponentPanelView] = React.useState<"tree" | "simulate">("tree");

    const gamevals = viewer.gamevals;


    const interfaces = React.useMemo(() => {
        const raw = gamevals?.get(GameValGroupType.IFTYPES);
        return (
            raw?.map((i: any) => ({
                id: i.id,
                name: i.name,
                lower: i.name.toLowerCase(),
            })) ?? []
        );
    }, [gamevals]);

    const selectedInterface = React.useMemo(() => {
        if (selectedId == null) return null;
        return viewer.interfaces?.[selectedId] ?? null;
    }, [selectedId, viewer.interfaces]);

    const selectedMeta = React.useMemo(() => {
        if (!gamevals || selectedId == null) return null;
        return gamevals.getById<Interface>(GameValGroupType.IFTYPES, selectedId);
    }, [gamevals, selectedId]);


    const interfaceMetaMap = React.useMemo(() => {
        const map = new Map<number, { legacy: boolean; v3: boolean }>();

        const interfaces = viewer.interfaces;
        if (!interfaces) return map;

        for (const id in interfaces) {
            const iface = interfaces[Number(id)];
            const components = iface?.components;

            const first = components ? (Object.values(components)[0] as any) : null;

            const v3 = first?.v3 === true;

            map.set(Number(id), {
                v3,
                legacy: !v3,
            });
        }

        return map;
    }, [viewer.interfaces]);

    const isLegacy = interfaceMetaMap.get(selectedId ?? -1)?.legacy ?? false;

    const filteredInterfaces = React.useMemo(() => {
        const q = search.toLowerCase();

        return interfaces.filter((i) => {
            const matchesSearch = !q || i.lower.includes(q) || String(i.id).includes(q);

            const legacy = interfaceMetaMap.get(i.id)?.legacy ?? false;

            const matchesLegacy =
                legacyFilter === "all" ||
                (legacyFilter === "legacy" && legacy) ||
                (legacyFilter === "new" && !legacy);

            return matchesSearch && matchesLegacy;
        });
    }, [interfaces, search, legacyFilter, interfaceMetaMap]);

    const components = selectedInterface?.components;

    const grouped = React.useMemo(() => {
        if (!components) return null;

        const list = Object.values(components) as any[];

        const containers = list
            .filter((c) => c.type === 0)
            .sort((a, b) => a.internalId - b.internalId);

        const children = new Map<number, any[]>();

        for (const c of list) {
            if (c.type === 0 || c.layer == null) continue;
            if (!children.has(c.layer)) children.set(c.layer, []);
            children.get(c.layer)!.push(c);
        }

        return { containers, children };
    }, [components]);

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* LEFT */}
            <aside className="w-64 border-r flex flex-col text-xs">
                <div className="flex items-center justify-between border-b px-3 py-2">
                    <span className="font-semibold text-sm">Interfaces</span>

                    <InterfaceViewerSettings
                        mode={mode}
                        setMode={setMode}
                        showOverlays={showOverlays}
                        setShowOverlays={setShowOverlays}
                        showViewportBorder={showViewportBorder}
                        setShowViewportBorder={setShowViewportBorder}
                        showPixelGrid={showPixelGrid}
                        setShowPixelGrid={setShowPixelGrid}
                    />
                </div>

                <div className="border-b p-2 flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
                        <Input
                            className="h-7 pl-7 text-xs"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <select
                        className="h-7 w-[100px] border rounded-md bg-background text-[11px]"
                        value={legacyFilter}
                        onChange={(e) => setLegacyFilter(e.target.value as InterfaceLegacyFilter)}
                    >
                        <option value="all">All</option>
                        <option value="new">New</option>
                        <option value="legacy">Legacy</option>
                    </select>
                </div>

                <div className="flex-1 overflow-auto">
                    {filteredInterfaces.map((i) => (
                        <button
                            key={i.id}
                            onClick={() => setSelectedId(i.id)}
                            className={cn(
                                "w-full text-left px-3 py-1 border-b hover:bg-muted/40",
                                selectedId === i.id && "bg-muted",
                            )}
                        >
                            <span className="font-mono text-muted-foreground mr-2">{i.id}</span>
                            {i.name}
                        </button>
                    ))}
                </div>

                <div className="border-t px-3 py-2 text-center text-[10px] text-muted-foreground">
                    Showing {filteredInterfaces.length} of {interfaces.length} interfaces
                </div>

            </aside>

            {/* MAIN */}
            <main className="flex-1 flex flex-col bg-black/80">
                <div className="border-b px-4 py-2 text-xs flex items-center gap-2">
                    {selectedId != null ? (
                        <>
                            <span className="font-mono">{selectedId}</span>
                            <span>{interfaces.find((i) => i.id === selectedId)?.name}</span>

                            {/* Legacy / new badge from decoded interface shape */}
                            {selectedMeta && (
                                <span
                                    className={cn(
                                        "text-[10px] px-1 rounded border",
                                        isLegacy
                                            ? "text-yellow-300 border-yellow-500/40"
                                            : "text-green-300 border-green-500/40",
                                    )}
                                >
                                    {isLegacy ? "Legacy" : "New"}
                                </span>
                            )}

                            <span className="ml-auto text-muted-foreground">
                                {mode === "fixed" ? "Fixed 512 × 334" : "Resizable"}
                            </span>

                            <Button
                                size="sm"
                                variant={interactiveMode ? "default" : "outline"}
                                className="ml-2 h-7"
                                onClick={() => setInteractiveMode((v) => !v)}
                            >
                                Interactive
                            </Button>
                        </>
                    ) : (
                        <span>Select an interface</span>
                    )}
                </div>

                <div className="flex min-h-0 flex-1 items-center justify-center bg-black/80 p-4">
                    {selectedId != null ? (
                        <RsInterface
                            interfaceId={selectedId}
                            mode={mode}
                            interfaceData={selectedInterface}
                            revision={236}
                            viewportColor={"#000000"}
                            showOverlays={showOverlays}
                            showViewportBorder={showViewportBorder}
                            showPixelGrid={showPixelGrid}
                            selectedComponentId={0}
                            selectedComponent={selectedInterface?.components[0]}
                            interactiveMode={false}
                            className={mode === "resizable" ? "h-full w-full" : "shrink-0"}
                        />
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Select an interface to preview it here.
                        </p>
                    )}
                </div>
            </main>

            {/* RIGHT */}
            <aside className="w-80 border-l flex flex-col text-xs">
                <div className="border-b px-3 py-2">
                    <div className="mb-2 font-semibold">Components</div>

                    {/* Tabs restored */}
                    <div className="flex gap-1">
                        <Button
                            size="sm"
                            variant={componentPanelView === "tree" ? "default" : "outline"}
                            className="h-7 flex-1 text-[11px]"
                            onClick={() => setComponentPanelView("tree")}
                        >
                            Tree
                        </Button>

                        <Button
                            size="sm"
                            variant={componentPanelView === "simulate" ? "default" : "outline"}
                            className="h-7 flex-1 text-[11px]"
                            onClick={() => setComponentPanelView("simulate")}
                        >
                            CS2
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    {!grouped ? (
                        <div className="p-3 text-muted-foreground">Select an interface</div>
                    ) : componentPanelView === "tree" ? (
                        grouped.containers.flatMap((c) => {
                            const kids = grouped.children.get(c.internalId) ?? [];

                            const containerName =
                                interfaces.find((i) => i.id === c.internalId)?.name ?? "";

                            return [
                                <div
                                    key={`c-${c.internalId}`}
                                    className="flex items-center justify-between border-b px-3 py-1"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-muted-foreground">
                                            #{c.internalId}
                                        </span>
                                        <span>-</span>
                                        <span className="font-medium">
                                            {COMPONENT_TYPE_NAMES[c.type]}
                                        </span>
                                        <span>-</span>
                                        <span className="text-muted-foreground">
                                            {containerName}
                                        </span>
                                    </div>
                                </div>,

                                ...kids.map((k) => {
                                    const typeName =
                                        COMPONENT_TYPE_NAMES[k.type] ?? `Type ${k.type}`;

                                    const childName =
                                        interfaces.find((i) => i.id === k.child)?.name ?? "";

                                    return (
                                        <div
                                            key={`k-${k.internalId}`}
                                            className="flex items-center justify-between border-b px-3 py-1 pl-8"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-muted-foreground">
                                                    #{k.child}
                                                </span>
                                                <span>-</span>
                                                <span className="font-medium">{typeName}</span>
                                                <span>-</span>
                                                <span className="text-muted-foreground">
                                                    {childName}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                }),
                            ];
                        })
                    ) : (
                        <div className="p-3 text-muted-foreground">CS2 view not implemented</div>
                    )}
                </div>
            </aside>
        </div>
    );
}
