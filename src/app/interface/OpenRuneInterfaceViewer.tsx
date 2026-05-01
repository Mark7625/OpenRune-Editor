"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";

import { useCacheType } from "@/context/cache-type-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cacheProxyHeaders } from "@/lib/cache-proxy-client";
import type { RsInterfaceMode } from "@/components/ui/rs-interface";
import { adaptInterfaceEntryFromApi, type ComponentType, type InterfaceEntry } from "@/lib/interface-renderer/component-types";
import { openInterface, setCs1InterfaceEntry } from "@/lib/interface-renderer/interface-manager";
import { applyCs2RuntimeFromSim } from "@/lib/interface-renderer/cs2/runtime-context";
import { Cs1Interpreter } from "@/lib/interface-renderer/cs1-interpreter";
import type { VarbitDefinitionLookup } from "@/rs/config/vartype/bit/VarBitTypeLoader";
import { GameValGroupType } from "@/rs/config/gameval/GameValGroupType";
import type { Interface as InterfaceGameVal } from "@/rs/config/gameval/impl/Interface";
import { InterfaceViewer } from "./InterfaceViewer";
import { collectOnLoadScriptDiagnostics } from "@/lib/interface-renderer/cs2/on-load-script-diagnostics";
import { getCs2RuntimeContext } from "@/lib/interface-renderer/cs2/runtime-context";
import {
  makeCs2LogLine,
  setCs2ConsoleSink,
  type Cs2LogLevel,
  type Cs2LogLine,
} from "@/lib/interface-renderer/cs2/cs2-console-sink";
import {
  InterfaceEditorWorkbenchProvider,
  type InterfaceEditorWorkbench,
  type InterfaceLegacyFilter,
  type InterfaceListEntry,
  type TreeNode,
  type TreeRow,
} from "./interface-editor-workbench-context";
import { InterfaceEditorDock } from "./interface-editor-dock";

function cs2DiagLineLevel(body: string): Cs2LogLevel {
  const u = body.toLowerCase();
  if (u.includes("missing") || u.includes("invalid") || u.includes("error")) return "warn";
  return "load";
}

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

function runtimeId(comp: ComponentType): number {
  return typeof comp.packedId === "number" ? comp.packedId : comp.id;
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

function flattenTree(nodes: TreeNode[], depth = 0): TreeRow[] {
  const out: TreeRow[] = [];
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
  /** Decoded interfaces, preloaded sprites/varbits/scripts, and cache handles. */
  viewer: InterfaceViewer;
};

export function OpenRuneInterfaceViewer({ viewer }: OpenRuneInterfaceViewerProps) {
  const loadedCache = viewer.loadedCache;
  const varbitDefinitionLookup = React.useMemo<VarbitDefinitionLookup | null>(() => {
    const defs = viewer.varbitDefinitions;
    if (defs == null) return null;
    return (id: number) => defs.get(id) ?? null;
  }, [viewer.varbitDefinitions]);
  const { selectedCacheType, cacheStatuses } = useCacheType();

  const revision = React.useMemo(() => {
    const status = cacheStatuses.get(selectedCacheType.id);
    return status?.statusResponse?.revision ?? "latest";
  }, [cacheStatuses, selectedCacheType.id]);

  const [legacyFilter, setLegacyFilter] = React.useState<InterfaceLegacyFilter>("all");

  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [mode, setMode] = React.useState<RsInterfaceMode>("fixed");
  const [viewportColor, setViewportColor] = React.useState("#171616");
  const [showOverlays, setShowOverlays] = React.useState(true);
  const [showViewportBorder, setShowViewportBorder] = React.useState(false);
  const [showPixelGrid, setShowPixelGrid] = React.useState(false);
  const [interactiveMode, setInteractiveMode] = React.useState(false);
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
  }, [loadedCache, viewer, selectedId]);

  const entries = React.useMemo<InterfaceListEntry[]>(() => {
    const gv = viewer.gamevals;
    try {
      // `getFastAs` reads `indexCache`, which is only filled after `get()` loads IFTYPES (or IFTYPES_V2 via resolveType).
      gv?.get(GameValGroupType.IFTYPES);
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
        gv?.getFastAs<InterfaceGameVal>(GameValGroupType.IFTYPES, id)?.name?.trim() ?? "";
      const fileIds = Object.keys(iface.components).map((k) => Number(k));
      return {
        id,
        name: gvName || `Interface ${id}`,
        iflegacy: interfaceRootLegacy(viewer.legacy, id, fileIds),
      };
    });
  }, [viewer]);

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
            viewer.clientScriptIndex,
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
  }, [revision, selectedCacheType, selectedId, cs1SimState, varbitDefinitionLookup, viewer.clientScriptIndex]);

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
    const map = new Map<string, TreeRow>();
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

  const workbench = React.useMemo<InterfaceEditorWorkbench>(
    () => ({
      viewer,
      selectedCacheType,
      revision,
      entries,
      filtered,
      search,
      setSearch,
      legacyFilter,
      setLegacyFilter,
      selectedId,
      setSelectedId,
      runInterfaceViewerExport,
      mode,
      setMode,
      showOverlays,
      setShowOverlays,
      showViewportBorder,
      setShowViewportBorder,
      showPixelGrid,
      setShowPixelGrid,
      setViewportColor,
      viewportColor,
      interactiveMode,
      setInteractiveMode,
      isInterfaceLoaded,
      interfaceLoadError,
      interfaceData,
      setInterfaceData,
      rootWidgetV3,
      selectedComponentNodeKey,
      setSelectedComponentNodeKey,
      selectedComponent,
      selectedComponentId,
      componentTreeRows,
      componentTreeRowsForList,
      showGeneratedTreeRows,
      setShowGeneratedTreeRows,
      unhideAllComponents,
      handleComponentRightClick,
      cs1SimState,
      setCs1SimState,
      cs1ForCanvas,
      varbitDefinitionLookup,
      cs2LogLines,
      appendCs2LogLine,
      clearCs2Log,
      cs2RedrawNonce,
      setCs2RedrawNonce,
    }),
    [
      viewer,
      selectedCacheType,
      revision,
      entries,
      filtered,
      search,
      legacyFilter,
      selectedId,
      runInterfaceViewerExport,
      mode,
      showOverlays,
      showViewportBorder,
      showPixelGrid,
      viewportColor,
      interactiveMode,
      isInterfaceLoaded,
      interfaceLoadError,
      interfaceData,
      setInterfaceData,
      rootWidgetV3,
      selectedComponentNodeKey,
      selectedComponent,
      selectedComponentId,
      componentTreeRows,
      componentTreeRowsForList,
      showGeneratedTreeRows,
      unhideAllComponents,
      handleComponentRightClick,
      cs1SimState,
      cs1ForCanvas,
      varbitDefinitionLookup,
      cs2LogLines,
      appendCs2LogLine,
      clearCs2Log,
      cs2RedrawNonce,
    ],
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <InterfaceEditorWorkbenchProvider value={workbench}>
        <InterfaceEditorDock />
      </InterfaceEditorWorkbenchProvider>

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
