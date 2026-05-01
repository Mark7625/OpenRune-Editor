"use client";

import * as React from "react";

import type { RsInterfaceMode } from "@/components/ui/rs-interface";
import type { Cs2LogLine } from "@/lib/interface-renderer/cs2/cs2-console-sink";
import type { Cs1SimState } from "@/lib/interface-renderer/cs1-interpreter";
import type { ComponentType, InterfaceEntry } from "@/lib/interface-renderer/component-types";
import type { CacheType } from "@/lib/cache-types";
import type { VarbitDefinitionLookup } from "@/rs/config/vartype/bit/VarBitTypeLoader";

import type { InterfaceViewer } from "./InterfaceViewer";

export type InterfaceLegacyFilter = "all" | "new" | "legacy";

export type InterfaceListEntry = {
  id: number;
  name: string;
  iflegacy: boolean | null;
};

export type TreeNode = {
  id: number;
  runtimeId: number;
  type: number;
  dynamicCreated: boolean;
  nodeKey: string;
  component: ComponentType;
  children: TreeNode[];
};

export type TreeRow = TreeNode & { depth: number };

/** All state and actions consumed by interface editor dock panels. */
export type InterfaceEditorWorkbench = {
  viewer: InterfaceViewer;
  selectedCacheType: CacheType;
  revision: string | number;

  entries: InterfaceListEntry[];
  filtered: InterfaceListEntry[];
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  legacyFilter: InterfaceLegacyFilter;
  setLegacyFilter: React.Dispatch<React.SetStateAction<InterfaceLegacyFilter>>;
  selectedId: number | null;
  setSelectedId: React.Dispatch<React.SetStateAction<number | null>>;
  runInterfaceViewerExport: () => void;

  mode: RsInterfaceMode;
  setMode: React.Dispatch<React.SetStateAction<RsInterfaceMode>>;
  showOverlays: boolean;
  setShowOverlays: React.Dispatch<React.SetStateAction<boolean>>;
  showViewportBorder: boolean;
  setShowViewportBorder: React.Dispatch<React.SetStateAction<boolean>>;
  showPixelGrid: boolean;
  setShowPixelGrid: React.Dispatch<React.SetStateAction<boolean>>;
  setViewportColor: React.Dispatch<React.SetStateAction<string>>;

  viewportColor: string;
  interactiveMode: boolean;
  setInteractiveMode: React.Dispatch<React.SetStateAction<boolean>>;

  isInterfaceLoaded: boolean;
  interfaceLoadError: string | null;
  interfaceData: InterfaceEntry | null;
  setInterfaceData: React.Dispatch<React.SetStateAction<InterfaceEntry | null>>;
  rootWidgetV3: boolean | null;

  selectedComponentNodeKey: string | null;
  setSelectedComponentNodeKey: React.Dispatch<React.SetStateAction<string | null>>;
  selectedComponent: ComponentType | null;
  selectedComponentId: number | null;

  componentTreeRows: TreeRow[];
  componentTreeRowsForList: TreeRow[];
  showGeneratedTreeRows: boolean;
  setShowGeneratedTreeRows: React.Dispatch<React.SetStateAction<boolean>>;
  unhideAllComponents: () => void;
  handleComponentRightClick: (e: React.MouseEvent, nodeKey: string) => void;

  cs1SimState: Cs1SimState;
  setCs1SimState: React.Dispatch<React.SetStateAction<Cs1SimState>>;
  cs1ForCanvas: Cs1SimState | null;
  varbitDefinitionLookup: VarbitDefinitionLookup | null;

  cs2LogLines: Cs2LogLine[];
  appendCs2LogLine: (line: Cs2LogLine) => void;
  clearCs2Log: () => void;
  cs2RedrawNonce: number;
  setCs2RedrawNonce: React.Dispatch<React.SetStateAction<number>>;
};

const InterfaceEditorWorkbenchContext = React.createContext<InterfaceEditorWorkbench | null>(null);

export function InterfaceEditorWorkbenchProvider({
  value,
  children,
}: {
  value: InterfaceEditorWorkbench;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <InterfaceEditorWorkbenchContext.Provider value={value}>
      {children}
    </InterfaceEditorWorkbenchContext.Provider>
  );
}

export function useInterfaceEditorWorkbench(): InterfaceEditorWorkbench {
  const ctx = React.useContext(InterfaceEditorWorkbenchContext);
  if (!ctx) {
    throw new Error("useInterfaceEditorWorkbench must be used within InterfaceEditorWorkbenchProvider");
  }
  return ctx;
}
