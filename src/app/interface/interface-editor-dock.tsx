"use client";

import { memo, useCallback, useMemo } from "react";
import { Braces, Eye, Search, Sparkles } from "lucide-react";
import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  themeDark,
} from "dockview";
import "dockview/dist/styles/dockview.css";

import { RsInterface } from "@/components/ui/rs-interface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cacheProxyHeaders } from "@/lib/cache-proxy-client";
import { cn } from "@/lib/utils";

import { Cs1SimulatePanel } from "./cs1-simulate-panel";
import { Cs2ManualRunnerPanel } from "./cs2-manual-runner-panel";
import { applyInterfaceEditorWorkbenchLayout } from "./interface-editor-workbench-layout";
import {
  type InterfaceLegacyFilter,
  useInterfaceEditorWorkbench,
} from "./interface-editor-workbench-context";
import { InterfaceViewerSettings } from "./interface-viewer-settings";
import { componentTypeName } from "./interface-editor-tree-utils";
import { IfaceComponentEditorPanel } from "./interface-component-editor-panel";

import "./interface-editor-dock.css";

const IfaceInterfacesPanel = memo(function IfaceInterfacesPanel(_props: IDockviewPanelProps): JSX.Element {
  const wb = useInterfaceEditorWorkbench();

  const listContent = useMemo(() => {
    if (wb.entries.length === 0) {
      return <div className="px-3 py-4 text-xs text-muted-foreground">No interfaces decoded from cache.</div>;
    }
    if (wb.filtered.length === 0) {
      return <div className="px-3 py-4 text-xs text-muted-foreground">No matches.</div>;
    }
    return wb.filtered.map((entry) => (
      <button
        key={entry.id}
        type="button"
        onClick={() => wb.setSelectedId(entry.id)}
        className={cn(
          "flex w-full items-center gap-2 border-b px-3 py-1.5 text-left text-xs hover:bg-muted/50",
          wb.selectedId === entry.id && "bg-muted",
        )}
      >
        <span className="shrink-0 font-mono text-muted-foreground">{entry.id}</span>
        <span className="truncate">{entry.name}</span>
      </button>
    ));
  }, [wb.entries.length, wb.filtered, wb.selectedId, wb.setSelectedId]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-sm font-semibold">Interfaces</span>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            disabled={wb.selectedId == null}
            title={
              wb.selectedId == null
                ? "Select an interface first"
                : "TEMP: JSON for selected interface from local InterfaceViewer (decode)"
            }
            onClick={wb.runInterfaceViewerExport}
          >
            <Braces className="size-3.5" />
          </Button>
          <InterfaceViewerSettings
            mode={wb.mode}
            setMode={wb.setMode}
            showOverlays={wb.showOverlays}
            setShowOverlays={wb.setShowOverlays}
            showViewportBorder={wb.showViewportBorder}
            setShowViewportBorder={wb.setShowViewportBorder}
            showPixelGrid={wb.showPixelGrid}
            setShowPixelGrid={wb.setShowPixelGrid}
            onViewportColorChange={wb.setViewportColor}
          />
        </div>
      </div>

      <div className="shrink-0 border-b px-2 py-2">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-7 pl-7 text-xs"
              placeholder="Search interfaces…"
              value={wb.search}
              onChange={(e) => wb.setSearch(e.target.value)}
            />
          </div>
          <select
            className="h-7 w-[112px] rounded-md border border-input bg-background px-2 text-xs"
            value={wb.legacyFilter}
            onChange={(e) => wb.setLegacyFilter(e.target.value as InterfaceLegacyFilter)}
          >
            <option value="all">All</option>
            <option value="new">New</option>
            <option value="legacy">Legacy</option>
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">{listContent}</div>
      <div className="shrink-0 border-t px-2 py-1 text-center text-[10px] text-muted-foreground">
        Showing {wb.filtered.length} of {wb.entries.length}
      </div>
    </div>
  );
});

const IfacePreviewPanel = memo(function IfacePreviewPanel(_props: IDockviewPanelProps): JSX.Element {
  const wb = useInterfaceEditorWorkbench();

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2 text-xs text-muted-foreground">
        {wb.selectedId != null ? (
          <>
            <span className="font-mono font-semibold text-foreground">{wb.selectedId}</span>
            <span>{wb.entries.find((e) => e.id === wb.selectedId)?.name ?? ""}</span>
            {wb.rootWidgetV3 != null ? (
              <span
                className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                title={wb.rootWidgetV3 ? "IF3 interface (not legacy)" : "Legacy interface (pre-IF3)"}
              >
                {wb.rootWidgetV3 ? "Not legacy" : "Legacy"}
              </span>
            ) : null}
            <span className="ml-auto">
              {wb.mode === "fixed" ? "Fixed  512 × 334" : "Resizable"}
            </span>
            {wb.interfaceLoadError ? (
              <span className="ml-2 text-destructive">{wb.interfaceLoadError}</span>
            ) : null}
            {wb.selectedComponentId != null ? (
              <span className="ml-2 text-cyan-400">selected component {wb.selectedComponentId}</span>
            ) : null}
            <Button
              type="button"
              variant={wb.interactiveMode ? "default" : "outline"}
              size="sm"
              className="ml-2 h-7 text-xs"
              onClick={() => wb.setInteractiveMode((v) => !v)}
            >
              Interactive mode
            </Button>
          </>
        ) : (
          <span>Select an interface from the list</span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center bg-black/80 p-4">
        {wb.selectedId != null ? (
          <RsInterface
            interfaceId={wb.selectedId}
            mode={wb.mode}
            isInterfaceLoaded={wb.isInterfaceLoaded}
            interfaceData={wb.interfaceData}
            revision={wb.revision}
            cacheHeaders={cacheProxyHeaders(wb.selectedCacheType)}
            spritesById={wb.viewer.spritesById}
            clientScriptIndex={wb.viewer.clientScriptIndex}
            viewportColor={wb.viewportColor}
            showOverlays={wb.showOverlays}
            showViewportBorder={wb.showViewportBorder}
            showPixelGrid={wb.showPixelGrid}
            selectedComponentId={wb.selectedComponentId}
            selectedComponent={wb.selectedComponent}
            interactiveMode={wb.interactiveMode}
            cs1SimState={wb.cs1ForCanvas}
            cs1VarbitDefinitionLookup={wb.varbitDefinitionLookup}
            cs2RedrawNonce={wb.cs2RedrawNonce}
            className={wb.mode === "resizable" ? "h-full w-full" : "shrink-0"}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Select an interface to preview it here.</p>
        )}
      </div>
    </div>
  );
});

const IfaceComponentTreePanel = memo(function IfaceComponentTreePanel(_props: IDockviewPanelProps): JSX.Element {
  const wb = useInterfaceEditorWorkbench();

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="shrink-0 border-b px-3 py-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold">Components</span>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant={wb.showGeneratedTreeRows ? "default" : "outline"}
              className="h-7 gap-1 px-2 text-[11px]"
              title="Show widgets created at runtime (CS2) in this list — marked with * when visible"
              disabled={!wb.isInterfaceLoaded || !wb.interfaceData}
              onClick={() => wb.setShowGeneratedTreeRows((v) => !v)}
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
              disabled={!wb.isInterfaceLoaded || !wb.interfaceData}
              onClick={wb.unhideAllComponents}
            >
              <Eye className="size-3.5" />
              Unhide all
            </Button>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!wb.selectedId ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">Select an interface first.</div>
        ) : !wb.isInterfaceLoaded ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">Loading component tree…</div>
        ) : wb.componentTreeRows.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">No component nodes found.</div>
        ) : wb.componentTreeRowsForList.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No components match the current filter. Turn on &quot;Generated&quot; to include runtime-created widgets.
          </div>
        ) : (
          wb.componentTreeRowsForList.map((row) => (
            <button
              key={row.nodeKey}
              type="button"
              onClick={() => wb.setSelectedComponentNodeKey(row.nodeKey)}
              onContextMenu={(e) => wb.handleComponentRightClick(e, row.nodeKey)}
              className={cn(
                "flex w-full items-center gap-2 border-b px-3 py-1.5 text-left text-xs hover:bg-muted/50",
                wb.selectedComponentNodeKey === row.nodeKey && "bg-cyan-500/10",
              )}
              style={{ paddingLeft: `${12 + row.depth * 14}px` }}
            >
              <span className="shrink-0 font-mono text-muted-foreground">{row.id}</span>
              <span className="truncate">
                {componentTypeName(row.type)}
                {row.dynamicCreated ? " *" : ""}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
});

const IfaceClientScriptPanel = memo(function IfaceClientScriptPanel(_props: IDockviewPanelProps): JSX.Element {
  const wb = useInterfaceEditorWorkbench();

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="shrink-0 border-b px-3 py-2 text-sm font-semibold">Client script</div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!wb.selectedId ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">Select an interface first.</div>
        ) : !wb.isInterfaceLoaded ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">Loading…</div>
        ) : wb.rootWidgetV3 === true ? (
          <Cs2ManualRunnerPanel
            interfaceData={wb.interfaceData}
            interfaceRootId={wb.selectedId}
            onAfterRun={() => wb.setCs2RedrawNonce((n) => n + 1)}
            logLines={wb.cs2LogLines}
            appendLogLine={wb.appendCs2LogLine}
            onClearLog={wb.clearCs2Log}
          />
        ) : wb.rootWidgetV3 === false ? (
          <Cs1SimulatePanel
            state={wb.cs1SimState}
            onChange={wb.setCs1SimState}
            interfaceData={wb.interfaceData}
            revision={wb.revision}
            gameVals={wb.viewer.gamevals}
            spritesById={wb.viewer.spritesById}
          />
        ) : (
          <>
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Could not determine legacy vs IF3 for this interface. CS1 simulator is hidden; you can still run CS2
              manually below.
            </div>
            <Cs2ManualRunnerPanel
              interfaceData={wb.interfaceData}
              interfaceRootId={wb.selectedId}
              onAfterRun={() => wb.setCs2RedrawNonce((n) => n + 1)}
              logLines={wb.cs2LogLines}
              appendLogLine={wb.appendCs2LogLine}
              onClearLog={wb.clearCs2Log}
            />
          </>
        )}
      </div>
    </div>
  );
});

export function InterfaceEditorDock(): JSX.Element {
  const components = useMemo(
    () => ({
      ifaceInterfaces: IfaceInterfacesPanel,
      ifacePreview: IfacePreviewPanel,
      ifaceComponentTree: IfaceComponentTreePanel,
      ifaceClientScript: IfaceClientScriptPanel,
      ifaceComponentEditor: IfaceComponentEditorPanel,
    }),
    [],
  );

  const onReady = useCallback((event: DockviewReadyEvent) => {
    applyInterfaceEditorWorkbenchLayout(event.api);
  }, []);

  return (
    <DockviewReact
      className="interface-editor-workbench-dockview h-full w-full min-h-0 min-w-0"
      theme={themeDark}
      defaultRenderer="always"
      components={components}
      onReady={onReady}
    />
  );
}
