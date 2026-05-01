"use client";

import * as React from "react";
import {
  Monitor,
  Maximize2,
  Search,
  SlidersHorizontal,
  Copy,
  Check,
  Eye,
  Sparkles,
  Braces,
} from "lucide-react";

import { useCacheType } from "@/context/cache-type-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cacheProxyHeaders } from "@/lib/cache-proxy-client";
import { cn } from "@/lib/utils";
import type { CacheIndex } from "@/rs/cache/CacheIndex";
import { RsInterface, type RsInterfaceMode } from "@/components/ui/rs-interface";
import { adaptInterfaceEntryFromApi, type ComponentType, type InterfaceEntry } from "@/lib/interface-renderer/component-types";
import { openInterface, setCs1InterfaceEntry } from "@/lib/interface-renderer/interface-manager";
import { applyCs2RuntimeFromSim } from "@/lib/interface-renderer/cs2/runtime-context";
import { Cs1Interpreter } from "@/lib/interface-renderer/cs1-interpreter";
import type {
  VarbitDefinition,
  VarbitDefinitionLookup,
} from "@/rs/config/vartype/bit/VarBitTypeLoader";
import type { GameVals } from "@/rs/config/gameval/GameVals";
import { GameValGroupType } from "@/rs/config/gameval/GameValGroupType";
import type { Interface as InterfaceGameVal } from "@/rs/config/gameval/impl/Interface";
import type { Sprite } from "@/rs/sprite/InterfaceCanvasSprite";
import type { LoadedCache } from "@/mapviewer/Caches";
import { InterfaceViewer } from "./InterfaceViewer";
import { collectOnLoadScriptDiagnostics } from "@/lib/interface-renderer/cs2/on-load-script-diagnostics";
import { getCs2RuntimeContext } from "@/lib/interface-renderer/cs2/runtime-context";
import {
  makeCs2LogLine,
  setCs2ConsoleSink,
  type Cs2LogLevel,
  type Cs2LogLine,
} from "@/lib/interface-renderer/cs2/cs2-console-sink";
import { Cs1SimulatePanel } from "./cs1-simulate-panel";
import { Cs2ManualRunnerPanel } from "./cs2-manual-runner-panel";

function cs2DiagLineLevel(body: string): Cs2LogLevel {
  const u = body.toLowerCase();
  if (u.includes("missing") || u.includes("invalid") || u.includes("error")) return "warn";
  return "load";
}

type InterfaceListEntry = {
  id: number;
  name: string;
  iflegacy: boolean | null;
};

/** Legacy flag for the interface group, matching index-3 combined ids used in `ComponentDecoder.loadLegacyMap`. */
function interfaceRootLegacy(
  legacy: Record<number, boolean>,
  groupId: number,
  componentFileIds: number[],
): boolean | null {
  if (componentFileIds.length === 0) return null;
  const files = [...componentFileIds].sort((a, b) => a - b);
  const tryOrder = files.includes(0) ? [0, ...files.filter((f) => f !== 0)] : files;
  for (const file of tryOrder) {
    const combined = (groupId << 16) | (file & 0xffff);
    if (Object.prototype.hasOwnProperty.call(legacy, combined)) {
      return legacy[combined]!;
    }
  }
  return null;
}

type LocalInterfaceIndex =
  | { status: "ok"; viewer: InterfaceViewer }
  | { status: "error"; message: string };

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
function unhideComponentSubtree(comp: ComponentType): void {
  comp.hide = false;
  const ch = comp.children;
  if (!ch) return;
  for (const c of ch) {
    if (c) unhideComponentSubtree(c);
  }
}

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

type InterfaceViewerJsonExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  error: string | null;
  jsonText: string;
  /** Interface id shown in the title when export ran for a selection. */
  exportInterfaceId: number | null;
};

function legacyForInterfaceGroup(
  legacy: Record<number, boolean>,
  groupId: number,
): Record<number, boolean> {
  const out: Record<number, boolean> = {};
  for (const key of Object.keys(legacy)) {
    const combined = Number(key);
    if ((combined >>> 16) === groupId) {
      out[combined] = legacy[combined]!;
    }
  }
  return out;
}

function InterfaceViewerJsonExportDialog({
  open,
  onOpenChange,
  busy,
  error,
  jsonText,
  exportInterfaceId,
}: InterfaceViewerJsonExportDialogProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(() => {
    if (!jsonText) return;
    void navigator.clipboard.writeText(jsonText).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }, [jsonText]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col">
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base">
            InterfaceViewer JSON (temp)
            {exportInterfaceId != null ? (
              <span className="font-mono text-muted-foreground"> · #{exportInterfaceId}</span>
            ) : null}
          </DialogTitle>
          <Button size="sm" variant="outline" className="gap-2" disabled={!jsonText || busy} onClick={handleCopy}>
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
        <div className="min-h-0 flex-1 overflow-auto rounded border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap break-words">
          {busy ? (
            <span className="text-muted-foreground">Running ComponentDecoder (local cache)…</span>
          ) : error ? (
            <span className="text-destructive">{error}</span>
          ) : jsonText ? (
            jsonText
          ) : (
            <span className="text-muted-foreground">No data.</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

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

export type OpenRuneInterfaceViewerProps = {
  /** Active session cache (index 3 interfaces decoded in-browser). */
  loadedCache: LoadedCache;
  /** Pre-decoded sprites from the session cache (DAT2 sprite index). */
  spritesById?: ReadonlyMap<number, Sprite>;
  /** DAT2 index 12 — client scripts (`getFile(scriptId, 0)`). */
  clientScriptIndex?: CacheIndex | null;
  /** Pre-decoded varbit definitions from the local cache (no per-id `load`). */
  varbitDefinitions?: ReadonlyMap<number, VarbitDefinition> | null;
  /** Local cache gamevals (index 24); inventory name search when non-null. */
  gameVals?: GameVals | null;
};

export function OpenRuneInterfaceViewer({
  loadedCache,
  spritesById = new Map<number, Sprite>(),
  clientScriptIndex = null,
  varbitDefinitions = null,
  gameVals = null,
}: OpenRuneInterfaceViewerProps) {
  const varbitDefinitionLookup = React.useMemo<VarbitDefinitionLookup | null>(() => {
    if (varbitDefinitions == null) return null;
    return (id: number) => varbitDefinitions.get(id) ?? null;
  }, [varbitDefinitions]);
  const { selectedCacheType, cacheStatuses } = useCacheType();

  const revision = React.useMemo(() => {
    const status = cacheStatuses.get(selectedCacheType.id);
    return status?.statusResponse?.revision ?? "latest";
  }, [cacheStatuses, selectedCacheType.id]);

  const localInterfaceIndex = React.useMemo<LocalInterfaceIndex>(() => {
    try {
      return { status: "ok", viewer: new InterfaceViewer(loadedCache) };
    } catch (e) {
      return { status: "error", message: e instanceof Error ? e.message : String(e) };
    }
  }, [loadedCache]);

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
  /** When false (default), runtime/CS2-created widgets are omitted from the sidebar tree. */
  const [showGeneratedTreeRows, setShowGeneratedTreeRows] = React.useState(false);
  const [isInterfaceLoaded, setIsInterfaceLoaded] = React.useState(false);
  const [interfaceLoadError, setInterfaceLoadError] = React.useState<string | null>(null);
  const [interfaceData, setInterfaceData] = React.useState<InterfaceEntry | null>(null);
  const [selectedComponentNodeKey, setSelectedComponentNodeKey] = React.useState<string | null>(null);
  const [jsonDialogOpen, setJsonDialogOpen] = React.useState(false);
  const [jsonDialogComponentNodeKey, setJsonDialogComponentNodeKey] = React.useState<string | null>(null);
  const [cs1SimState, setCs1SimState] = React.useState(() => Cs1Interpreter.defaultState());
  const [cs2LogLines, setCs2LogLines] = React.useState<Cs2LogLine[]>([]);

  const appendCs2LogLine = React.useCallback((line: Cs2LogLine) => {
    setCs2LogLines((prev) => [...prev.slice(-499), line]);
  }, []);

  const clearCs2Log = React.useCallback(() => {
    setCs2LogLines([]);
  }, []);

  React.useLayoutEffect(() => {
    setCs2ConsoleSink(appendCs2LogLine);
    return () => setCs2ConsoleSink(null);
  }, [appendCs2LogLine]);

  const [cs2RedrawNonce, setCs2RedrawNonce] = React.useState(0);

  const [ivExportOpen, setIvExportOpen] = React.useState(false);
  const [ivExportBusy, setIvExportBusy] = React.useState(false);
  const [ivExportError, setIvExportError] = React.useState<string | null>(null);
  const [ivExportJson, setIvExportJson] = React.useState("");
  const [ivExportInterfaceId, setIvExportInterfaceId] = React.useState<number | null>(null);

  const runInterfaceViewerExport = React.useCallback(() => {
    if (selectedId == null) {
      setIvExportInterfaceId(null);
      setIvExportOpen(true);
      setIvExportJson("");
      setIvExportError("Select an interface in the list first.");
      setIvExportBusy(false);
      return;
    }
    const ifaceId = selectedId;
    setIvExportInterfaceId(ifaceId);
    setIvExportOpen(true);
    setIvExportJson("");
    setIvExportError(null);
    setIvExportBusy(true);
    window.setTimeout(() => {
      try {
        const viewer =
          localInterfaceIndex.status === "ok"
            ? localInterfaceIndex.viewer
            : new InterfaceViewer(loadedCache);
        const iface = viewer.interfaces[ifaceId];
        if (!iface) {
          setIvExportError(`No decoded interface for id ${ifaceId} in local index 3 (InterfaceViewer).`);
          return;
        }
        const payload = {
          loadedCache: { type: loadedCache.type, name: loadedCache.info.name },
          interfaceId: ifaceId,
          interface: iface,
          legacy: legacyForInterfaceGroup(viewer.legacy, ifaceId),
        };
        setIvExportJson(JSON.stringify(payload, null, 2));
      } catch (e) {
        setIvExportError(e instanceof Error ? e.message : String(e));
      } finally {
        setIvExportBusy(false);
      }
    }, 0);
  }, [loadedCache, localInterfaceIndex, selectedId]);

  const entries = React.useMemo<InterfaceListEntry[]>(() => {
    if (localInterfaceIndex.status !== "ok") {
      return [];
    }
    const { viewer } = localInterfaceIndex;
    const gv = viewer.gamevals;
    try {
      // `getFastAs` reads `indexCache`, which is only filled after `get()` loads IFTYPES (or IFTYPES_V2 via resolveType).
      gv.get(GameValGroupType.IFTYPES);
    } catch {
      /* no gameval index or unreadable — fall back to numeric labels */
    }
    const ids = Object.keys(viewer.interfaces)
      .map((k) => Number(k))
      .filter((id) => Number.isFinite(id))
      .sort((a, b) => a - b);
    return ids.map((id) => {
      const iface = viewer.interfaces[id]!;
      const gvName =
        gv.getFastAs<InterfaceGameVal>(GameValGroupType.IFTYPES, id)?.name?.trim() ?? "";
      const fileIds = Object.keys(iface.components).map((k) => Number(k));
      return {
        id,
        name: gvName || `Interface ${id}`,
        iflegacy: interfaceRootLegacy(viewer.legacy, id, fileIds),
      };
    });
  }, [localInterfaceIndex]);

  React.useEffect(() => {
    if (selectedId == null) {
      setIsInterfaceLoaded(false);
      setInterfaceLoadError(null);
      setInterfaceData(null);
      setSelectedComponentNodeKey(null);
      setCs2LogLines([]);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setIsInterfaceLoaded(false);
    setInterfaceLoadError(null);
    setInterfaceData(null);
    setCs2LogLines([]);

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
            varbitDefinitionLookup,
            data,
            undefined,
            undefined,
            clientScriptIndex,
          );
          await openInterface(1, selectedId, 1);
          // Trigger React update after on-load scripts mutate widget tree in place.
          setInterfaceData({ ...data, components: { ...data.components } });
          const entryAfter = getCs2RuntimeContext().interfaceEntry ?? data;
          const diag = await collectOnLoadScriptDiagnostics(entryAfter, selectedId);
          if (!cancelled) {
            const diagLines = diag.map((d) => makeCs2LogLine(cs2DiagLineLevel(d), d));
            // Append diagnostics; do not replace — CS2 may have emitted lines (e.g. unhandled opcodes) during openInterface.
            setCs2LogLines((prev) => [...prev, ...diagLines].slice(-500));
          }
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
  }, [revision, selectedCacheType, selectedId, cs1SimState, varbitDefinitionLookup, clientScriptIndex]);

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

  const componentTreeRowsForList = React.useMemo(() => {
    if (showGeneratedTreeRows) return componentTreeRows;
    return componentTreeRows.filter((row) => !row.dynamicCreated);
  }, [componentTreeRows, showGeneratedTreeRows]);

  React.useEffect(() => {
    if (showGeneratedTreeRows) return;
    if (!selectedComponentNodeKey) return;
    const n = treeNodeByKey.get(selectedComponentNodeKey);
    if (n?.dynamicCreated) setSelectedComponentNodeKey(null);
  }, [showGeneratedTreeRows, selectedComponentNodeKey, treeNodeByKey]);

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

  const unhideAllComponents = React.useCallback(() => {
    setInterfaceData((prev) => {
      if (!prev) return prev;
      for (const comp of Object.values(prev.components)) {
        unhideComponentSubtree(comp);
      }
      return { ...prev, components: { ...prev.components } };
    });
  }, []);

  const jsonDialogComponentData = React.useMemo(
    () => (jsonDialogComponentNodeKey ? (treeNodeByKey.get(jsonDialogComponentNodeKey)?.component ?? null) : null),
    [jsonDialogComponentNodeKey, treeNodeByKey]
  );

  const listContent = React.useMemo(() => {
    if (localInterfaceIndex.status === "error") {
      return (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          {localInterfaceIndex.message}
        </div>
      );
    }
    if (entries.length === 0) {
      return (
        <div className="px-3 py-4 text-xs text-muted-foreground">No interfaces decoded from cache.</div>
      );
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
  }, [entries.length, filtered, localInterfaceIndex, selectedId]);

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 overflow-hidden">
      {/* ------------------------------------------------------------------ */}
      {/* Sidebar                                                              */}
      {/* ------------------------------------------------------------------ */}
      <aside className="flex w-64 shrink-0 flex-col border-r bg-background">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-sm font-semibold text-foreground">Interfaces</span>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon-xs"
              variant="outline"
              disabled={selectedId == null}
              title={
                selectedId == null
                  ? "Select an interface first"
                  : "TEMP: JSON for selected interface from local InterfaceViewer (decode)"
              }
              onClick={runInterfaceViewerExport}
            >
              <Braces className="size-3.5" />
            </Button>
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
              spritesById={spritesById}
              clientScriptIndex={clientScriptIndex}
              viewportColor={viewportColor}
              showOverlays={showOverlays}
              showViewportBorder={showViewportBorder}
              showPixelGrid={showPixelGrid}
              selectedComponentId={selectedComponentId}
              selectedComponent={selectedComponent}
              interactiveMode={interactiveMode}
              cs1SimState={cs1ForCanvas}
              cs1VarbitDefinitionLookup={varbitDefinitionLookup}
              cs2RedrawNonce={cs2RedrawNonce}
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">Components</span>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              <Button
                type="button"
                size="sm"
                variant={showGeneratedTreeRows ? "default" : "outline"}
                className="h-7 gap-1 px-2 text-[11px]"
                title="Show widgets created at runtime (CS2) in this list — marked with * when visible"
                disabled={!isInterfaceLoaded || !interfaceData}
                onClick={() => setShowGeneratedTreeRows((v) => !v)}
              >
                <Sparkles className="size-3.5" />
                Generated
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-[11px]"
                title="Set hide=false on every widget (preview / editor)"
                disabled={!isInterfaceLoaded || !interfaceData}
                onClick={unhideAllComponents}
              >
                <Eye className="size-3.5" />
                Unhide all
              </Button>
            </div>
          </div>
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
            ) : componentTreeRowsForList.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground">
                No components match the current filter. Turn on &quot;Generated&quot; to include runtime-created widgets.
              </div>
            ) : (
              componentTreeRowsForList.map((row) => (
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
            <Cs2ManualRunnerPanel
              interfaceData={interfaceData}
              interfaceRootId={selectedId}
              onAfterRun={() => setCs2RedrawNonce((n) => n + 1)}
              logLines={cs2LogLines}
              appendLogLine={appendCs2LogLine}
              onClearLog={clearCs2Log}
            />
          ) : rootWidgetV3 === false ? (
            <Cs1SimulatePanel
              state={cs1SimState}
              onChange={setCs1SimState}
              interfaceData={interfaceData}
              revision={revision}
              gameVals={gameVals}
              spritesById={spritesById}
            />
          ) : (
            <>
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Could not determine legacy vs IF3 for this interface. CS1 simulator is hidden; you can still run CS2
                manually below.
              </div>
              <Cs2ManualRunnerPanel
                interfaceData={interfaceData}
                interfaceRootId={selectedId}
                onAfterRun={() => setCs2RedrawNonce((n) => n + 1)}
                logLines={cs2LogLines}
                appendLogLine={appendCs2LogLine}
                onClearLog={clearCs2Log}
              />
            </>
          )}
        </div>
      </aside>

      <JsonDialog
        open={jsonDialogOpen}
        onOpenChange={setJsonDialogOpen}
        componentData={jsonDialogComponentData}
        componentId={jsonDialogComponentData?.id ?? null}
      />
      <InterfaceViewerJsonExportDialog
        open={ivExportOpen}
        onOpenChange={(open) => {
          setIvExportOpen(open);
          if (!open) {
            setIvExportJson("");
            setIvExportError(null);
            setIvExportBusy(false);
            setIvExportInterfaceId(null);
          }
        }}
        busy={ivExportBusy}
        error={ivExportError}
        jsonText={ivExportJson}
        exportInterfaceId={ivExportInterfaceId}
      />
    </div>
  );
}
