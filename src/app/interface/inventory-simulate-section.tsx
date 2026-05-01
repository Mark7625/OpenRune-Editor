"use client";

import * as React from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";

import {
  GamevalSearchSuggestionList,
  useGamevalSearchSuggestions,
  type GamevalSearchAutocompleteConfig,
} from "@/components/diff/gameval-search-suggestion-list";
import { isGamevalSuggestPanelOpen } from "@/components/diff/diff-id-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ITEMTYPES, useGamevals } from "@/context/gameval-context";
import type { ComponentType, InterfaceEntry } from "@/lib/interface-renderer/component-types";
import { Cs1Interpreter, type Cs1SimInventory, type Cs1SimState } from "@/lib/interface-renderer/cs1-interpreter";
import { cn } from "@/lib/utils";

type InventorySimulateSectionProps = {
  interfaceData: InterfaceEntry | null;
  revision: number | "latest";
  state: Cs1SimState;
  onChange: React.Dispatch<React.SetStateAction<Cs1SimState>>;
  inventoryScriptsUsed: boolean;
};

function getComponent(entry: InterfaceEntry | null, id: number): ComponentType | null {
  if (!entry?.components) return null;
  const comps = entry.components as Record<string, ComponentType>;
  return comps[String(id)] ?? Object.values(comps).find((c) => c.id === id) ?? null;
}

function slotCountFor(comp: ComponentType | null, sim: Cs1SimInventory | undefined): number {
  if (sim?.itemIds.length) return sim.itemIds.length;
  if (comp?.itemIds?.length) return comp.itemIds.length;
  return Cs1Interpreter.DEFAULT_INV_SLOTS;
}

function emptyInventory(slots: number): Cs1SimInventory {
  return {
    itemIds: Array.from({ length: slots }, () => 0),
    itemQuantities: Array.from({ length: slots }, () => 0),
  };
}

type ItemRowDraft = { itemIdText: string; qtyText: string };

function pickItemIdFromName(
  suggestions: { name: string; id: number }[],
  name: string,
): number | null {
  const hit = suggestions.find((s) => s.name === name);
  return hit ? hit.id : null;
}

export function InventorySimulateSection({
  interfaceData,
  revision,
  state,
  onChange,
  inventoryScriptsUsed,
}: InventorySimulateSectionProps) {
  const invLocked = !inventoryScriptsUsed;
  const [invOpen, setInvOpen] = React.useState(false);

  React.useEffect(() => {
    if (!inventoryScriptsUsed) setInvOpen(false);
  }, [inventoryScriptsUsed]);
  const { loadGamevalType, hasLoaded } = useGamevals();

  React.useEffect(() => {
    void loadGamevalType(ITEMTYPES, revision);
  }, [loadGamevalType, revision]);

  const itemGamevalConfig = React.useMemo((): GamevalSearchAutocompleteConfig => {
    return {
      type: ITEMTYPES,
      rev: revision,
      enabled: hasLoaded(ITEMTYPES, revision),
    };
  }, [revision, hasLoaded]);

  const components = React.useMemo(() => {
    if (!interfaceData?.components) return [];
    return Object.values(interfaceData.components).sort((a, b) => a.id - b.id);
  }, [interfaceData]);

  const [targetIdText, setTargetIdText] = React.useState("");
  const [targetPanelOpen, setTargetPanelOpen] = React.useState(false);
  const [targetActiveIdx, setTargetActiveIdx] = React.useState(0);
  const targetRootRef = React.useRef<HTMLDivElement>(null);
  const [selectedComponentId, setSelectedComponentId] = React.useState<number | null>(null);

  const [fillAllItemText, setFillAllItemText] = React.useState("");
  const [fillAllQtyText, setFillAllQtyText] = React.useState("1");
  const [fillSuggestOpen, setFillSuggestOpen] = React.useState(false);
  const [fillSuggestActiveIdx, setFillSuggestActiveIdx] = React.useState(0);
  const fillRootRef = React.useRef<HTMLDivElement>(null);

  const [rows, setRows] = React.useState<ItemRowDraft[]>([{ itemIdText: "", qtyText: "1" }]);
  const [rowSuggestRow, setRowSuggestRow] = React.useState<number | null>(null);
  const [rowSuggestOpen, setRowSuggestOpen] = React.useState(false);
  const [rowSuggestActiveIdx, setRowSuggestActiveIdx] = React.useState(0);
  const rowRootRefs = React.useRef<Record<number, HTMLDivElement | null>>({});

  const targetQuery = targetIdText.trim().toLowerCase();
  const targetSuggestions = React.useMemo(() => {
    const q = targetQuery;
    if (!q) return components.slice(0, 40);
    return components
      .filter(
        (c) =>
          String(c.id).includes(q) ||
          String(c.type).includes(q) ||
          (c.internalName?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 40);
  }, [components, targetQuery]);

  const showTargetPanel = !invLocked && targetPanelOpen && targetSuggestions.length > 0;

  const itemQueryForHook =
    rowSuggestRow != null ? (rows[rowSuggestRow]?.itemIdText ?? "") : fillAllItemText;
  const itemSuggestHookActive =
    !invLocked &&
    itemGamevalConfig.enabled &&
    (fillSuggestOpen || (rowSuggestRow !== null && rowSuggestOpen));

  const { suggestions: itemSuggestions, loaded: itemLoaded, loading: itemLoading } =
    useGamevalSearchSuggestions(itemGamevalConfig, itemQueryForHook, itemSuggestHookActive);

  const showItemPanelFill = isGamevalSuggestPanelOpen({
    enabled: itemGamevalConfig.enabled,
    open: !invLocked && fillSuggestOpen && rowSuggestRow === null,
    value: fillAllItemText,
    loading: itemLoading,
    suggestionCount: itemSuggestions.length,
    loaded: itemLoaded,
  });

  const showItemPanelRow =
    !invLocked &&
    rowSuggestRow !== null &&
    isGamevalSuggestPanelOpen({
      enabled: itemGamevalConfig.enabled,
      open: rowSuggestOpen,
      value: rows[rowSuggestRow]?.itemIdText ?? "",
      loading: itemLoading,
      suggestionCount: itemSuggestions.length,
      loaded: itemLoaded,
    });

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!targetRootRef.current?.contains(e.target as Node)) setTargetPanelOpen(false);
      if (!fillRootRef.current?.contains(e.target as Node)) setFillSuggestOpen(false);
      if (rowSuggestRow != null) {
        const el = rowRootRefs.current[rowSuggestRow];
        if (el && !el.contains(e.target as Node)) {
          setRowSuggestOpen(false);
        }
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [rowSuggestRow]);

  const selectedComp = selectedComponentId != null ? getComponent(interfaceData, selectedComponentId) : null;
  const selectedSim =
    selectedComponentId != null ? state.simulatedInventories[selectedComponentId] : undefined;
  const slots = slotCountFor(selectedComp, selectedSim);

  const commitInventory = React.useCallback(
    (componentId: number, inv: Cs1SimInventory) => {
      onChange((prev) => ({
        ...prev,
        simulatedInventories: {
          ...prev.simulatedInventories,
          [componentId]: inv,
        },
      }));
    },
    [onChange],
  );

  const handleClear = React.useCallback(() => {
    if (selectedComponentId == null) return;
    const comp = getComponent(interfaceData, selectedComponentId);
    const n = slotCountFor(comp, state.simulatedInventories[selectedComponentId]);
    commitInventory(selectedComponentId, emptyInventory(n));
  }, [selectedComponentId, interfaceData, state.simulatedInventories, commitInventory]);

  const handleFillAllSlots = React.useCallback(() => {
    if (selectedComponentId == null) return;
    const defId = Number.parseInt(fillAllItemText.trim(), 10);
    const qty = Number.parseInt(fillAllQtyText.trim(), 10);
    if (!Number.isFinite(defId) || defId < 0 || !Number.isFinite(qty) || qty < 0) return;
    const comp = getComponent(interfaceData, selectedComponentId);
    const n = slotCountFor(comp, state.simulatedInventories[selectedComponentId]);
    const wire = Cs1Interpreter.itemSlotEncoding(defId);
    const itemIds = Array.from({ length: n }, () => wire);
    const itemQuantities = Array.from({ length: n }, () => qty);
    commitInventory(selectedComponentId, { itemIds, itemQuantities });
  }, [
    selectedComponentId,
    fillAllItemText,
    fillAllQtyText,
    interfaceData,
    state.simulatedInventories,
    commitInventory,
  ]);

  const handleApplyRows = React.useCallback(() => {
    if (selectedComponentId == null) return;
    const comp = getComponent(interfaceData, selectedComponentId);
    const n = slotCountFor(comp, state.simulatedInventories[selectedComponentId]);
    const itemIds = Array.from({ length: n }, () => 0);
    const itemQuantities = Array.from({ length: n }, () => 0);
    let slot = 0;
    for (const row of rows) {
      if (slot >= n) break;
      const defId = Number.parseInt(row.itemIdText.trim(), 10);
      const qty = Number.parseInt(row.qtyText.trim(), 10);
      if (!Number.isFinite(defId) || defId < 0) {
        itemIds[slot] = 0;
        itemQuantities[slot] = 0;
        slot++;
        continue;
      }
      const q = Number.isFinite(qty) && qty >= 0 ? qty : 0;
      itemIds[slot] = Cs1Interpreter.itemSlotEncoding(defId);
      itemQuantities[slot] = q;
      slot++;
    }
    commitInventory(selectedComponentId, { itemIds, itemQuantities });
  }, [selectedComponentId, rows, interfaceData, state.simulatedInventories, commitInventory]);

  const pickTarget = (c: ComponentType) => {
    setSelectedComponentId(c.id);
    setTargetIdText(String(c.id));
    setTargetPanelOpen(false);
  };

  return (
    <Collapsible
      open={inventoryScriptsUsed && invOpen}
      onOpenChange={(open) => {
        if (!inventoryScriptsUsed) return;
        setInvOpen(open);
      }}
      className="group/collapsible overflow-hidden rounded-lg border border-border bg-background"
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold",
          inventoryScriptsUsed
            ? "hover:bg-muted/50"
            : "pointer-events-none cursor-default bg-muted/25 text-muted-foreground",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span>Inventory</span>
          {invLocked ? (
            <Badge variant="secondary" className="h-4 shrink-0 px-1.5 py-0 text-[9px] font-normal">
              Not used
            </Badge>
          ) : null}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 border-t border-border px-2 pb-2 pt-2 text-[11px] leading-snug">
          <p className="text-muted-foreground">
            Pick a component, then fill or clear its inventory slots.
          </p>

          <div ref={targetRootRef} className="relative z-[50] space-y-1">
            <Label htmlFor="inv-target-comp">Target component</Label>
            <Input
              id="inv-target-comp"
              className="h-8 font-mono text-xs"
              placeholder="Component id (suggestions)…"
              value={targetIdText}
              autoComplete="off"
              disabled={invLocked}
              onChange={(e) => {
                if (invLocked) return;
                setTargetIdText(e.target.value);
                setTargetPanelOpen(true);
                setTargetActiveIdx(0);
              }}
              onFocus={() => {
                if (invLocked) return;
                setTargetPanelOpen(true);
              }}
              onKeyDown={(e) => {
                if (!showTargetPanel || targetSuggestions.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setTargetActiveIdx((i) => (i + 1) % targetSuggestions.length);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setTargetActiveIdx((i) => (i - 1 + targetSuggestions.length) % targetSuggestions.length);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  pickTarget(targetSuggestions[targetActiveIdx]!);
                } else if (e.key === "Escape") {
                  setTargetPanelOpen(false);
                }
              }}
            />
            {showTargetPanel ? (
              <ul
                className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-48 overflow-auto rounded-md border bg-popover py-1 text-xs shadow-md"
                role="listbox"
              >
                {targetSuggestions.map((c, idx) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={invLocked}
                      className={cn(
                        "flex w-full gap-2 px-2 py-1 text-left hover:bg-muted/60",
                        idx === targetActiveIdx && "bg-muted/80",
                      )}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickTarget(c)}
                    >
                      <span className="font-mono text-muted-foreground">{c.id}</span>
                      <span className="truncate">type {c.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {selectedComponentId != null ? (
            <p className="text-[10px] text-muted-foreground">
              {slots} slot{slots === 1 ? "" : "s"}
              {selectedComp ? ` · widget type ${selectedComp.type}` : ""}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">Select a component to edit its inventory.</p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full text-[11px]"
            disabled={invLocked || selectedComponentId == null}
            onClick={handleClear}
          >
            Clear all
          </Button>

          <div ref={fillRootRef} className="relative z-[45] space-y-1">
            <Label>Fill all slots</Label>
            <div className="flex gap-1">
              <div className="relative min-w-0 flex-1">
                <Input
                  className="h-8 font-mono text-xs"
                  placeholder="Item id…"
                  value={fillAllItemText}
                  autoComplete="off"
                  disabled={invLocked || selectedComponentId == null}
                  onChange={(e) => {
                    if (invLocked) return;
                    setFillAllItemText(e.target.value);
                    setFillSuggestOpen(true);
                    setRowSuggestRow(null);
                    setFillSuggestActiveIdx(0);
                  }}
                  onFocus={() => {
                    if (invLocked) return;
                    setFillSuggestOpen(true);
                    setRowSuggestRow(null);
                  }}
                  onKeyDown={(e) => {
                    if (!showItemPanelFill || itemSuggestions.length === 0) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setFillSuggestActiveIdx((i) => (i + 1) % itemSuggestions.length);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setFillSuggestActiveIdx((i) => (i - 1 + itemSuggestions.length) % itemSuggestions.length);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      const p = itemSuggestions[fillSuggestActiveIdx];
                      if (p) {
                        setFillAllItemText(String(p.id));
                        setFillSuggestOpen(false);
                      }
                    } else if (e.key === "Escape") {
                      setFillSuggestOpen(false);
                    }
                  }}
                />
                {showItemPanelFill ? (
                  <GamevalSearchSuggestionList
                    suggestions={itemSuggestions}
                    activeIndex={fillSuggestActiveIdx}
                    onHoverIndex={setFillSuggestActiveIdx}
                    loading={false}
                    showEmpty
                    onPick={(name) => {
                      const id = pickItemIdFromName(itemSuggestions, name);
                      if (id != null) setFillAllItemText(String(id));
                      setFillSuggestOpen(false);
                    }}
                  />
                ) : null}
              </div>
              <Input
                className="h-8 w-20 shrink-0 font-mono text-xs"
                type="number"
                min={0}
                placeholder="Amt"
                value={fillAllQtyText}
                disabled={invLocked || selectedComponentId == null}
                onChange={(e) => setFillAllQtyText(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0 text-[11px]"
                disabled={invLocked || selectedComponentId == null}
                onClick={handleFillAllSlots}
              >
                Apply
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Slot rows (def id + qty → slots 0…)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-1.5 text-[10px]"
                disabled={invLocked}
                onClick={() => setRows((r) => [...r, { itemIdText: "", qtyText: "1" }])}
              >
                <Plus className="size-3" />
                Row
              </Button>
            </div>
            {rows.map((row, idx) => (
              <div
                key={idx}
                ref={(el) => {
                  rowRootRefs.current[idx] = el;
                }}
                className="relative z-[40] flex gap-1"
              >
                <div className="relative min-w-0 flex-1">
                  <Input
                    className="h-8 font-mono text-xs"
                    placeholder="Item id…"
                    value={row.itemIdText}
                    autoComplete="off"
                    disabled={invLocked || selectedComponentId == null}
                    onChange={(e) => {
                      if (invLocked) return;
                      const t = e.target.value;
                      setRows((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx]!, itemIdText: t };
                        return next;
                      });
                      setRowSuggestRow(idx);
                      setRowSuggestOpen(true);
                      setRowSuggestActiveIdx(0);
                      setFillSuggestOpen(false);
                    }}
                    onFocus={() => {
                      if (invLocked) return;
                      setRowSuggestRow(idx);
                      setRowSuggestOpen(true);
                      setFillSuggestOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (rowSuggestRow !== idx || !showItemPanelRow || itemSuggestions.length === 0) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setRowSuggestActiveIdx((i) => (i + 1) % itemSuggestions.length);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setRowSuggestActiveIdx((i) => (i - 1 + itemSuggestions.length) % itemSuggestions.length);
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        const p = itemSuggestions[rowSuggestActiveIdx];
                        if (p) {
                          setRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx]!, itemIdText: String(p.id) };
                            return next;
                          });
                          setRowSuggestOpen(false);
                        }
                      } else if (e.key === "Escape") {
                        setRowSuggestOpen(false);
                      }
                    }}
                  />
                  {rowSuggestRow === idx && showItemPanelRow ? (
                    <GamevalSearchSuggestionList
                      suggestions={itemSuggestions}
                      activeIndex={rowSuggestActiveIdx}
                      onHoverIndex={setRowSuggestActiveIdx}
                      loading={false}
                      showEmpty
                      onPick={(name) => {
                        const id = pickItemIdFromName(itemSuggestions, name);
                        if (id != null) {
                          setRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx]!, itemIdText: String(id) };
                            return next;
                          });
                        }
                        setRowSuggestOpen(false);
                      }}
                    />
                  ) : null}
                </div>
                <Input
                  className="h-8 w-20 shrink-0 font-mono text-xs"
                  type="number"
                  min={0}
                  value={row.qtyText}
                  disabled={invLocked || selectedComponentId == null}
                  onChange={(e) =>
                    setRows((prev) => {
                      const next = [...prev];
                      next[idx] = { ...next[idx]!, qtyText: e.target.value };
                      return next;
                    })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={invLocked || rows.length <= 1}
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== idx))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              className="h-8 w-full text-[11px]"
              disabled={invLocked || selectedComponentId == null}
              onClick={handleApplyRows}
            >
              Apply rows to slots
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
