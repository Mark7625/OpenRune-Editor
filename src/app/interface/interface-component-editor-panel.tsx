"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { IDockviewPanelProps } from "dockview";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ComponentScriptArg, ComponentType } from "@/lib/interface-renderer/component-types";

import { useInterfaceEditorWorkbench } from "./interface-editor-workbench-context";

function findComponentStorageKey(
  data: { components: Record<string, ComponentType> },
  comp: ComponentType | null,
): string | null {
  if (!comp) return null;
  const byRef = Object.keys(data.components).find((k) => data.components[k] === comp);
  if (byRef) return byRef;
  return Object.keys(data.components).find((k) => data.components[k]!.id === comp.id) ?? null;
}

function parseIntSafe(s: string, fallback: number): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** RS packed RGB as used by `Rasterizer2D` (R in high byte). */
function rgbPackToHex6(packed: number): string {
  const u = packed >>> 0;
  const r = (u >> 16) & 0xff;
  const g = (u >> 8) & 0xff;
  const b = u & 0xff;
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function hex6ToRgbPack(hex: string): number {
  const clean = hex.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return 0;
  return Number.parseInt(clean, 16) >>> 0;
}

const COLOR_PACK_KEYS: (keyof ComponentType)[] = [
  "colour1",
  "colour2",
  "mouseOverColour1",
  "mouseOverColour2",
];

/** Numeric fields (excludes id, temp*, x1/y1/field*, script hooks, children). */
const PROPERTY_NUMBER_KEYS: (keyof ComponentType)[] = [
  "type",
  "buttonType",
  "clientCode",
  "x",
  "y",
  "width",
  "height",
  "trans1",
  "layer",
  "mouseOverRedirect",
  "scrollHeight",
  "textAlignH",
  "textAlignV",
  "textLineHeight",
  "textFont",
  "graphic",
  "secondaryGraphic",
  "modelKind",
  "model",
  "secondaryModelKind",
  "secondaryModel",
  "modelAnim",
  "secondaryModelAnim",
  "modelZoom",
  "modelAngleX",
  "modelAngleY",
  "modelAngleZ",
  "events",
  "widthMode",
  "heightMode",
  "xMode",
  "yMode",
  "scrollWidth",
  "angle2d",
  "outline",
  "graphicShadow",
  "modelX",
  "modelY",
  "modelObjWidth",
  "lineWid",
  "dragDeadZone",
  "dragDeadTime",
];

const PROPERTY_BOOL_KEYS: (keyof ComponentType)[] = [
  "hide",
  "fill",
  "textShadow",
  "noClickThrough",
  "tiling",
  "vFlip",
  "hFlip",
  "modelOrthog",
  "lineDirection",
  "draggableBehavior",
];

const PROPERTY_STRING_KEYS: (keyof ComponentType)[] = [
  "secondaryText",
  "text",
  "targetVerb",
  "targetBase",
  "buttonText",
  "opBase",
];

const CS1_DECODE_JSON_KEYS: (keyof ComponentType)[] = ["cs1Comparisons", "cs1ComparisonValues"];

const CS1_INSTRUCTIONS_KEY: keyof ComponentType = "cs1Instructions";

const SCRIPT_HOOK_KEYS: (keyof ComponentType)[] = [
  "onLoad",
  "onMouseOver",
  "onMouseLeave",
  "onTargetLeave",
  "onTargetEnter",
  "onVarTransmit",
  "onInvTransmit",
  "onStatTransmit",
  "onTimer",
  "onOp",
  "onMouseRepeat",
  "onClick",
  "onClickRepeat",
  "onRelease",
  "onHold",
  "onDrag",
  "onDragComplete",
  "onScrollWheel",
  "onVarTransmitList",
  "onInvTransmitList",
  "onStatTransmitList",
];

const HOOK_INT_LIST_KEYS = new Set<string>(["onVarTransmitList", "onInvTransmitList", "onStatTransmitList"]);

const ColorPackField = memo(function ColorPackField({
  fieldKey,
  value,
  onPatch,
}: {
  fieldKey: keyof ComponentType;
  value: number;
  onPatch: (partial: Partial<ComponentType>) => void;
}): JSX.Element {
  const id = `iface-color-${String(fieldKey)}`;
  const hex = rgbPackToHex6(value);
  return (
    <div className="grid grid-cols-[minmax(0,5.5rem)_auto_1fr] items-center gap-1">
      <Label htmlFor={id} className="text-[10px] text-muted-foreground">
        {String(fieldKey)}
      </Label>
      <input
        id={id}
        type="color"
        className="h-6 w-9 min-w-0 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0"
        value={hex}
        onChange={(e) => onPatch({ [fieldKey]: hex6ToRgbPack(e.target.value) } as Partial<ComponentType>)}
        aria-label={String(fieldKey)}
      />
      <Input
        type="number"
        className="h-6 min-w-0 font-mono text-[11px]"
        value={String(value)}
        onChange={(e) => onPatch({ [fieldKey]: parseIntSafe(e.target.value, value) } as Partial<ComponentType>)}
      />
    </div>
  );
});

const NumField = memo(function NumField({
  id,
  label,
  value,
  onCommit,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  onCommit: (next: number) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div className="grid grid-cols-[minmax(0,6.5rem)_1fr] items-center gap-x-2 gap-y-0.5">
      <Label htmlFor={id} className="text-[10px] text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        className="h-6 font-mono text-[11px]"
        disabled={disabled}
        value={Number.isFinite(value) ? String(value) : "0"}
        onChange={(e) => onCommit(parseIntSafe(e.target.value, value))}
      />
    </div>
  );
});

const BoolField = memo(function BoolField({
  id,
  label,
  checked,
  onCommit,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCommit: (next: boolean) => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        className="size-3.5 rounded border border-input accent-primary"
        checked={checked}
        onChange={(e) => onCommit(e.target.checked)}
      />
      <Label htmlFor={id} className="cursor-pointer text-[10px] font-normal leading-none">
        {label}
      </Label>
    </div>
  );
});

const StrField = memo(function StrField({
  id,
  label,
  value,
  onCommit,
  multiline,
}: {
  id: string;
  label: string;
  value: string;
  onCommit: (next: string) => void;
  multiline?: boolean;
}): JSX.Element {
  return (
    <div className="space-y-0.5">
      <Label htmlFor={id} className="text-[10px] text-muted-foreground">
        {label}
      </Label>
      {multiline ? (
        <textarea
          id={id}
          rows={2}
          className="w-full resize-y rounded border border-input bg-background px-1.5 py-1 font-mono text-[11px]"
          value={value}
          onChange={(e) => onCommit(e.target.value)}
        />
      ) : (
        <Input id={id} className="h-6 font-mono text-[11px]" value={value} onChange={(e) => onCommit(e.target.value)} />
      )}
    </div>
  );
});

function parseCommaSeparatedInts(s: string): number[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .map((x) => Number.parseInt(x, 10))
    .filter((n) => Number.isFinite(n));
}

const ItemIdQtyRows = memo(function ItemIdQtyRows({
  itemIds,
  itemQuantities,
  onCommit,
}: {
  itemIds: number[] | null | undefined;
  itemQuantities: number[] | null | undefined;
  onCommit: (next: { itemIds: number[] | null; itemQuantities: number[] | null }) => void;
}): JSX.Element {
  const ids = Array.isArray(itemIds) ? [...itemIds] : [];
  const qtys = Array.isArray(itemQuantities) ? [...itemQuantities] : [];
  const n = Math.max(ids.length, qtys.length);
  const paired = Array.from({ length: n }, (_, i) => ({
    id: ids[i] ?? 0,
    qty: qtys[i] ?? 0,
  }));

  const commitPaired = (rows: { id: number; qty: number }[]) => {
    if (rows.length === 0) onCommit({ itemIds: null, itemQuantities: null });
    else
      onCommit({
        itemIds: rows.map((r) => r.id),
        itemQuantities: rows.map((r) => r.qty),
      });
  };

  return (
    <div className="space-y-1">
      {n > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1 pr-7">
            <span className="min-w-0 flex-1 font-mono text-[10px] text-muted-foreground">itemId</span>
            <span className="min-w-0 flex-1 font-mono text-[10px] text-muted-foreground">qty</span>
          </div>
          {paired.map((row, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                type="number"
                className="h-6 min-w-0 flex-1 font-mono text-[11px]"
                aria-label={`Item id ${i + 1}`}
                value={String(row.id)}
                onChange={(e) => {
                  const copy = paired.map((r, j) =>
                    j === i ? { id: parseIntSafe(e.target.value, r.id), qty: r.qty } : r,
                  );
                  commitPaired(copy);
                }}
              />
              <Input
                type="number"
                className="h-6 min-w-0 flex-1 font-mono text-[11px]"
                aria-label={`Item quantity ${i + 1}`}
                value={String(row.qty)}
                onChange={(e) => {
                  const copy = paired.map((r, j) =>
                    j === i ? { id: r.id, qty: parseIntSafe(e.target.value, r.qty) } : r,
                  );
                  commitPaired(copy);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                aria-label="Remove row"
                onClick={() => commitPaired(paired.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 w-fit gap-0.5 px-2 text-[10px]"
        onClick={() => commitPaired([...paired, { id: 0, qty: 0 }])}
      >
        <Plus className="size-3" />
        Add
      </Button>
    </div>
  );
});

const NumberArrayRows = memo(function NumberArrayRows({
  label,
  value,
  onCommit,
}: {
  label?: string;
  value: number[] | null | undefined;
  onCommit: (next: number[] | null) => void;
}): JSX.Element {
  const rows = Array.isArray(value) ? [...value] : [];
  const commitRows = (next: number[]) => {
    if (next.length === 0) onCommit(null);
    else onCommit(next);
  };

  return (
    <div className="space-y-1">
      {label ? (
        <Label className="font-mono text-[10px] text-muted-foreground">{label}</Label>
      ) : null}
      {rows.length > 0 ? (
        <div className="flex flex-col gap-1">
          {rows.map((n, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                type="number"
                className="h-6 min-w-0 flex-1 font-mono text-[11px]"
                value={String(n)}
                onChange={(e) => {
                  const copy = [...rows];
                  copy[i] = parseIntSafe(e.target.value, copy[i] ?? 0);
                  commitRows(copy);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                aria-label="Remove entry"
                onClick={() => commitRows(rows.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 w-fit gap-0.5 px-2 text-[10px]"
        onClick={() => commitRows([...rows, 0])}
      >
        <Plus className="size-3" />
        Add
      </Button>
    </div>
  );
});

const StringArrayRows = memo(function StringArrayRows({
  label,
  value,
  onCommit,
}: {
  label?: string;
  value: string[];
  onCommit: (next: string[]) => void;
}): JSX.Element {
  const rows = [...value];
  return (
    <div className="space-y-1">
      {label ? <Label className="text-[10px] text-muted-foreground">{label}</Label> : null}
      {rows.length > 0 ? (
        <div className="flex flex-col gap-1">
          {rows.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                className="h-6 min-w-0 flex-1 font-mono text-[11px]"
                value={s}
                onChange={(e) => {
                  const copy = [...rows];
                  copy[i] = e.target.value;
                  onCommit(copy);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                aria-label="Remove entry"
                onClick={() => onCommit(rows.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 w-fit gap-0.5 px-2 text-[10px]"
        onClick={() => onCommit([...rows, ""])}
      >
        <Plus className="size-3" />
        Add
      </Button>
    </div>
  );
});

const OpcodeScriptsRows = memo(function OpcodeScriptsRows({
  value,
  onCommit,
  compact,
}: {
  value: number[][] | null | undefined;
  onCommit: (next: number[][] | null) => void;
  /** Omit extra titles when the parent section already names this field. */
  compact?: boolean;
}): JSX.Element {
  const scripts = Array.isArray(value) ? value.map((r) => [...r]) : [];
  const lineFor = (row: number[]) => row.join(", ");

  const commitScripts = (next: number[][]) => {
    if (next.length === 0) onCommit(null);
    else onCommit(next);
  };

  return (
    <div className="space-y-1">
      {!compact ? (
        <>
          <Label className="font-mono text-[10px] text-muted-foreground">cs1Instructions</Label>
          <p className="text-[10px] text-muted-foreground">Comma-separated opcodes per row.</p>
        </>
      ) : null}
      {scripts.length > 0 ? (
        <div className="flex flex-col gap-1">
          {scripts.map((row, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                className="h-6 min-w-0 flex-1 font-mono text-[11px]"
                placeholder="45, 0, 1054"
                value={lineFor(row)}
                onChange={(e) => {
                  const copy = scripts.map((r, j) => (j === i ? parseCommaSeparatedInts(e.target.value) : r));
                  commitScripts(copy);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                aria-label="Remove script"
                onClick={() => commitScripts(scripts.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 w-fit gap-0.5 px-2 text-[10px]"
        onClick={() => commitScripts([...scripts, []])}
      >
        <Plus className="size-3" />
        Add script
      </Button>
    </div>
  );
});

function parseHookArgLines(lines: string[]): ComponentScriptArg[] | null {
  const out: ComponentScriptArg[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t === "") out.push(null);
    else {
      try {
        out.push(JSON.parse(t) as ComponentScriptArg);
      } catch {
        return null;
      }
    }
  }
  return out;
}

const HookScriptArgRows = memo(function HookScriptArgRows({
  value,
  onCommit,
}: {
  value: ComponentScriptArg[] | null | undefined;
  onCommit: (next: ComponentScriptArg[] | null) => void;
}): JSX.Element {
  const snapshot = JSON.stringify(value ?? null);
  const [rows, setRows] = useState<string[]>(() =>
    Array.isArray(value) ? value.map((a) => JSON.stringify(a)) : [],
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    setRows(Array.isArray(value) ? value.map((a) => JSON.stringify(a)) : []);
  }, [snapshot]);

  const tryCommitLines = (lines: string[]) => {
    const parsed = parseHookArgLines(lines);
    if (parsed == null) return;
    if (parsed.length === 0) onCommit(null);
    else onCommit(parsed);
  };

  return (
    <div className="space-y-1">
      {rows.length > 0 ? (
        <div className="flex flex-col gap-1">
          {rows.map((line, i) => (
            <div key={i} className="flex items-start gap-1">
              <textarea
                className="min-h-[2.25rem] flex-1 resize-y rounded border border-input bg-background px-1.5 py-1 font-mono text-[11px] leading-snug"
                spellCheck={false}
                value={line}
                onChange={(e) => {
                  const copy = [...rows];
                  copy[i] = e.target.value;
                  setRows(copy);
                  tryCommitLines(copy);
                }}
                onBlur={() => tryCommitLines(rowsRef.current)}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-0.5 h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                aria-label="Remove arg"
                onClick={() => {
                  const copy = rows.filter((_, j) => j !== i);
                  setRows(copy);
                  tryCommitLines(copy);
                }}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 gap-0.5 px-2 text-[10px]"
        onClick={() => {
          const copy = [...rows, "null"];
          setRows(copy);
          tryCommitLines(copy);
        }}
      >
        <Plus className="size-3" />
        Add
      </Button>
    </div>
  );
});

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1 border-t border-border/70 pt-2 first:border-t-0 first:pt-0">
      <div className="text-[10px] font-medium text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

export const IfaceComponentEditorPanel = memo(function IfaceComponentEditorPanel(
  _props: IDockviewPanelProps,
): JSX.Element {
  const wb = useInterfaceEditorWorkbench();
  const [tab, setTab] = useState<"properties" | "scripts">("properties");
  const [selectedHookKey, setSelectedHookKey] = useState<keyof ComponentType>(() => SCRIPT_HOOK_KEYS[0]!);

  const storageKey = useMemo(() => {
    if (!wb.interfaceData || !wb.selectedComponent) return null;
    return findComponentStorageKey(wb.interfaceData, wb.selectedComponent);
  }, [wb.interfaceData, wb.selectedComponent]);

  const patch = useCallback(
    (partial: Partial<ComponentType>) => {
      if (storageKey == null) return;
      wb.setInterfaceData((prev) => {
        if (!prev) return prev;
        const cur = prev.components[storageKey];
        if (!cur) return prev;
        return {
          ...prev,
          components: { ...prev.components, [storageKey]: { ...cur, ...partial } },
        };
      });
      wb.setCs2RedrawNonce((n) => n + 1);
    },
    [storageKey, wb.setInterfaceData, wb.setCs2RedrawNonce],
  );

  const c = wb.selectedComponent;

  useEffect(() => {
    setSelectedHookKey(SCRIPT_HOOK_KEYS[0]!);
  }, [storageKey]);

  if (!wb.selectedId) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-background px-3 text-xs text-muted-foreground">
        Select an interface first.
      </div>
    );
  }
  if (!wb.isInterfaceLoaded || !wb.interfaceData) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-background px-3 text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!c || storageKey == null) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-background px-3 text-center text-xs text-muted-foreground">
        Pick a component in <span className="px-1 font-medium text-foreground">Component view</span> to edit its fields.
      </div>
    );
  }

  const numVal = (k: keyof ComponentType): number => {
    const v = c[k];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };

  const boolVal = (k: keyof ComponentType): boolean => Boolean(c[k]);

  const strVal = (k: keyof ComponentType): string => {
    const v = c[k];
    return typeof v === "string" ? v : "";
  };

  const isLegacy = wb.rootWidgetV3 === false;
  const scriptsTabLabel = isLegacy ? "CS1 hooks" : "CS2 hooks";

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="flex shrink-0 gap-0.5 border-b border-border/80 px-1.5 py-1">
        <Button
          type="button"
          size="sm"
          variant={tab === "properties" ? "default" : "outline"}
          className="h-6 flex-1 text-[10px]"
          onClick={() => setTab("properties")}
        >
          Properties
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "scripts" ? "default" : "outline"}
          className="h-6 flex-1 text-[10px]"
          onClick={() => setTab("scripts")}
          title={
            isLegacy
              ? "CS1 comparisons, comparison values, and instruction opcodes"
              : "CS2-style hook payloads (IF3 has no CS1 instruction block here)"
          }
        >
          {scriptsTabLabel}
        </Button>
      </div>

      {tab === "properties" ? (
        <div className="min-h-0 flex-1 space-y-0 overflow-y-auto px-2 py-1.5">
          <Section title="Identity and layout">
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {PROPERTY_NUMBER_KEYS.map((key) => (
                <NumField
                  key={key}
                  id={`iface-ed-${String(key)}`}
                  label={String(key)}
                  value={numVal(key)}
                  onCommit={(n) => patch({ [key]: n } as Partial<ComponentType>)}
                />
              ))}
            </div>
            <StrField
              id="iface-ed-internalName"
              label="internalName"
              value={c.internalName ?? ""}
              onCommit={(internalName) => patch({ internalName: internalName.trim() === "" ? null : internalName })}
            />
          </Section>

          <Section title="Colours (0xRRGGBB)">
            <div className="grid max-w-lg gap-1">
              {COLOR_PACK_KEYS.map((key) => (
                <ColorPackField key={key} fieldKey={key} value={numVal(key)} onPatch={patch} />
              ))}
            </div>
          </Section>

          <Section title="Flags">
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {PROPERTY_BOOL_KEYS.map((key) => (
                <BoolField
                  key={key}
                  id={`iface-ed-bool-${String(key)}`}
                  label={String(key)}
                  checked={boolVal(key)}
                  onCommit={(next) => patch({ [key]: next } as Partial<ComponentType>)}
                />
              ))}
            </div>
          </Section>

          <Section title="Strings">
            <div className="space-y-1">
              {PROPERTY_STRING_KEYS.map((key) => (
                <StrField
                  key={key}
                  id={`iface-ed-str-${String(key)}`}
                  label={String(key)}
                  value={strVal(key)}
                  onCommit={(next) => patch({ [key]: next } as Partial<ComponentType>)}
                />
              ))}
            </div>
          </Section>

          <Section title="op (target options)">
            <StringArrayRows value={c.op ?? []} onCommit={(op) => patch({ op })} />
          </Section>

          <Section title="itemIds · itemQuantities">
            <ItemIdQtyRows
              itemIds={c.itemIds}
              itemQuantities={c.itemQuantities}
              onCommit={(next) => patch(next)}
            />
          </Section>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-1.5">
          {isLegacy ? (
            <>
              <p className="text-[10px] leading-snug text-muted-foreground">
                + add rows · empty list → null · comma-separated opcodes per script line
              </p>
              <Section title="CS1 hooks">
                <div className="space-y-1.5">
                  {CS1_DECODE_JSON_KEYS.map((key) => (
                    <NumberArrayRows
                      key={String(key)}
                      label={String(key)}
                      value={c[key] as number[] | null | undefined}
                      onCommit={(next) => patch({ [key]: next } as Partial<ComponentType>)}
                    />
                  ))}
                  <div>
                    <div className="mb-0.5 font-mono text-[10px] text-muted-foreground">cs1Instructions</div>
                    <OpcodeScriptsRows
                      compact
                      value={c.cs1Instructions}
                      onCommit={(next) => patch({ cs1Instructions: next })}
                    />
                  </div>
                </div>
              </Section>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-[10px] text-muted-foreground">Hook</span>
                <select
                  id="iface-hook-select"
                  className="h-6 min-w-0 flex-1 rounded border border-input bg-background px-1.5 font-mono text-[11px]"
                  value={String(selectedHookKey)}
                  onChange={(e) => setSelectedHookKey(e.target.value as keyof ComponentType)}
                >
                  {SCRIPT_HOOK_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <Section title={String(selectedHookKey)}>
                {HOOK_INT_LIST_KEYS.has(String(selectedHookKey)) ? (
                  <NumberArrayRows
                    label=""
                    value={c[selectedHookKey] as number[] | null | undefined}
                    onCommit={(next) => patch({ [selectedHookKey]: next } as Partial<ComponentType>)}
                  />
                ) : (
                  <HookScriptArgRows
                    value={c[selectedHookKey] as ComponentScriptArg[] | null | undefined}
                    onCommit={(next) => patch({ [selectedHookKey]: next } as Partial<ComponentType>)}
                  />
                )}
              </Section>
            </>
          )}
        </div>
      )}
    </div>
  );
});
