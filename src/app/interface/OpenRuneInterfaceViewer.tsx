"use client";

import * as React from "react";
import { Monitor, Maximize2, Search, SlidersHorizontal, Copy, Check } from "lucide-react";

import { useCacheType } from "@/context/cache-type-context";
import { VARBITTYPES, useGamevals } from "@/context/gameval-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cacheProxyHeaders } from "@/lib/cache-proxy-client";
import { cn } from "@/lib/utils";
import { RsInterface, type RsInterfaceMode } from "@/components/ui/rs-interface";
import { adaptInterfaceEntryFromApi, type ComponentType, type InterfaceEntry } from "@/lib/interface-renderer/component-types";
import { openInterface, setCs1InterfaceEntry } from "@/lib/interface-renderer/interface-manager";
import { applyCs2RuntimeFromSim } from "@/lib/interface-renderer/cs2/runtime-context";
import { Cs1Interpreter } from "@/lib/interface-renderer/cs1-interpreter";
import {
  buildVarbitDefinitionMapFromGamevalExtras,
  mapToVarbitLookup,
} from "@/lib/interface-renderer/varbit-definition";
import { Cs1SimulatePanel } from "./cs1-simulate-panel";

type InterfaceManifestRow = {
  interfaceId: number;
  gameval: string | null;
  iflegacy: boolean | null;
};

type InterfaceManifestResponse = {
  rev: number;
  rows: InterfaceManifestRow[];
};

type InterfaceListEntry = {
  id: number;
  name: string;
  iflegacy: boolean | null;
};

type InterfaceLegacyFilter = "all" | "new" | "legacy";

type InterfaceViewerSettingsProps = {
  mode: RsInterfaceMode;
  setMode: React.Dispatch<React.SetStateAction<RsInterfaceMode>>;
  showOverlays: boolean;
  setShowOverlays: React.Dispatch<React.SetStateAction<boolean>>;
  showViewportBorder: boolean;
  setShowViewportBorder: React.Dispatch<React.SetStateAction<boolean>>;
  showPixelGrid: boolean;
  setShowPixelGrid: React.Dispatch<React.SetStateAction<boolean>>;
  onViewportColorChange: (color: string) => void;
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
  onViewportColorChange,
}: InterfaceViewerSettingsProps) {
  const [viewportColorInput, setViewportColorInput] = React.useState("#171616");
  const debouncedPickerColor = useDebouncedValue(viewportColorInput, 80);

  React.useEffect(() => {
    onViewportColorChange(debouncedPickerColor);
  }, [debouncedPickerColor, onViewportColorChange]);

  return (
    <div className="flex items-center gap-1">
      <Button
        size="icon-xs"
        variant={mode === "fixed" ? "default" : "outline"}
        title="Fixed mode (512×334)"
        onClick={() => setMode("fixed")}
      >
        <Monitor className="size-3.5" />
      </Button>
      <Button
        size="icon-xs"
        variant={mode === "resizable" ? "default" : "outline"}
        title="Resizable mode"
        onClick={() => setMode("resizable")}
      >
        <Maximize2 className="size-3.5" />
      </Button>
      <details className="group relative">
        <summary className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="size-3.5" />
        </summary>
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border bg-popover p-2 text-xs shadow-md">
          <label className="mb-2 flex items-center justify-between gap-2">
            <span>Viewport color</span>
            <input
              type="color"
              value={viewportColorInput}
              onChange={(e) => setViewportColorInput(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border bg-transparent p-0"
            />
          </label>
          <label className="mb-1 flex items-center gap-2">
            <input
              type="checkbox"
              checked={showOverlays}
              onChange={(e) => setShowOverlays(e.target.checked)}
            />
            <span>Show UI overlays</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showViewportBorder}
              onChange={(e) => setShowViewportBorder(e.target.checked)}
            />
            <span>Show viewport border</span>
          </label>
          <label className="mt-1 flex items-center gap-2">
            <input
              type="checkbox"
              checked={showPixelGrid}
              onChange={(e) => setShowPixelGrid(e.target.checked)}
            />
            <span>Pixel lines</span>
          </label>
        </div>
      </details>
    </div>
  );
}

type TreeNode = {
  id: number;
  runtimeId: number;
  type: number;
  dynamicCreated: boolean;
  nodeKey: string;
  component: ComponentType;
  children: TreeNode[];
};

function runtimeId(comp: ComponentType): number {
  return typeof comp.packedId === "number" ? comp.packedId : comp.id;
}

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

function componentTypeName(type: number): string {
  return COMPONENT_TYPE_NAMES[type] ?? `Type ${type}`;
}

function buildComponentTree(entry: InterfaceEntry | null, fallbackRootLayer: number): TreeNode[] {
  if (!entry) return [];
  const values: ComponentType[] = [];
  const seen = new Set<ComponentType>();
  const visit = (comp: ComponentType) => {
    if (seen.has(comp)) return;
    seen.add(comp);
    values.push(comp);
    if (Array.isArray(comp.children)) {
      for (const ch of comp.children) {
        if (ch) visit(ch);
      }
    }
  };
  for (const comp of Object.values(entry.components)) {
    visit(comp);
  }
  const byLayer = new Map<number, ComponentType[]>();
  for (const comp of values) {
    const arr = byLayer.get(comp.layer);
    if (arr) arr.push(comp);
    else byLayer.set(comp.layer, [comp]);
  }
  for (const arr of byLayer.values()) {
    arr.sort((a, b) => a.id - b.id);
  }

  const rootLayer = byLayer.has(-1) ? -1 : fallbackRootLayer;
  const visited = new Set<ComponentType>();

  const isDynamicCreated = (comp: ComponentType): boolean =>
    Boolean((comp as ComponentType & { __dynamicCreated?: boolean }).__dynamicCreated);

  const makeNode = (comp: ComponentType, keyPath: string): TreeNode => {
    const rid = runtimeId(comp);
    const node: TreeNode = {
      id: comp.id,
      runtimeId: rid,
      type: comp.type,
      dynamicCreated: isDynamicCreated(comp),
      nodeKey: keyPath,
      component: comp,
      children: [],
    };
    if (visited.has(comp)) return node;
    visited.add(comp);
    const children = byLayer.get(rid) ?? [];
    node.children = children.map((child, i) => makeNode(child, `${keyPath}.${i}`));
    return node;
  };

  return (byLayer.get(rootLayer) ?? []).map((root, i) => makeNode(root, `r${i}`));
}

function getRootWidgetV3(entry: InterfaceEntry, interfaceId: number): boolean | null {
  const values = Object.values(entry.components);
  const byLayer = new Map<number, ComponentType[]>();
  for (const comp of values) {
    const arr = byLayer.get(comp.layer);
    if (arr) arr.push(comp);
    else byLayer.set(comp.layer, [comp]);
  }
  for (const arr of byLayer.values()) {
    arr.sort((a, b) => a.id - b.id);
  }
  const rootLayer = byLayer.has(-1) ? -1 : interfaceId;
  const roots = byLayer.get(rootLayer) ?? [];
  const first = roots[0];
  return first ? first.v3 : null;
}

/** Pre-order flatten without deep recursion or `push(...hugeArray)` (both can exceed the call stack). */
function flattenTree(nodes: TreeNode[], depth = 0): Array<TreeNode & { depth: number }> {
  const out: Array<TreeNode & { depth: number }> = [];
  const stack: Array<{ node: TreeNode; depth: number }> = [];
  for (let i = nodes.length - 1; i >= 0; i--) {
    stack.push({ node: nodes[i]!, depth });
  }
  while (stack.length > 0) {
    const frame = stack.pop()!;
    out.push({ ...frame.node, depth: frame.depth });
    const ch = frame.node.children;
    for (let i = ch.length - 1; i >= 0; i--) {
      stack.push({ node: ch[i]!, depth: frame.depth + 1 });
    }
  }
  return out;
}

type JsonDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  componentData: ComponentType | null;
  componentId: number | null;
};

function JsonDialog({ open, onOpenChange, componentData, componentId }: JsonDialogProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(() => {
    if (componentData) {
      navigator.clipboard.writeText(JSON.stringify(componentData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [componentData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>
            Component {componentId ?? ""} JSON
          </DialogTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="size-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                Copy JSON
              </>
            )}
          </Button>
        </DialogHeader>
        <div className="flex-1 overflow-auto rounded border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap break-words">
          {componentData ? JSON.stringify(componentData, null, 2) : "No data"}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OpenRuneInterfaceViewer() {
  const { selectedCacheType, cacheStatuses } = useCacheType();
  const { loadGamevalType, hasLoaded, getGamevalExtras } = useGamevals();

  const revision = React.useMemo(() => {
    const status = cacheStatuses.get(selectedCacheType.id);
    return status?.statusResponse?.revision ?? "latest";
  }, [cacheStatuses, selectedCacheType.id]);

  React.useEffect(() => {
    void loadGamevalType(VARBITTYPES, revision);
  }, [loadGamevalType, revision]);
  const [manifestRows, setManifestRows] = React.useState<InterfaceManifestRow[]>([]);
  const [manifestLoading, setManifestLoading] = React.useState(false);
  const [manifestError, setManifestError] = React.useState<string | null>(null);
  const [legacyFilter, setLegacyFilter] = React.useState<InterfaceLegacyFilter>("all");

  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [mode, setMode] = React.useState<RsInterfaceMode>("fixed");
  const [viewportColor, setViewportColor] = React.useState("#171616");
  const [showOverlays, setShowOverlays] = React.useState(true);
  const [showViewportBorder, setShowViewportBorder] = React.useState(false);
  const [showPixelGrid, setShowPixelGrid] = React.useState(false);
  const [interactiveMode, setInteractiveMode] = React.useState(false);
  const [componentPanelView, setComponentPanelView] = React.useState<"tree" | "simulate">("tree");
  const [isInterfaceLoaded, setIsInterfaceLoaded] = React.useState(false);
  const [interfaceLoadError, setInterfaceLoadError] = React.useState<string | null>(null);
  const [interfaceData, setInterfaceData] = React.useState<InterfaceEntry | null>(null);
  const [selectedComponentNodeKey, setSelectedComponentNodeKey] = React.useState<string | null>(null);
  const [jsonDialogOpen, setJsonDialogOpen] = React.useState(false);
  const [jsonDialogComponentNodeKey, setJsonDialogComponentNodeKey] = React.useState<string | null>(null);
  const [cs1SimState, setCs1SimState] = React.useState(() => Cs1Interpreter.defaultState());

  const cs1VarbitDefinitionLookup = React.useMemo(() => {
    if (!hasLoaded(VARBITTYPES, revision)) return null;
    const extras = getGamevalExtras(VARBITTYPES, revision);
    if (!extras) return null;
    const map = buildVarbitDefinitionMapFromGamevalExtras(extras);
    return mapToVarbitLookup(map);
  }, [getGamevalExtras, hasLoaded, revision, selectedCacheType.id]);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setManifestLoading(true);
    setManifestError(null);
    setManifestRows([]);

    const rev = encodeURIComponent(String(revision));
    const url = `/api/cache-proxy/diff/interface/manifest?rev=${rev}`;
    void fetch(url, {
      method: "GET",
      headers: cacheProxyHeaders(selectedCacheType),
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load interface manifest (${res.status})`);
        const payload = (await res.json()) as InterfaceManifestResponse;
        if (cancelled) return;
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        setManifestRows(rows);
        setManifestLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setManifestRows([]);
        setManifestLoading(false);
        setManifestError(error instanceof Error ? error.message : "Failed to load interface manifest");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [revision, selectedCacheType]);

  const entries = React.useMemo<InterfaceListEntry[]>(
    () =>
      manifestRows
        .map((row) => ({
          id: row.interfaceId,
          name: row.gameval?.trim() || `Interface ${row.interfaceId}`,
          iflegacy: row.iflegacy,
        }))
        .sort((a, b) => a.id - b.id),
    [manifestRows],
  );

  React.useEffect(() => {
    if (selectedId == null) {
      setIsInterfaceLoaded(false);
      setInterfaceLoadError(null);
      setInterfaceData(null);
      setSelectedComponentNodeKey(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setIsInterfaceLoaded(false);
    setInterfaceLoadError(null);
    setInterfaceData(null);

    const rev = encodeURIComponent(String(revision));
    const url = `/api/cache-proxy/interface/${selectedId}?rev=${rev}`;

    void fetch(url, {
      method: "GET",
      headers: cacheProxyHeaders(selectedCacheType),
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load interface (${res.status})`);
        }
        const payload = await res.json() as InterfaceEntry;
        if (cancelled) return;
        const data = adaptInterfaceEntryFromApi(payload);
        setInterfaceData(data);
        if (selectedId != null) {
          setCs1InterfaceEntry(data);
          applyCs2RuntimeFromSim(
            cs1SimState,
            revision,
            cacheProxyHeaders(selectedCacheType),
            cs1VarbitDefinitionLookup,
            data,
          );
          await openInterface(1, selectedId, 1);
          // Trigger React update after on-load scripts mutate widget tree in place.
          setInterfaceData({ ...data, components: { ...data.components } });
        }
        setSelectedComponentNodeKey(null);
        setIsInterfaceLoaded(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setInterfaceData(null);
        setIsInterfaceLoaded(false);
        setInterfaceLoadError(error instanceof Error ? error.message : "Failed to load interface");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [revision, selectedCacheType, selectedId, cs1SimState, cs1VarbitDefinitionLookup]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (legacyFilter === "legacy" && e.iflegacy !== true) return false;
      if (legacyFilter === "new" && e.iflegacy !== false) return false;
      if (!q) return true;
      return e.name.toLowerCase().includes(q) || String(e.id).includes(q);
    });
  }, [entries, legacyFilter, search]);

  const componentTreeRows = React.useMemo(() => {
    if (!interfaceData || selectedId == null) return [];
    const tree = buildComponentTree(interfaceData, selectedId);
    return flattenTree(tree);
  }, [interfaceData, selectedId]);

  const rootWidgetV3 = React.useMemo(() => {
    if (!interfaceData || selectedId == null) return null;
    return getRootWidgetV3(interfaceData, selectedId);
  }, [interfaceData, selectedId]);

  const cs1ForCanvas = React.useMemo(() => {
    if (rootWidgetV3 !== false) return null;
    return cs1SimState;
  }, [rootWidgetV3, cs1SimState]);

  const treeNodeByKey = React.useMemo(() => {
    const map = new Map<string, TreeNode & { depth: number }>();
    for (const row of componentTreeRows) {
      map.set(row.nodeKey, row);
    }
    return map;
  }, [componentTreeRows]);

  const selectedTreeNode = React.useMemo(
    () => (selectedComponentNodeKey ? treeNodeByKey.get(selectedComponentNodeKey) ?? null : null),
    [selectedComponentNodeKey, treeNodeByKey],
  );
  const selectedComponent = selectedTreeNode?.component ?? null;
  const selectedComponentId = selectedTreeNode?.id ?? null;

  const handleComponentRightClick = React.useCallback(
    (e: React.MouseEvent, nodeKey: string) => {
      e.preventDefault();
      setJsonDialogComponentNodeKey(nodeKey);
      setJsonDialogOpen(true);
    },
    []
  );

  const jsonDialogComponentData = React.useMemo(
    () => (jsonDialogComponentNodeKey ? (treeNodeByKey.get(jsonDialogComponentNodeKey)?.component ?? null) : null),
    [jsonDialogComponentNodeKey, treeNodeByKey]
  );

  const listContent = React.useMemo(() => {
    if (manifestLoading) {
      return <div className="px-3 py-4 text-xs text-muted-foreground">Loading interfaces…</div>;
    }
    if (manifestError) {
      return (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          {manifestError}
        </div>
      );
    }
    if (entries.length === 0) {
      return <div className="px-3 py-4 text-xs text-muted-foreground">No interfaces in manifest.</div>;
    }
    if (filtered.length === 0) {
      return <div className="px-3 py-4 text-xs text-muted-foreground">No matches.</div>;
    }
    return filtered.map((entry) => (
      <button
        key={entry.id}
        type="button"
        onClick={() => setSelectedId(entry.id)}
        className={cn(
          "flex w-full items-center gap-2 border-b px-3 py-1.5 text-left text-xs hover:bg-muted/50",
          selectedId === entry.id && "bg-muted",
        )}
      >
        <span className="shrink-0 font-mono text-muted-foreground">{entry.id}</span>
        <span className="truncate">{entry.name}</span>
      </button>
    ));
  }, [entries.length, filtered, manifestError, manifestLoading, selectedId]);

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 overflow-hidden">
      {/* ------------------------------------------------------------------ */}
      {/* Sidebar                                                              */}
      {/* ------------------------------------------------------------------ */}
      <aside className="flex w-64 shrink-0 flex-col border-r bg-background">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold text-foreground">Interfaces</span>
          <InterfaceViewerSettings
            mode={mode}
            setMode={setMode}
            showOverlays={showOverlays}
            setShowOverlays={setShowOverlays}
            showViewportBorder={showViewportBorder}
            setShowViewportBorder={setShowViewportBorder}
            showPixelGrid={showPixelGrid}
            setShowPixelGrid={setShowPixelGrid}
            onViewportColorChange={setViewportColor}
          />
        </div>

        <div className="border-b px-2 py-2">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-7 pl-7 text-xs"
                placeholder="Search interfaces…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="h-7 w-[112px] rounded-md border border-input bg-background px-2 text-xs"
              value={legacyFilter}
              onChange={(e) => setLegacyFilter(e.target.value as InterfaceLegacyFilter)}
            >
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="legacy">Legacy</option>
            </select>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {listContent}
        </div>
        <div className="border-t px-2 py-1 text-center text-[10px] text-muted-foreground">
          Showing {filtered.length} of {entries.length}
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Viewer                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-3 border-b px-4 py-2 text-xs text-muted-foreground">
          {selectedId != null ? (
            <>
              <span className="font-mono font-semibold text-foreground">{selectedId}</span>
              <span>
                {entries.find((e) => e.id === selectedId)?.name ?? ""}
              </span>
              {rootWidgetV3 != null ? (
                <span
                  className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  title={rootWidgetV3 ? "IF3 interface (not legacy)" : "Legacy interface (pre-IF3)"}
                >
                  {rootWidgetV3 ? "Not legacy" : "Legacy"}
                </span>
              ) : null}
              <span className="ml-auto">
                {mode === "fixed" ? "Fixed  512 × 334" : "Resizable"}
              </span>
              {interfaceLoadError ? (
                <span className="ml-2 text-destructive">{interfaceLoadError}</span>
              ) : null}
              {selectedComponentId != null ? (
                <span className="ml-2 text-cyan-400">selected component {selectedComponentId}</span>
              ) : null}
              <Button
                type="button"
                variant={interactiveMode ? "default" : "outline"}
                size="sm"
                className="ml-2 h-7 text-xs"
                onClick={() => setInteractiveMode((v) => !v)}
              >
                Interactive mode
              </Button>
            </>
          ) : (
            <span>Select an interface from the list</span>
          )}
        </div>

        {/* Canvas */}
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/80 p-4">
          {selectedId != null ? (
            <RsInterface
              interfaceId={selectedId}
              mode={mode}
              isInterfaceLoaded={isInterfaceLoaded}
              interfaceData={interfaceData}
              revision={revision}
              cacheHeaders={cacheProxyHeaders(selectedCacheType)}
              viewportColor={viewportColor}
              showOverlays={showOverlays}
              showViewportBorder={showViewportBorder}
              showPixelGrid={showPixelGrid}
              selectedComponentId={selectedComponentId}
              selectedComponent={selectedComponent}
              interactiveMode={interactiveMode}
              cs1SimState={cs1ForCanvas}
              cs1VarbitDefinitionLookup={cs1VarbitDefinitionLookup}
              className={mode === "resizable" ? "h-full w-full" : "shrink-0"}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Select an interface to preview it here.
            </p>
          )}
        </div>
      </div>

      <aside className="flex w-80 shrink-0 flex-col border-l bg-background">
        <div className="border-b px-3 py-2">
          <div className="mb-2 text-sm font-semibold text-foreground">Components</div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={componentPanelView === "tree" ? "default" : "outline"}
              className="h-7 flex-1 px-1.5 text-[11px]"
              onClick={() => setComponentPanelView("tree")}
            >
              Component view
            </Button>
            <Button
              type="button"
              size="sm"
              variant={componentPanelView === "simulate" ? "default" : "outline"}
              className="h-7 flex-1 px-1.5 text-[11px]"
              onClick={() => setComponentPanelView("simulate")}
            >
              Client script simulate
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {componentPanelView === "tree" ? (
            !selectedId ? (
              <div className="px-3 py-4 text-xs text-muted-foreground">Select an interface first.</div>
            ) : !isInterfaceLoaded ? (
              <div className="px-3 py-4 text-xs text-muted-foreground">Loading component tree…</div>
            ) : componentTreeRows.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground">No component nodes found.</div>
            ) : (
              componentTreeRows.map((row) => (
                <button
                  key={row.nodeKey}
                  type="button"
                  onClick={() => setSelectedComponentNodeKey(row.nodeKey)}
                  onContextMenu={(e) => handleComponentRightClick(e, row.nodeKey)}
                  className={cn(
                    "flex w-full items-center gap-2 border-b px-3 py-1.5 text-left text-xs hover:bg-muted/50",
                    selectedComponentNodeKey === row.nodeKey && "bg-cyan-500/10",
                  )}
                  style={{ paddingLeft: `${12 + row.depth * 14}px` }}
                >
                  <span className="shrink-0 font-mono text-muted-foreground">{row.id}</span>
                  <span className="truncate">{componentTypeName(row.type)}{row.dynamicCreated ? " *" : ""}</span>
                </button>
              ))
            )
          ) : !selectedId ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">Select an interface first.</div>
          ) : !isInterfaceLoaded ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">Loading…</div>
          ) : rootWidgetV3 === true ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              Client script simulation for IF3 interfaces is coming soon.
            </div>
          ) : rootWidgetV3 === false ? (
            <Cs1SimulatePanel
              state={cs1SimState}
              onChange={setCs1SimState}
              interfaceData={interfaceData}
              revision={revision}
            />
          ) : (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              Could not determine legacy vs IF3 for this interface.
            </div>
          )}
        </div>
      </aside>

      <JsonDialog
        open={jsonDialogOpen}
        onOpenChange={setJsonDialogOpen}
        componentData={jsonDialogComponentData}
        componentId={jsonDialogComponentData?.id ?? null}
      />
    </div>
  );
}
