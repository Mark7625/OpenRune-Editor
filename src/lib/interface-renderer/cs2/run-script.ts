import type { VarbitDefinitionLookup } from "../varbit-definition";
import { Varps, Varps_masks } from "../varps";
import { parseInterfaceParentsLookup, type ComponentType, type InterfaceEntry } from "../component-types";
import { Interpreter } from "./Interpreter";
import type { ScriptEvent } from "./script-event";
import { Script } from "./Script";
import { ScriptFrame } from "./script-frame";
import { ScriptOpcodes } from "./ScriptOpcodes";
import { Varcs } from "./varcs";
import { getCs2RuntimeContext } from "./runtime-context";

export let rootScriptEvent: ScriptEvent | null = null;
export let currentScript: Script | null = null;

export const varcs = new Varcs();

export function isWorldMapEvent(var0: number): boolean {
  return var0 === 10 || var0 === 11 || var0 === 12 || var0 === 13 || var0 === 14 || var0 === 15 || var0 === 16 || var0 === 17;
}

export function RunException_sendStackTrace(var0: string, var1: Error | null): void {
  if (var1) {
    console.error(var0, var1);
  } else {
    console.warn(var0);
  }
}

export function method5819(var0: unknown[], var1: number, var2: number): string {
  if (var2 === 0) {
    return "";
  }
  if (var2 === 1) {
    const var10 = var0[var1];
    return var10 == null ? "null" : String(var10);
  }
  const var3 = var2 + var1;
  let var4 = 0;
  for (let var5 = var1; var5 < var3; ++var5) {
    const var9 = var5 < var0.length ? var0[var5] : null;
    if (var9 == null) var4 += 4;
    else var4 += String(var9).length;
  }
  let var8 = "";
  for (let var6 = var1; var6 < var3; ++var6) {
    const var7 = var6 < var0.length ? var0[var6] : null;
    if (var7 == null) var8 += "null";
    else var8 += var7;
  }
  return var8;
}

export function method5910(
  var0: number,
  var1: number,
  lookup: VarbitDefinitionLookup | null,
  main: number[],
): void {
  if (!lookup) return;
  const var2 = lookup(var0);
  if (!var2) return;
  const var3 = var2.baseVar;
  const var4 = var2.startBit;
  const var5 = var2.endBit;
  const span = var5 - var4;
  if (span < 0 || span >= Varps_masks.length) return;
  const var6 = Varps_masks[span]! >>> 0;
  let v = var1;
  if (v < 0 || v > var6) v = 0;
  const maskW = var6 << var4;
  main[var3] = (main[var3]! & ~maskW) | ((v << var4) & maskW);
}

export function logUnhandledScriptOpcode(var0: number, var1: Script): number {
  console.info(`[method3270] unhandled script opcode=${var0} scriptId=${var1.cacheKey} name=${var1.field974}`);
  return 2;
}

const INT_MAX = 2147483647;
const INT_MIN = -2147483648;

function i32(v: number): number {
  return v | 0;
}

function javaDoubleToInt(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v === Number.POSITIVE_INFINITY) return INT_MAX;
  if (v === Number.NEGATIVE_INFINITY) return INT_MIN;
  if (v > INT_MAX) return INT_MAX;
  if (v < INT_MIN) return INT_MIN;
  return v < 0 ? Math.ceil(v) : Math.floor(v);
}

function javaIntDiv(a: number, b: number): number {
  if (b === 0) throw new Error("/ by zero");
  return i32(a / b);
}

function javaIntMod(a: number, b: number): number {
  if (b === 0) throw new Error("/ by zero");
  return i32(a % b);
}

function asCs2String(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function readNumberish(obj: Record<string, unknown>, keys: readonly string[], fallback = 0): number {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v | 0;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n | 0;
    }
  }
  return fallback;
}

function readStringish(obj: Record<string, unknown>, keys: readonly string[], fallback = ""): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string") return v;
  }
  return fallback;
}

function looksLikeEnumDef(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    "values" in o
    || "defaultString" in o
    || "defaultInt" in o
    || "outputType" in o
    || "outputtype" in o
    || "inputType" in o
    || "inputtype" in o
  );
}

function normalizeEnumDef(raw: unknown): Cs2EnumDef | null {
  if (!looksLikeEnumDef(raw)) return null;
  const o = raw as Record<string, unknown>;
  const inputType = readNumberish(o, ["inputType", "inputtype", "keyType", "keytype"], 0);
  const outputType = readNumberish(o, ["outputType", "outputtype", "valueType", "valuetype"], 0);
  const defaultInt = readNumberish(o, ["defaultInt", "defaultint", "defaultValueInt", "defaultValue"], 0);
  const defaultString = readStringish(o, ["defaultString", "defaultstring", "defaultValueString"], "");

  const intValues = new Map<number, number>();
  const stringValues = new Map<number, string>();

  const values = o.values;
  if (values && typeof values === "object" && !Array.isArray(values)) {
    for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
      const key = Number(k);
      if (!Number.isFinite(key)) continue;
      if (typeof v === "number" && Number.isFinite(v)) intValues.set(key | 0, v | 0);
      else if (typeof v === "string") stringValues.set(key | 0, v);
      else if (v && typeof v === "object" && !Array.isArray(v)) {
        const child = v as Record<string, unknown>;
        if (typeof child.value === "number" && Number.isFinite(child.value)) intValues.set(key | 0, child.value | 0);
        else if (typeof child.value === "string") stringValues.set(key | 0, child.value);
      }
    }
  }

  const keys = Array.isArray(o.keys) ? o.keys : null;
  const intVals = Array.isArray(o.intValues) ? o.intValues : null;
  const strVals = Array.isArray(o.stringValues) ? o.stringValues : null;
  if (keys) {
    for (let i = 0; i < keys.length; i++) {
      const keyRaw = keys[i];
      const key = typeof keyRaw === "number" && Number.isFinite(keyRaw) ? (keyRaw | 0) : Number(keyRaw);
      if (!Number.isFinite(key)) continue;
      const iv = intVals?.[i];
      if (typeof iv === "number" && Number.isFinite(iv)) intValues.set(key, iv | 0);
      const sv = strVals?.[i];
      if (typeof sv === "string") stringValues.set(key, sv);
    }
  }

  return { inputType, outputType, defaultInt, defaultString, intValues, stringValues };
}

async function fetchEnumDef(enumId: number): Promise<Cs2EnumDef | null> {
  const cached = enumDefCache.get(enumId);
  if (cached) return cached;

  const promise = (async () => {
    const { scriptRev, cacheHeaders } = getCs2RuntimeContext();
    const rev = encodeURIComponent(String(scriptRev));
    const urls = [
      `/api/cache-proxy/cache?type=enum&id=${enumId}&rev=${rev}`,
      `/api/cache-proxy/diff/config/enums/content?base=${rev}&rev=${rev}&id=${enumId}`,
    ];

    for (const url of urls) {
      try {
        const r = await fetch(url, { headers: cacheHeaders, cache: "force-cache" });
        if (!r.ok) continue;
        const payload = (await r.json()) as Record<string, unknown>;

        const candidates: unknown[] = [];
        if (payload.snapshot) candidates.push(payload.snapshot);
        if (payload.enum) candidates.push(payload.enum);
        if (payload.data) candidates.push(payload.data);
        if (payload.snapshots && typeof payload.snapshots === "object" && !Array.isArray(payload.snapshots)) {
          const snapshots = payload.snapshots as Record<string, unknown>;
          candidates.push(snapshots[String(enumId)]);
        }
        candidates.push(payload[String(enumId)]);
        candidates.push(payload);

        for (const c of candidates) {
          const normalized = normalizeEnumDef(c);
          if (normalized) return normalized;
        }
      } catch {
      }
    }

    return null;
  })();

  enumDefCache.set(enumId, promise);
  return promise;
}

export let scriptDotWidget: ComponentType | null = null;
export let scriptActiveWidget: ComponentType | null = null;

type RuntimeWidget = ComponentType & { childIndex?: number; __dynamicCreated?: boolean };
type Cs2EnumDef = {
  inputType: number;
  outputType: number;
  defaultInt: number;
  defaultString: string;
  intValues: Map<number, number>;
  stringValues: Map<number, string>;
};

const enumDefCache = new Map<number, Promise<Cs2EnumDef | null>>();

function invalidateWidgetRuntime(_w: ComponentType | null): void {
}

function widgetPackedId(w: RuntimeWidget | null | undefined): number {
  if (!w) return -1;
  return typeof w.packedId === "number" ? w.packedId : w.id;
}

function normalizeIntStackWindow(scriptId: number, opcode: number, pc: number): void {
  void scriptId;
  void opcode;
  void pc;
  const top = Interpreter.Interpreter_intStackSize;
  if (top <= 0) return;
  for (let i = 0; i < top; i++) {
    const v = Interpreter.Interpreter_intStack[i];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      Interpreter.Interpreter_intStack[i] = 0;
    } else {
      Interpreter.Interpreter_intStack[i] = v | 0;
    }
  }
}

class DynamicArray {
  readonly isInt: boolean;
  readonly mutable = true;
  private readonly intValues: number[] | null;
  private readonly objectValues: unknown[] | null;

  constructor(kind: number, len: number, fill: number) {
    // Java parity from posted snippet:
    // kind 115 => object/string dynamic array
    // kind 105/49 => int array filled with 0
    // otherwise int array filled with -1
    if (kind === 115) {
      this.isInt = false;
      this.objectValues = new Array<unknown>(len).fill("");
      this.intValues = null;
    } else {
      this.isInt = true;
      this.intValues = new Array<number>(len).fill(fill | 0);
      this.objectValues = null;
    }
  }

  checkIndex(idx: number): void {
    const len = this.isInt ? this.intValues!.length : this.objectValues!.length;
    if (idx < 0 || idx >= len) throw new RuntimeLimitError();
  }

  getInt(idx: number): number {
    this.checkIndex(idx);
    return this.intValues![idx]!;
  }

  setInt(idx: number, v: number): void {
    this.checkIndex(idx);
    this.intValues![idx] = v | 0;
  }

  getObject(idx: number): unknown {
    this.checkIndex(idx);
    return this.objectValues![idx] ?? null;
  }

  setObject(idx: number, v: unknown): void {
    this.checkIndex(idx);
    this.objectValues![idx] = v;
  }
}

function getDynamicArray(localIdx: number, locals: unknown[] | null): DynamicArray {
  const arr = locals?.[localIdx];
  if (!(arr instanceof DynamicArray)) throw new RuntimeLimitError();
  return arr;
}

function collectComponents(entry: InterfaceEntry): RuntimeWidget[] {
  const out: RuntimeWidget[] = [];
  const visit = (w: RuntimeWidget) => {
    out.push(w);
    if (w.children) {
      for (const ch of w.children) {
        if (ch) visit(ch as RuntimeWidget);
      }
    }
  };
  for (const w of Object.values(entry.components)) visit(w as RuntimeWidget);
  return out;
}

function getWidget(entry: InterfaceEntry, id: number): RuntimeWidget | null {
  if (!Number.isFinite(id)) return null;

  const staticWidgets = Object.values(entry.components) as RuntimeWidget[];
  const group = (id >>> 16) & 0xffff;
  const child = id & 0xffff;
  const isPacked = group !== 0;

  // Java parity: WidgetDefinition.get(var1) decodes packed id (group << 16 | child).
  if (isPacked) {
    for (const w of staticWidgets) {
      if (typeof w.packedId === "number" && w.packedId === id) {
        return w;
      }
    }
    for (const w of staticWidgets) {
      if (typeof w.packedId !== "number") continue;
      const wg = (w.packedId >>> 16) & 0xffff;
      const wc = w.packedId & 0xffff;
      if (wg === group && wc === child) {
        return w;
      }
    }
    return null;
  }

  for (const w of staticWidgets) {
    if (w.id === id) {
      return w;
    }
  }

  const all = collectComponents(entry);
  for (const w of all) {
    if (w.id === id) {
      return w;
    }
  }
  return null;
}

function getWidgetChild(entry: InterfaceEntry, parentId: number, childIndex: number): RuntimeWidget | null {
  const parent = getWidget(entry, parentId);
  if (!parent || !parent.children) return null;
  return (parent.children[childIndex] ?? null) as RuntimeWidget | null;
}

function makeWidgetLikeJava(parent: RuntimeWidget, type: number, childIndex: number): RuntimeWidget {
  const parentPacked = widgetPackedId(parent);
  const next: RuntimeWidget = {
    ...parent,
    type,
    layer: parentPacked,
    id: parentPacked,
    packedId: parentPacked,
    childIndex,
    v3: true,
    children: null,
    __dynamicCreated: true,
  };
  next.cs1Comparisons = null;
  next.cs1ComparisonValues = null;
  next.cs1Instructions = null;
  next.onLoad = null;
  next.onMouseOver = null;
  next.onMouseLeave = null;
  next.onTargetLeave = null;
  next.onTargetEnter = null;
  next.onVarTransmit = null;
  next.onInvTransmit = null;
  next.onStatTransmit = null;
  next.onTimer = null;
  next.onOp = null;
  next.onMouseRepeat = null;
  next.onClick = null;
  next.onClickRepeat = null;
  next.onRelease = null;
  next.onHold = null;
  next.onDrag = null;
  next.onDragComplete = null;
  next.onScrollWheel = null;
  next.onVarTransmitList = null;
  next.onInvTransmitList = null;
  next.onStatTransmitList = null;
  next.op = [];
  next.opBase = "";
  next.targetVerb = "";
  next.targetBase = "";
  return next;
}

function prepareParentForCcCreate(parent: RuntimeWidget, childIndex: number, requireNew: boolean, script: Script): boolean {
  void script;
  if (parent.children == null) {
    parent.children = new Array<ComponentType>(childIndex + 1);
  }
  if (parent.children.length <= childIndex) {
    const resized = new Array<ComponentType>(childIndex + 1);
    for (let i = 0; i < parent.children.length; ++i) {
      const existing = parent.children[i];
      if (existing != null) resized[i] = existing;
    }
    parent.children = resized;
    if (requireNew) {
      return false;
    }
  }
  if (childIndex > 0 && parent.children[childIndex - 1] == null) {
    return false;
  }
  return true;
}

function initType12Widget(widget: RuntimeWidget): void {
  void widget;
  // Java path invokes extra type-12 setup; keep a hook here.
}

export function method898(var0: number, var1: Script, var2: boolean): number {
  void var1;
  const entry = getCs2RuntimeContext().interfaceEntry;
  if (!entry) return 2;

  let var4: number;
  let var9: number;
  if (var0 === ScriptOpcodes.CC_CREATE) {
    const preSize = Interpreter.Interpreter_intStackSize;
    if (preSize < 4) {
      Interpreter.Interpreter_intStackSize = 0;
      return 1;
    }
    Interpreter.Interpreter_intStackSize -= 4;
    const readBase = Interpreter.Interpreter_intStackSize;
    const rawParent = Interpreter.Interpreter_intStack[readBase];
    const rawType = Interpreter.Interpreter_intStack[readBase + 1];
    const rawChildIndex = Interpreter.Interpreter_intStack[readBase + 2];
    const rawRequireNew = Interpreter.Interpreter_intStack[readBase + 3];
    var9 = Number(rawParent);
    var4 = Number(rawType);
    const var11 = Number(rawChildIndex);
    const var13 = Number(rawRequireNew) !== 0;

    if (!Number.isFinite(var9) || !Number.isFinite(var4) || !Number.isFinite(var11)) {
      return 1;
    }

    if (var4 === 0) return 1;
    if (var11 < 0) return 1;
    const var6 = getWidget(entry, var9);
    if (!var6) return 1;
    if (var6.type !== 0) return 1;
    const parentReady = prepareParentForCcCreate(var6, var11, var13, var1);
    if (!parentReady) return 1;
    const nextChildren = var6.children;
    const var12 = makeWidgetLikeJava(var6, var4, var11);
    if (var4 === 12) {
      initType12Widget(var12);
    }
    nextChildren[var11] = var12;

    if (var2) {
      scriptDotWidget = var12;
    } else {
      scriptActiveWidget = var12;
    }
    invalidateWidgetRuntime(var6);
    return 1;
  } else {
    let var3: RuntimeWidget | null;
    if (var0 === ScriptOpcodes.CC_DELETE) {
      var3 = (var2 ? scriptDotWidget : scriptActiveWidget) as RuntimeWidget | null;
      if (!var3) return 1;
      const var10 = getWidget(entry, var3.id);
      if (!var10 || !var10.children) return 1;
      const idx = typeof var3.childIndex === "number" ? var3.childIndex : -1;
      if (idx >= 0 && idx < var10.children.length) {
        delete var10.children[idx];
      }
      invalidateWidgetRuntime(var10);
      return 1;
    } else if (var0 === ScriptOpcodes.CC_DELETEALL) {
      const targetId = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
      var3 = getWidget(entry, targetId);
      if (!var3) {
        return 1;
      }
      var3.children = null;
      invalidateWidgetRuntime(var3);
      return 1;
    } else if (var0 !== ScriptOpcodes.CC_FIND) {
      if (var0 === ScriptOpcodes.IF_FIND) {
        var3 = getWidget(entry, Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!);
        if (var3 != null) {
          Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 1;
          if (var2) {
            scriptDotWidget = var3;
          } else {
            scriptActiveWidget = var3;
          }
        } else {
          Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
        }
        return 1;
      } else {
        return 2;
      }
    } else {
      Interpreter.Interpreter_intStackSize -= 2;
      var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      const var5 = getWidgetChild(entry, var9, var4);
      if (var5 != null && var4 !== -1) {
        Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 1;
        if (var2) {
          scriptDotWidget = var5;
        } else {
          scriptActiveWidget = var5;
        }
      } else {
        Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
      }
      return 1;
    }
  }
}

export function method3514(var0: number, var1: Script, var2: boolean): number {
  void var1;
  void var2;
  const entry = getCs2RuntimeContext().interfaceEntry;
  if (!entry) return 2;

  const var3 = getWidget(entry, Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!);
  if (!var3) return 2;

  if (var0 === ScriptOpcodes.IF_GETX) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.x;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETY) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.y;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETWIDTH) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.width;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETHEIGHT) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.height;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETHIDE) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.hide ? 1 : 0;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETLAYER) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.layer;
    return 1;
  } else {
    return 2;
  }
}

export function method6300(var0: number, var1: Script, var2: boolean): number {
  void var1;
  const entry = getCs2RuntimeContext().interfaceEntry;

  let var4: RuntimeWidget | null;
  if (var0 >= 2000) {
    var0 -= 1000;
    const targetId = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    var4 = entry ? getWidget(entry, targetId) : null;
  } else {
    var4 = (var2 ? scriptDotWidget : scriptActiveWidget) as RuntimeWidget | null;
  }

  const hasWidget = var4 != null;

  if (var0 === ScriptOpcodes.CC_SETPOSITION) {
    Interpreter.Interpreter_intStackSize -= 4;
    if (hasWidget) {
      var4.x = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4.y = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      var4.xMode = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 2]!;
      var4.yMode = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 3]!;
      invalidateWidgetRuntime(var4);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETSIZE) {
    Interpreter.Interpreter_intStackSize -= 4;
    if (hasWidget) {
      var4.width = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4.height = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      var4.widthMode = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 2]!;
      var4.heightMode = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 3]!;
      invalidateWidgetRuntime(var4);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETHIDE) {
    const var5 = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]! === 1;
    if (hasWidget && var5 !== var4.hide) {
      var4.hide = var5;
      invalidateWidgetRuntime(var4);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETNOCLICKTHROUGH) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]! === 1;
    if (hasWidget) var4.noClickThrough = v;
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETNOSCROLLTHROUGH) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]! === 1;
    if (hasWidget) (var4 as RuntimeWidget & { noScrollThrough?: boolean }).noScrollThrough = v;
    return 1;
  } else {
    return 2;
  }
}

export function method6861(var0: number, var1: Script, var2: boolean): number {
  void var1;
  const entry = getCs2RuntimeContext().interfaceEntry;

  let var3: RuntimeWidget | null;
  if (var0 >= 2000) {
    var0 -= 1000;
    const targetId = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    var3 = entry ? getWidget(entry, targetId) : null;
  } else {
    var3 = (var2 ? scriptDotWidget : scriptActiveWidget) as RuntimeWidget | null;
  }
  const hasWidget = var3 != null;

  if (var0 === ScriptOpcodes.CC_SETSCROLLPOS) {
    Interpreter.Interpreter_intStackSize -= 2;
    if (hasWidget) {
      (var3 as RuntimeWidget & { scrollX?: number }).scrollX = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      (var3 as RuntimeWidget & { scrollY?: number }).scrollY =
        Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETCOLOUR) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) {
      var3.colour1 = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETFILL) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]! === 1;
    if (hasWidget) {
      var3.fill = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETTRANS) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) {
      var3.trans1 = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETLINEWID) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) {
      var3.lineWid = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETGRAPHIC) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) {
      var3.graphic = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SET2DANGLE) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) {
      var3.angle2d = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETTILING) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]! === 1;
    if (hasWidget) {
      var3.tiling = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETMODEL) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) {
      var3.modelKind = 1;
      var3.model = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETMODELANGLE) {
    Interpreter.Interpreter_intStackSize -= 6;
    if (hasWidget) {
      var3.modelX = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var3.modelY = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      var3.modelAngleX = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 2]!;
      var3.modelAngleY = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 3]!;
      var3.modelAngleZ = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 4]!;
      var3.modelZoom = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 5]!;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETMODELANIM) {
    const var8 = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget && var8 !== var3.modelAnim) {
      var3.modelAnim = var8;
      (var3 as RuntimeWidget & { modelFrame?: number; modelFrameCycle?: number }).modelFrame = 0;
      (var3 as RuntimeWidget & { modelFrame?: number; modelFrameCycle?: number }).modelFrameCycle = 0;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETMODELORTHOG) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]! === 1;
    if (hasWidget) {
      var3.modelOrthog = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETTEXT) {
    const var7 = asCs2String(Interpreter.Interpreter_stringStack[--Interpreter.Interpreter_stringStackSize]);
    if (hasWidget && var7 !== var3.text) {
      var3.text = var7;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETTEXTFONT) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) {
      var3.textFont = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETTEXTALIGN) {
    Interpreter.Interpreter_intStackSize -= 3;
    if (hasWidget) {
      var3.textAlignH = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var3.textAlignV = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      var3.textLineHeight = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 2]!;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETTEXTSHADOW) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]! === 1;
    if (hasWidget) {
      var3.textShadow = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETOUTLINE) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) {
      var3.outline = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETGRAPHICSHADOW) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) {
      var3.graphicShadow = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETVFLIP) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]! === 1;
    if (hasWidget) {
      var3.vFlip = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETHFLIP) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]! === 1;
    if (hasWidget) {
      var3.hFlip = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETSCROLLSIZE) {
    Interpreter.Interpreter_intStackSize -= 2;
    if (hasWidget) {
      var3.scrollWidth = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var3.scrollHeight = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETGRAPHIC2) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) {
      var3.secondaryGraphic = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETFILLCOLOUR) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) {
      var3.colour2 = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETTRANSBOTTOM) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) {
      (var3 as RuntimeWidget & { transparencyBot?: number }).transparencyBot = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETFILLMODE) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) {
      (var3 as RuntimeWidget & { fillMode?: number }).fillMode = v;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETMODELTRANSPARENT) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]! === 1;
    if (hasWidget) {
      (var3 as RuntimeWidget & { modelTransparency?: boolean }).modelTransparency = v;
    }
    return 1;
  } else if (
    var0 === ScriptOpcodes.CC_SETOBJECT
    || var0 === ScriptOpcodes.CC_SETOBJECT_NONUM
    || var0 === ScriptOpcodes.CC_SETOBJECT_ALWAYS_NUM
  ) {
    Interpreter.Interpreter_intStackSize -= 2;
    const itemId = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
    const itemQty = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
    if (hasWidget) {
      var3.modelKind = 4;
      var3.model = itemId;
      (var3 as RuntimeWidget & { itemId?: number; itemQuantity?: number; itemQuantityMode?: number }).itemId = itemId;
      (var3 as RuntimeWidget & { itemId?: number; itemQuantity?: number; itemQuantityMode?: number }).itemQuantity = itemQty;
      (var3 as RuntimeWidget & { itemId?: number; itemQuantity?: number; itemQuantityMode?: number }).itemQuantityMode =
        var0 === ScriptOpcodes.CC_SETOBJECT_ALWAYS_NUM ? 1 : (var0 === ScriptOpcodes.CC_SETOBJECT_NONUM ? 0 : 2);
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETNPCHEAD) {
    const npcId = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) {
      var3.modelKind = 2;
      var3.model = npcId;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETPLAYERHEAD_SELF) {
    if (hasWidget) {
      var3.modelKind = 3;
      var3.model = 0;
      invalidateWidgetRuntime(var3);
    }
    return 1;
  } else {
    return 2;
  }
}

export function method7946(var0: number, var1: Script, var2: boolean): number {
  void var1;
  const entry = getCs2RuntimeContext().interfaceEntry;

  let var4: RuntimeWidget | null;
  if (var0 >= 2000) {
    var0 -= 1000;
    const targetId = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    var4 = entry ? getWidget(entry, targetId) : null;
  } else {
    var4 = (var2 ? scriptDotWidget : scriptActiveWidget) as RuntimeWidget | null;
  }
  const hasWidget = var4 != null;

  if (var0 === ScriptOpcodes.CC_SETOP) {
    const var11 = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]! - 1;
    if (var11 >= 0 && var11 <= 9) {
      const value = asCs2String(Interpreter.Interpreter_stringStack[--Interpreter.Interpreter_stringStackSize]);
      if (hasWidget) {
        const nextOps = Array.isArray(var4.op) ? [...var4.op] : [];
        nextOps[var11] = value;
        var4.op = nextOps;
      }
      return 1;
    } else {
      --Interpreter.Interpreter_stringStackSize;
      return 1;
    }
  } else if (var0 === ScriptOpcodes.CC_SETDRAGGABLE) {
    Interpreter.Interpreter_intStackSize -= 2;
    const parentId = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
    const childIndex = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
    if (hasWidget && entry) {
      const dragParent = getWidgetChild(entry, parentId, childIndex);
      (var4 as RuntimeWidget & { dragParent?: RuntimeWidget | null }).dragParent = dragParent;
    }
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETDRAGGABLEBEHAVIOR) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]! === 1;
    if (hasWidget) var4.draggableBehavior = v;
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETDRAGDEADZONE) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) var4.dragDeadZone = v;
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETDRAGDEADTIME) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (hasWidget) var4.dragDeadTime = v;
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETOPBASE) {
    const v = asCs2String(Interpreter.Interpreter_stringStack[--Interpreter.Interpreter_stringStackSize]);
    if (hasWidget) var4.opBase = v;
    return 1;
  } else if (var0 === ScriptOpcodes.CC_SETTARGETVERB) {
    const v = asCs2String(Interpreter.Interpreter_stringStack[--Interpreter.Interpreter_stringStackSize]);
    if (hasWidget) var4.targetVerb = v;
    return 1;
  } else if (var0 === ScriptOpcodes.CC_CLEAROPS) {
    if (hasWidget) var4.op = [];
    return 1;
  } else {
    return 2;
  }
}

export function method7905(var0: number, var1: Script, var2: boolean): number {
  void var1;
  void var2;
  let var4: number;
  let var9: number;
  if (var0 === ScriptOpcodes.ADD) {
    Interpreter.Interpreter_intStackSize -= 2;
    var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
    var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = i32(var9 + var4);
    return 1;
  } else if (var0 === ScriptOpcodes.SUB) {
    Interpreter.Interpreter_intStackSize -= 2;
    var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
    var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = i32(var9 - var4);
    return 1;
  } else if (var0 === ScriptOpcodes.MULTIPLY) {
    Interpreter.Interpreter_intStackSize -= 2;
    var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
    var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = Math.imul(var4, var9);
    return 1;
  } else if (var0 === ScriptOpcodes.DIV) {
    Interpreter.Interpreter_intStackSize -= 2;
    var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
    var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = javaIntDiv(var9, var4);
    return 1;
  } else if (var0 === ScriptOpcodes.RANDOM) {
    var9 = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = javaDoubleToInt(Math.random() * var9);
    return 1;
  } else if (var0 === ScriptOpcodes.RANDOMINC) {
    var9 = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = javaDoubleToInt(Math.random() * (var9 + 1));
    return 1;
  } else {
    let var5: number;
    let var6: number;
    let var7: number;
    if (var0 === ScriptOpcodes.INTERPOLATE) {
      Interpreter.Interpreter_intStackSize -= 5;
      var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      var5 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 2]!;
      var6 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 3]!;
      var7 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 4]!;
      const num = Math.imul(i32(var7 - var5), i32(var4 - var9));
      const den = i32(var6 - var5);
      Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = i32(var9 + javaIntDiv(num, den));
      return 1;
    } else if (var0 === ScriptOpcodes.ADDPERCENT) {
      Interpreter.Interpreter_intStackSize -= 2;
      var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      const scaled = javaIntDiv(Math.imul(var9, var4), 100);
      Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = i32(var9 + scaled);
      return 1;
    } else if (var0 === ScriptOpcodes.SETBIT) {
      Interpreter.Interpreter_intStackSize -= 2;
      var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var9 | (1 << var4);
      return 1;
    } else if (var0 === ScriptOpcodes.CLEARBIT) {
      Interpreter.Interpreter_intStackSize -= 2;
      var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var9 & (-1 - (1 << var4));
      return 1;
    } else if (var0 === ScriptOpcodes.TESTBIT) {
      Interpreter.Interpreter_intStackSize -= 2;
      var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = (var9 & (1 << var4)) !== 0 ? 1 : 0;
      return 1;
    } else if (var0 === ScriptOpcodes.MOD) {
      Interpreter.Interpreter_intStackSize -= 2;
      var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = javaIntMod(var9, var4);
      return 1;
    } else if (var0 === ScriptOpcodes.POW) {
      Interpreter.Interpreter_intStackSize -= 2;
      var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      if (var9 === 0) {
        Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
      } else {
        Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = javaDoubleToInt(Math.pow(var9, var4));
      }
      return 1;
    } else if (var0 === ScriptOpcodes.INVPOW) {
      Interpreter.Interpreter_intStackSize -= 2;
      var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      if (var9 === 0) {
        Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
        return 1;
      } else {
        switch (var4) {
          case 0:
            Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 2147483647;
            break;
          case 1:
            Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var9;
            break;
          case 2:
            Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = javaDoubleToInt(Math.sqrt(var9));
            break;
          case 3:
            Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = javaDoubleToInt(Math.cbrt(var9));
            break;
          case 4:
            Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = javaDoubleToInt(Math.sqrt(Math.sqrt(var9)));
            break;
          default:
            Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = javaDoubleToInt(Math.pow(var9, 1.0 / var4));
        }
        return 1;
      }
    } else if (var0 === ScriptOpcodes.AND) {
      Interpreter.Interpreter_intStackSize -= 2;
      var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var9 & var4;
      return 1;
    } else if (var0 === ScriptOpcodes.OR) {
      Interpreter.Interpreter_intStackSize -= 2;
      var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var9 | var4;
      return 1;
    } else if (var0 === ScriptOpcodes.MIN) {
      Interpreter.Interpreter_intStackSize -= 2;
      var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var9 < var4 ? var9 : var4;
      return 1;
    } else if (var0 === ScriptOpcodes.MAX) {
      Interpreter.Interpreter_intStackSize -= 2;
      var9 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
      var4 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
      Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var9 > var4 ? var9 : var4;
      return 1;
    } else if (var0 === ScriptOpcodes.SCALE) {
      Interpreter.Interpreter_intStackSize -= 3;
      const var10 = BigInt(Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!);
      const var12 = BigInt(Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!);
      const var14 = BigInt(Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 2]!);
      if (var12 === BigInt(0)) throw new Error("/ by zero");
      Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = Number(BigInt.asIntN(32, (var14 * var10) / var12));
      return 1;
    } else {
      return 2;
    }
  }
}

function formatSignedInt(v: number): string {
  return v >= 0 ? `+${v}` : `${v}`;
}

export function method6884(var0: number, var1: Script, var2: boolean): number {
  void var1;
  void var2;

  let v1: string;
  let v2: string;
  let i1: number;

  if (var0 === ScriptOpcodes.APPEND_NUM) {
    v1 = asCs2String(Interpreter.Interpreter_stringStack[--Interpreter.Interpreter_stringStackSize]);
    i1 = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = v1 + i1;
    return 1;
  } else if (var0 === ScriptOpcodes.APPEND) {
    Interpreter.Interpreter_stringStackSize -= 2;
    v1 = asCs2String(Interpreter.Interpreter_stringStack[Interpreter.Interpreter_stringStackSize]);
    v2 = asCs2String(Interpreter.Interpreter_stringStack[Interpreter.Interpreter_stringStackSize + 1]);
    Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = v1 + v2;
    return 1;
  } else if (var0 === ScriptOpcodes.APPEND_SIGNNUM) {
    v1 = asCs2String(Interpreter.Interpreter_stringStack[--Interpreter.Interpreter_stringStackSize]);
    i1 = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = v1 + formatSignedInt(i1);
    return 1;
  } else if (var0 === ScriptOpcodes.LOWERCASE) {
    v1 = asCs2String(Interpreter.Interpreter_stringStack[--Interpreter.Interpreter_stringStackSize]);
    Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = v1.toLowerCase();
    return 1;
  } else if (var0 === ScriptOpcodes.TOSTRING) {
    i1 = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = String(i1);
    return 1;
  } else if (var0 === ScriptOpcodes.PARAHEIGHT || var0 === ScriptOpcodes.PARAWIDTH) {
    // Consume: text + max width + font id; return measured metric.
    --Interpreter.Interpreter_stringStackSize;
    Interpreter.Interpreter_intStackSize -= 2;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
    return 1;
  } else if (var0 === ScriptOpcodes.STRING_LENGTH) {
    v1 = asCs2String(Interpreter.Interpreter_stringStack[--Interpreter.Interpreter_stringStackSize]);
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = v1.length;
    return 1;
  } else {
    return 2;
  }
}

type ListenerDecodeResult = {
  args: unknown[] | null;
  triggers: number[] | null;
};

function decodeListenerArguments(): ListenerDecodeResult {
  let var4 = asCs2String(Interpreter.Interpreter_stringStack[--Interpreter.Interpreter_stringStackSize]);
  let var5: number[] | null = null;
  if (var4.endsWith("Y")) {
    const var6 = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    if (var6 > 0) {
      var5 = new Array<number>(var6);
      for (let i = var6 - 1; i >= 0; --i) {
        var5[i] = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
      }
    } else {
      var5 = [];
    }
    var4 = var4.slice(0, -1);
  }

  const var9 = new Array<unknown>(var4.length + 1);
  for (let i = var9.length - 1; i >= 1; --i) {
    if (var4.charAt(i - 1) === "s") {
      var9[i] = asCs2String(Interpreter.Interpreter_stringStack[--Interpreter.Interpreter_stringStackSize]);
    } else {
      var9[i] = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    }
  }

  const var10 = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
  if (var10 !== -1) {
    var9[0] = var10;
    return { args: var9, triggers: var5 };
  }
  return { args: null, triggers: var5 };
}

export function method11(var0: number, var1: Script, var2: boolean): number {
  void var1;
  const entry = getCs2RuntimeContext().interfaceEntry;
  if (!entry) return 2;

  let var3: RuntimeWidget | null;
  if (var0 >= 2000) {
    var0 -= 1000;
    var3 = getWidget(entry, Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!);
  } else {
    var3 = (var2 ? scriptDotWidget : scriptActiveWidget) as RuntimeWidget | null;
  }
  if (!var3) return 2;

  const { args, triggers } = decodeListenerArguments();
  if (var0 === ScriptOpcodes.CC_SETONCLICK) {
    var3.onClick = args as ComponentType["onClick"];
  } else if (var0 === ScriptOpcodes.CC_SETONHOLD) {
    var3.onHold = args as ComponentType["onHold"];
  } else if (var0 === ScriptOpcodes.CC_SETONRELEASE) {
    var3.onRelease = args as ComponentType["onRelease"];
  } else if (var0 === ScriptOpcodes.CC_SETONMOUSEOVER) {
    var3.onMouseOver = args as ComponentType["onMouseOver"];
  } else if (var0 === ScriptOpcodes.CC_SETONMOUSELEAVE) {
    var3.onMouseLeave = args as ComponentType["onMouseLeave"];
  } else if (var0 === ScriptOpcodes.CC_SETONDRAG) {
    var3.onDrag = args as ComponentType["onDrag"];
  } else if (var0 === ScriptOpcodes.CC_SETONTARGETLEAVE) {
    var3.onTargetLeave = args as ComponentType["onTargetLeave"];
  } else if (var0 === ScriptOpcodes.CC_SETONVARTRANSMIT) {
    var3.onVarTransmit = args as ComponentType["onVarTransmit"];
    var3.onVarTransmitList = triggers;
  } else if (var0 === ScriptOpcodes.CC_SETONTIMER) {
    var3.onTimer = args as ComponentType["onTimer"];
  } else if (var0 === ScriptOpcodes.CC_SETONOP) {
    var3.onOp = args as ComponentType["onOp"];
  } else if (var0 === ScriptOpcodes.CC_SETONDRAGCOMPLETE) {
    var3.onDragComplete = args as ComponentType["onDragComplete"];
  } else if (var0 === ScriptOpcodes.CC_SETONCLICKREPEAT) {
    var3.onClickRepeat = args as ComponentType["onClickRepeat"];
  } else if (var0 === ScriptOpcodes.CC_SETONMOUSEREPEAT) {
    var3.onMouseRepeat = args as ComponentType["onMouseRepeat"];
  } else if (var0 === ScriptOpcodes.CC_SETONINVTRANSMIT) {
    var3.onInvTransmit = args as ComponentType["onInvTransmit"];
    var3.onInvTransmitList = triggers;
  } else if (var0 === ScriptOpcodes.CC_SETONSTATTRANSMIT) {
    var3.onStatTransmit = args as ComponentType["onStatTransmit"];
    var3.onStatTransmitList = triggers;
  } else if (var0 === ScriptOpcodes.CC_SETONTARGETENTER) {
    var3.onTargetEnter = args as ComponentType["onTargetEnter"];
  } else if (var0 === ScriptOpcodes.CC_SETONSCROLLWHEEL) {
    var3.onScrollWheel = args as ComponentType["onScrollWheel"];
  } else if (var0 === ScriptOpcodes.CC_SETONKEY) {
    (var3 as RuntimeWidget & { onKey?: unknown[] | null }).onKey = args;
  } else if (var0 === ScriptOpcodes.CC_SETONRESIZE) {
    (var3 as RuntimeWidget & { onResize?: unknown[] | null }).onResize = args;
  } else if (var0 === ScriptOpcodes.CC_SETONCHATTRANSMIT) {
    (var3 as RuntimeWidget & { onChatTransmit?: unknown[] | null }).onChatTransmit = args;
  } else if (var0 === ScriptOpcodes.CC_SETONFRIENDTRANSMIT) {
    (var3 as RuntimeWidget & { onFriendTransmit?: unknown[] | null }).onFriendTransmit = args;
  } else if (var0 === ScriptOpcodes.CC_SETONCLANTRANSMIT) {
    (var3 as RuntimeWidget & { onClanTransmit?: unknown[] | null }).onClanTransmit = args;
  } else if (var0 === ScriptOpcodes.CC_SETONMISCTRANSMIT) {
    (var3 as RuntimeWidget & { onMiscTransmit?: unknown[] | null }).onMiscTransmit = args;
  } else if (var0 === ScriptOpcodes.CC_SETONDIALOGABORT) {
    (var3 as RuntimeWidget & { onDialogAbort?: unknown[] | null }).onDialogAbort = args;
  } else if (var0 === ScriptOpcodes.CC_SETONSUBCHANGE) {
    (var3 as RuntimeWidget & { onSubChange?: unknown[] | null }).onSubChange = args;
  } else if (var0 === ScriptOpcodes.CC_SETONSTOCKTRANSMIT) {
    (var3 as RuntimeWidget & { onStockTransmit?: unknown[] | null }).onStockTransmit = args;
  } else if (var0 === ScriptOpcodes.CC_SETONCLANSETTINGSTRANSMIT) {
    (var3 as RuntimeWidget & { onClanSettingsTransmit?: unknown[] | null }).onClanSettingsTransmit = args;
  } else if (var0 === ScriptOpcodes.CC_SETONCLANCHANNELTRANSMIT) {
    (var3 as RuntimeWidget & { onClanChannelTransmit?: unknown[] | null }).onClanChannelTransmit = args;
  } else {
    return 2;
  }
  (var3 as RuntimeWidget & { hasListener?: boolean }).hasListener = true;
  return 1;
}

export function method1204(var0: number, var1: Script, var2: boolean): number {
  void var1;
  const var3 = (var2 ? scriptDotWidget : scriptActiveWidget) as RuntimeWidget | null;

  if (var0 === ScriptOpcodes.CC_GETX) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3?.x ?? 0;
    return 1;
  } else if (var0 === ScriptOpcodes.CC_GETY) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3?.y ?? 0;
    return 1;
  } else if (var0 === ScriptOpcodes.CC_GETWIDTH) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3?.width ?? 0;
    return 1;
  } else if (var0 === ScriptOpcodes.CC_GETHEIGHT) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3?.height ?? 0;
    return 1;
  } else if (var0 === ScriptOpcodes.CC_GETHIDE) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3?.isHidden ? 1 : 0;
    return 1;
  } else if (var0 === ScriptOpcodes.CC_GETLAYER) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3?.layer ?? -1;
    return 1;
  } else {
    return 2;
  }
}

export function method1899(var0: number, var1: Script, var2: boolean): number {
  void var1;
  void var2;

  if (var0 === ScriptOpcodes.MES) {
    --Interpreter.Interpreter_stringStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.ANIM) {
    Interpreter.Interpreter_intStackSize -= 2;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_CLOSE) {
    return 1;
  } else if (var0 === ScriptOpcodes.RESUME_COUNTDIALOG) {
    --Interpreter.Interpreter_stringStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.RESUME_NAMEDIALOG) {
    --Interpreter.Interpreter_stringStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.RESUME_STRINGDIALOG) {
    --Interpreter.Interpreter_stringStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.OPPLAYER) {
    --Interpreter.Interpreter_stringStackSize;
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_DRAGPICKUP) {
    Interpreter.Interpreter_intStackSize -= 3;
    return 1;
  } else if (var0 === ScriptOpcodes.CC_DRAGPICKUP) {
    Interpreter.Interpreter_intStackSize -= 2;
    return 1;
  } else if (var0 === ScriptOpcodes.MOUSECAM) {
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.GETREMOVEROOFS) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
    return 1;
  } else if (var0 === ScriptOpcodes.SETREMOVEROOFS) {
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.OPENURL) {
    --Interpreter.Interpreter_stringStackSize;
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.RESUME_OBJDIALOG) {
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.BUG_REPORT) {
    Interpreter.Interpreter_stringStackSize -= 2;
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.SETSHIFTCLICKDROP) {
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.SETSHOWMOUSEOVERTEXT) {
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.RENDERSELF) {
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.SETSHOWMOUSECROSS) {
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.SETSHOWLOADINGMESSAGES) {
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.SETTAPTODROP) {
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.GETTAPTODROP) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
    return 1;
  } else if (var0 === ScriptOpcodes.SETOCULUSORBSPEED) {
    Interpreter.Interpreter_intStackSize -= 2;
    return 1;
  } else if (var0 === ScriptOpcodes.GETCANVASSIZE) {
    const { canvasWidth, canvasHeight } = getCs2RuntimeContext();
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = canvasWidth ?? 765;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = canvasHeight ?? 503;
    return 1;
  } else if (var0 === ScriptOpcodes.MOBILE_SETFPS) {
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.MOBILE_OPENSTORE) {
    return 1;
  } else if (var0 === ScriptOpcodes.MOBILE_OPENSTORECATEGORY) {
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.SETHIDEUSERNAME) {
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.GETHIDEUSERNAME) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
    return 1;
  } else if (var0 === ScriptOpcodes.SETREMEMBERUSERNAME) {
    --Interpreter.Interpreter_intStackSize;
    return 1;
  } else if (var0 === ScriptOpcodes.GETREMEMBERUSERNAME) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
    return 1;
  } else if (var0 === ScriptOpcodes.SHOW_IOS_REVIEW) {
    return 1;
  } else {
    return 2;
  }
}

export function method1190(var0: number, var1: Script, var2: boolean): number {
  void var1;
  const entry = getCs2RuntimeContext().interfaceEntry;
  if (!entry) return 2;

  const var3 = getWidget(entry, Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!);
  if (!var3) return 2;

  if (var0 === ScriptOpcodes.IF_GETSCROLLX) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] =
      (var3 as RuntimeWidget & { scrollX?: number }).scrollX ?? 0;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETSCROLLY) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] =
      (var3 as RuntimeWidget & { scrollY?: number }).scrollY ?? 0;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETTEXT) {
    Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = var3.text ?? "";
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETSCROLLWIDTH) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.scrollWidth;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETSCROLLHEIGHT) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.scrollHeight;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETMODELZOOM) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.modelZoom;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETMODELANGLE_X) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.modelAngleX;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETMODELANGLE_Z) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.modelAngleZ;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETMODELANGLE_Y) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.modelAngleY;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETTRANS) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.trans1;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETCOLOUR) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.colour1;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETFILLCOLOUR) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3.colour2;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETMODELTRANSPARENT) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] =
      (var3 as RuntimeWidget & { modelTransparency?: boolean }).modelTransparency ? 1 : 0;
    return 1;
  } else {
    return 2;
  }
}

export function method4035(var0: number, var1: Script, var2: boolean): number {
  void var1;
  void var2;
  const entry = getCs2RuntimeContext().interfaceEntry;
  if (!entry) return 2;

  if (var0 === ScriptOpcodes.IF_GETINVOBJECT) {
    const var3 = getWidget(entry, Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!);
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var3?.model ?? -1;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETINVCOUNT) {
    const var3 = getWidget(entry, Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!);
    const count = (var3 as RuntimeWidget & { itemCount?: number; itemQuantity?: number } | null)?.itemCount
      ?? (var3 as RuntimeWidget & { itemCount?: number; itemQuantity?: number } | null)?.itemQuantity
      ?? 0;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = count;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_HASSUB) {
    const packed = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    const parents = parseInterfaceParentsLookup(entry.interfaceParents);
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = parents?.has(packed) ? 1 : 0;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETUNKNOWN_2704 || var0 === ScriptOpcodes.IF_GETUNKNOWN_2705) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
    return 1;
  } else if (var0 === ScriptOpcodes.IF_GETTOP) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = -1;
    return 1;
  } else {
    return 2;
  }
}

export function method462(var0: number, var1: Script, var2: boolean): number {
  void var1;
  const var3 = (var2 ? scriptDotWidget : scriptActiveWidget) as RuntimeWidget | null;

  if (var0 === ScriptOpcodes.CC_GETINVOBJECT) {
    const itemId = (var3 as RuntimeWidget & { itemId?: number } | null)?.itemId;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] =
      typeof itemId === "number" ? itemId : (var3?.model ?? -1);
    return 1;
  } else if (var0 === ScriptOpcodes.CC_GETINVCOUNT) {
    const qty = (var3 as RuntimeWidget & { itemQuantity?: number; itemCount?: number } | null)?.itemQuantity
      ?? (var3 as RuntimeWidget & { itemQuantity?: number; itemCount?: number } | null)?.itemCount
      ?? 0;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = qty;
    return 1;
  } else if (var0 === ScriptOpcodes.CC_GETID) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = widgetPackedId(var3);
    return 1;
  } else if (var0 === ScriptOpcodes.CC_GETUNKNOWN_1704) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
    return 1;
  } else {
    return 2;
  }
}

export function method3161(var0: number, var1: Script, var2: boolean): number {
  void var1;
  void var2;

  if (var0 === ScriptOpcodes.ON_MOBILE) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
    return 1;
  } else if (var0 === ScriptOpcodes.CLIENTTYPE) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 1;
    return 1;
  } else if (var0 === ScriptOpcodes.MOBILE_KEYBOARDHIDE) {
    return 1;
  } else if (var0 === ScriptOpcodes.MOBILE_BATTERYLEVEL) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = -1;
    return 1;
  } else if (var0 === ScriptOpcodes.MOBILE_BATTERYCHARGING) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 1;
    return 1;
  } else if (var0 === ScriptOpcodes.MOBILE_WIFIAVAILABLE) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 1;
    return 1;
  } else {
    return 2;
  }
}

function packCoord(plane: number, x: number, y: number): number {
  return ((plane & 0x3) << 28) | ((x & 0x3fff) << 14) | (y & 0x3fff);
}

export function method3416(var0: number, var1: Script, var2: boolean): number {
  void var1;
  void var2;

  if (var0 === ScriptOpcodes.CLIENTCLOCK) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = Math.trunc(Date.now() / 20);
    return 1;
  } else if (var0 === ScriptOpcodes.INV_GETOBJ || var0 === ScriptOpcodes.INV_GETNUM || var0 === ScriptOpcodes.INV_TOTAL) {
    Interpreter.Interpreter_intStackSize -= 2;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var0 === ScriptOpcodes.INV_GETOBJ ? -1 : 0;
    return 1;
  } else if (var0 === ScriptOpcodes.INV_SIZE) {
    --Interpreter.Interpreter_intStackSize;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
    return 1;
  } else if (var0 === ScriptOpcodes.STAT || var0 === ScriptOpcodes.STAT_BASE || var0 === ScriptOpcodes.STAT_XP) {
    --Interpreter.Interpreter_intStackSize;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
    return 1;
  } else if (var0 === ScriptOpcodes.COORD) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = packCoord(0, 0, 0);
    return 1;
  } else if (var0 === ScriptOpcodes.COORDX) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = (v >> 14) & 0x3fff;
    return 1;
  } else if (var0 === ScriptOpcodes.COORDZ) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = (v >> 28) & 0x3;
    return 1;
  } else if (var0 === ScriptOpcodes.COORDY) {
    const v = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = v & 0x3fff;
    return 1;
  } else if (
    var0 === ScriptOpcodes.MAP_MEMBERS
    || var0 === ScriptOpcodes.STAFFMODLEVEL
    || var0 === ScriptOpcodes.REBOOTTIMER
    || var0 === ScriptOpcodes.MAP_WORLD
    || var0 === ScriptOpcodes.RUNENERGY_VISIBLE
    || var0 === ScriptOpcodes.RUNWEIGHT_VISIBLE
    || var0 === ScriptOpcodes.PLAYERMOD
    || var0 === ScriptOpcodes.WORLDFLAGS
  ) {
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = 0;
    return 1;
  } else if (
    var0 === ScriptOpcodes.INVOTHER_GETOBJ
    || var0 === ScriptOpcodes.INVOTHER_GETNUM
    || var0 === ScriptOpcodes.INVOTHER_TOTAL
  ) {
    Interpreter.Interpreter_intStackSize -= 2;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = var0 === ScriptOpcodes.INVOTHER_GETOBJ ? -1 : 0;
    return 1;
  } else if (var0 === ScriptOpcodes.MOVECOORD) {
    Interpreter.Interpreter_intStackSize -= 4;
    const x = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
    const y = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
    const plane = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 2]!;
    const addY = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 3]!;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = packCoord(plane, x, y + addY);
    return 1;
  } else {
    return 2;
  }
}

async function method1973(var0: number, var1: Script, var2: boolean): Promise<number> {
  void var1;
  void var2;

  if (var0 === ScriptOpcodes.ENUM_STRING) {
    Interpreter.Interpreter_intStackSize -= 2;
    const enumId = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
    const key = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
    const def = await fetchEnumDef(enumId);
    const value = def?.stringValues.get(key) ?? def?.defaultString ?? "";
    Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = value;
    return 1;
  } else if (var0 === ScriptOpcodes.ENUM) {
    Interpreter.Interpreter_intStackSize -= 4;
    const inputType = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
    const outputType = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
    const enumId = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 2]!;
    const key = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 3]!;
    const def = await fetchEnumDef(enumId);

    const typeMatches = !!def && (def.inputType === 0 || def.inputType === inputType) && (def.outputType === 0 || def.outputType === outputType);
    const wantsString = outputType === 115 || outputType === "s".charCodeAt(0);
    if (wantsString) {
      const value = typeMatches ? (def!.stringValues.get(key) ?? def!.defaultString) : "null";
      Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = value;
    } else {
      const value = typeMatches ? (def!.intValues.get(key) ?? def!.defaultInt) : 0;
      Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = value | 0;
    }
    return 1;
  } else if (var0 === ScriptOpcodes.ENUM_GETOUTPUTCOUNT) {
    const enumId = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
    const def = await fetchEnumDef(enumId);
    const count = def ? Math.max(def.intValues.size, def.stringValues.size) : 0;
    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = count;
    return 1;
  } else {
    return 2;
  }
}

export async function method3270(var0: number, var1: Script, var2: boolean): Promise<number> {
  if (var0 < 1000) {
    return method898(var0, var1, var2);
  } else if (var0 < 1100) {
    return method6300(var0, var1, var2);
  } else if (var0 < 1200) {
    return method6861(var0, var1, var2);
  } else if (var0 < 1300) {
    return method6861(var0, var1, var2);
  } else if (var0 < 1400) {
    return method7946(var0, var1, var2);
  } else if (var0 < 1500) {
    return method11(var0, var1, var2);
  } else if (var0 < 1600) {
    return method1204(var0, var1, var2);
  } else if (var0 < 1700) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 1800) {
    return method462(var0, var1, var2);
  } else if (var0 < 1900) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 2000) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 2100) {
    return method6300(var0, var1, var2);
  } else if (var0 < 2200) {
    return method6861(var0, var1, var2);
  } else if (var0 < 2300) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 2400) {
    return method7946(var0, var1, var2);
  } else if (var0 < 2500) {
    return method11(var0, var1, var2);
  } else if (var0 < 2600) {
    return method3514(var0, var1, var2);
  } else if (var0 < 2700) {
    return method1190(var0, var1, var2);
  } else if (var0 < 2800) {
    return method4035(var0, var1, var2);
  } else if (var0 < 2900) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 3000) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 3200) {
    return method1899(var0, var1, var2);
  } else if (var0 < 3300) {
    return method3416(var0, var1, var2);
  } else if (var0 < 3400) {
    return method3416(var0, var1, var2);
  } else if (var0 < 3500) {
    return method1973(var0, var1, var2);
  } else if (var0 < 3600) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 3700) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 3800) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 3900) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 4000) {
    return 0;
  } else if (var0 < 4100) {
    return method7905(var0, var1, var2);
  } else if (var0 < 4200) {
    return method6884(var0, var1, var2);
  } else if (var0 < 4300) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 5100) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 5400) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 5600) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 5700) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 6300) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 6600) {
    return method3161(var0, var1, var2);
  } else if (var0 < 6700) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 6800) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 6900) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 7000) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 7100) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 7200) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 7300) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 7500) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 7600) {
    return logUnhandledScriptOpcode(var0, var1);
  } else if (var0 < 7700) {
    return logUnhandledScriptOpcode(var0, var1);
  } else {
    return var0 < 8100 ? logUnhandledScriptOpcode(var0, var1) : 2;
  }
}

export async function runScript(event: ScriptEvent, var1: number, var2: number): Promise<void> {
  try {
    rootScriptEvent = event;
    const var3 = event.args;
    let var4: Script | null = null;
    if (isWorldMapEvent(event.type)) {
      console.warn("[runScript] isWorldMapEvent — not implemented in browser");
    } else {
      const var5 = var3[0] as number;
      const { scriptRev, cacheHeaders } = getCs2RuntimeContext();
      var4 = await Script.getScript(var5, scriptRev, cacheHeaders);
    }

    if (rootScriptEvent != null) {
      rootScriptEvent = null;
    }

    currentScript = var4;

    if (var4 != null) {
      await runScriptLogic(event, var4, var1, var2);
    }
  } finally {
    currentScript = null;
  }
}

function widgetChildIndex(w: ScriptEvent["widget"]): number {
  if (w == null) return -1;
  const ext = w as { childIndex?: number };
  return typeof ext.childIndex === "number" ? ext.childIndex : -1;
}

function dragTargetChildIndex(w: ScriptEvent["dragTarget"]): number {
  if (w == null) return -1;
  const ext = w as { childIndex?: number };
  return typeof ext.childIndex === "number" ? ext.childIndex : -1;
}

async function runScriptLogic(var0: ScriptEvent, var1: Script, var2: number, var3: number): Promise<void> {
  const var4 = var0.args;
  Interpreter.Interpreter_intStackSize = 0;
  Interpreter.Interpreter_stringStackSize = 0;
  let var5 = -1;
  const var8 = -1;
  Interpreter.Interpreter_frameDepth = 0;
  Interpreter.field846 = false;
  let var9 = false;
  let var10 = 0;
  let var29 = false;
  let activeScript = var1;

  label933: {
    label934: {
      try {
        let var13: number;
        try {
          var29 = true;
          Interpreter.Interpreter_intLocals = new Array(activeScript.localIntCount).fill(0);
          let var11 = 0;
          Interpreter.Interpreter_stringLocals = new Array<unknown>(activeScript.localStringCount).fill(null);
          let var12 = 0;

          let var14: number;
          let var20: string;
          try {
            for (var13 = 1; var13 < var4.length; ++var13) {
              const cell = var4[var13];
              if (typeof cell === "number") {
                var14 = cell;
                if (var14 === -2147483647) {
                  var14 = var0.mouseX;
                }
                if (var14 === -2147483646) {
                  var14 = var0.mouseY;
                }
                if (var14 === -2147483645) {
                  var14 = widgetPackedId(var0.widget as RuntimeWidget | null);
                }
                if (var14 === -2147483644) {
                  var14 = var0.opIndex;
                }
                if (var14 === -2147483643) {
                  var14 = widgetChildIndex(var0.widget);
                }
                if (var14 === -2147483642) {
                  var14 = widgetPackedId(var0.dragTarget as RuntimeWidget | null);
                }
                if (var14 === -2147483641) {
                  var14 = dragTargetChildIndex(var0.dragTarget);
                }
                if (var14 === -2147483640) {
                  var14 = var0.keyTyped;
                }
                if (var14 === -2147483639) {
                  var14 = var0.keyPressed;
                }
                if (var14 === -2147483638) {
                  var14 = (var0 as ScriptEvent & { field852?: number }).field852 ?? var0.field1063;
                }
                Interpreter.Interpreter_intLocals![var11++] = var14;
              } else if (typeof cell === "string") {
                var20 = cell;
                if (var20 === "event_opbase") {
                  var20 = var0.targetName ?? "";
                }
                Interpreter.Interpreter_stringLocals![var12++] = var20;
              } else if (cell != null && typeof cell === "object") {
                Interpreter.Interpreter_stringLocals![var12++] = cell;
              }
            }
          } catch (e) {
            console.error("Cs2 Script Error:", var0.args[0], e);
          }

          Interpreter.field849 = var0.field1063;

          const { varps, varbitLookup } = getCs2RuntimeContext();
          const Varps_main = varps.Varps_main;

          while (true) {
            ++var10;
            if (var10 > var2) {
              throw new RuntimeLimitError();
            }

            ++var5;
            const var32 = activeScript.opcodes[var5]!;
            if (var32 >= 100) {
              let var34: boolean;
              if (activeScript.intOperands[var5] === 1) {
                var34 = true;
              } else {
                var34 = false;
              }

              var14 = await method3270(var32, activeScript, var34);

              switch (var14) {
                case 0:
                  var29 = false;
                  break label933;
                case 1:
                default:
                  break;
                case 2:
                  console.error(
                    `[method3270] unhandled opcode=${var32} scriptId=${activeScript.cacheKey} name=${activeScript.field974}`,
                  );
                  throw new IllegalStateScriptError();
              }
            } else if (var32 === ScriptOpcodes.ICONST) {
              Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = activeScript.intOperands[var5]!;
            } else if (var32 === ScriptOpcodes.GET_VARP) {
              var13 = activeScript.intOperands[var5]!;
              Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = Varps_main[var13]!;
            } else if (var32 === ScriptOpcodes.SET_VARP) {
              var13 = activeScript.intOperands[var5]!;
              Varps_main[var13] = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
            } else if (var32 === ScriptOpcodes.SCONST) {
              Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = activeScript.stringOperands[var5] ?? null;
            } else if (var32 === ScriptOpcodes.JUMP) {
              var5 += activeScript.intOperands[var5]!;
            } else if (var32 === ScriptOpcodes.IF_ICMPNE) {
              Interpreter.Interpreter_intStackSize -= 2;
              if (
                Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!
                !== Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!
              ) {
                var5 += activeScript.intOperands[var5]!;
              }
            } else if (var32 === ScriptOpcodes.IF_ICMPEQ) {
              Interpreter.Interpreter_intStackSize -= 2;
              if (
                Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!
                === Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!
              ) {
                var5 += activeScript.intOperands[var5]!;
              }
            } else if (var32 === ScriptOpcodes.IF_ICMPLT) {
              Interpreter.Interpreter_intStackSize -= 2;
              if (
                Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!
                < Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!
              ) {
                var5 += activeScript.intOperands[var5]!;
              }
            } else if (var32 === ScriptOpcodes.IF_ICMPGT) {
              Interpreter.Interpreter_intStackSize -= 2;
              if (
                Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!
                > Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!
              ) {
                var5 += activeScript.intOperands[var5]!;
              }
            } else if (var32 === ScriptOpcodes.RETURN) {
              if (Interpreter.Interpreter_frameDepth === 0) {
                var29 = false;
                break;
              }

              const var39 = Interpreter.Interpreter_frames[--Interpreter.Interpreter_frameDepth]!;
              activeScript = var39.script!;
              var5 = var39.pc;
              Interpreter.Interpreter_intLocals = var39.intLocals;
              Interpreter.Interpreter_stringLocals = var39.stringLocals;
            } else if (var32 === ScriptOpcodes.GET_VARBIT) {
              var13 = activeScript.intOperands[var5]!;
              Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = Varps.getVarbit(
                var13,
                Varps_main,
                varbitLookup,
              );
            } else if (var32 === ScriptOpcodes.SET_VARBIT) {
              var13 = activeScript.intOperands[var5]!;
              method5910(var13, Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!, varbitLookup, Varps_main);
            } else if (var32 === ScriptOpcodes.IF_ICMPLE) {
              Interpreter.Interpreter_intStackSize -= 2;
              if (
                Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!
                <= Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!
              ) {
                var5 += activeScript.intOperands[var5]!;
              }
            } else if (var32 === ScriptOpcodes.IF_ICMPGE) {
              Interpreter.Interpreter_intStackSize -= 2;
              if (
                Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!
                >= Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!
              ) {
                var5 += activeScript.intOperands[var5]!;
              }
            } else if (var32 === ScriptOpcodes.ILOAD) {
              const localIdx = activeScript.intOperands[var5]!;
              const locals = Interpreter.Interpreter_intLocals;
              let localVal = 0;
              if (locals && localIdx >= 0 && localIdx < locals.length) {
                const raw = locals[localIdx];
                localVal = typeof raw === "number" && Number.isFinite(raw) ? (raw | 0) : 0;
              }
              Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = localVal;
            } else if (var32 === ScriptOpcodes.ISTORE) {
              const localIdx = activeScript.intOperands[var5]!;
              const value = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
              if (!Interpreter.Interpreter_intLocals) {
                Interpreter.Interpreter_intLocals = [];
              }
              if (localIdx >= Interpreter.Interpreter_intLocals.length) {
                Interpreter.Interpreter_intLocals.length = localIdx + 1;
              }
              Interpreter.Interpreter_intLocals[localIdx] = value | 0;
            } else if (var32 === ScriptOpcodes.SLOAD) {
              Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = Interpreter.Interpreter_stringLocals![
                activeScript.intOperands[var5]!
              ];
            } else if (var32 === ScriptOpcodes.SSTORE) {
              Interpreter.Interpreter_stringLocals![activeScript.intOperands[var5]!] = Interpreter.Interpreter_stringStack[
                --Interpreter.Interpreter_stringStackSize
              ];
            } else if (var32 === ScriptOpcodes.JOIN_STRING) {
              var13 = activeScript.intOperands[var5]!;
              Interpreter.Interpreter_stringStackSize -= var13;
              var20 = method5819(Interpreter.Interpreter_stringStack, Interpreter.Interpreter_stringStackSize, var13);
              Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = var20;
            } else if (var32 === ScriptOpcodes.POP_INT) {
              --Interpreter.Interpreter_intStackSize;
            } else if (var32 === ScriptOpcodes.POP_STRING) {
              --Interpreter.Interpreter_stringStackSize;
            } else {
              let var17: number;
              if (var32 !== ScriptOpcodes.INVOKE) {
                if (var32 === ScriptOpcodes.GET_VARC_INT) {
                  Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = varcs.getInt(
                    activeScript.intOperands[var5]!,
                  );
                } else if (var32 === ScriptOpcodes.SET_VARC_INT) {
                  varcs.setInt(
                    activeScript.intOperands[var5]!,
                    Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!,
                  );
                } else if (var32 === ScriptOpcodes.DEFINE_ARRAY) {
                  var13 = activeScript.intOperands[var5]! >> 16;
                  var14 = activeScript.intOperands[var5]! & 65535;
                  const var23 = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
                  if (var23 < 0 || var23 > 5000) {
                    throw new RuntimeLimitError();
                  }
                  const fill = var14 === 105 || var14 === 49 ? 0 : -1;
                  Interpreter.Interpreter_stringLocals![var13] = new DynamicArray(var14, var23, fill);
                } else if (var32 === ScriptOpcodes.GET_ARRAY_INT) {
                  const localIdx = activeScript.intOperands[var5]!;
                  var14 = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
                  const arr = getDynamicArray(localIdx, Interpreter.Interpreter_stringLocals);
                  if (arr.isInt) {
                    Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = arr.getInt(var14);
                  } else {
                    Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = arr.getObject(var14);
                  }
                } else if (var32 === ScriptOpcodes.SET_ARRAY_INT) {
                  const localIdx = activeScript.intOperands[var5]!;
                  const arr = getDynamicArray(localIdx, Interpreter.Interpreter_stringLocals);
                  if (arr.isInt) {
                    Interpreter.Interpreter_intStackSize -= 2;
                    var14 = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize]!;
                    const value = Interpreter.Interpreter_intStack[Interpreter.Interpreter_intStackSize + 1]!;
                    arr.setInt(var14, value);
                  } else {
                    var14 = Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!;
                    const value = Interpreter.Interpreter_stringStack[--Interpreter.Interpreter_stringStackSize];
                    arr.setObject(var14, value);
                  }
                } else {
                  let var21: string;
                  if (var32 === ScriptOpcodes.GET_VARC_STRING_OLD || var32 === ScriptOpcodes.GET_VARC_STRING) {
                    var21 = varcs.getString(activeScript.intOperands[var5]!);
                    Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = var21;
                  } else if (var32 === ScriptOpcodes.SET_VARC_STRING_OLD || var32 === ScriptOpcodes.SET_VARC_STRING) {
                    const raw = Interpreter.Interpreter_stringStack[--Interpreter.Interpreter_stringStackSize];
                    varcs.setString(
                      activeScript.intOperands[var5]!,
                      asCs2String(raw),
                    );
                  } else if (var32 === ScriptOpcodes.SWITCH) {
                    const var37 = activeScript.switches![activeScript.intOperands[var5]!]!;
                    const jump = var37.get(Interpreter.Interpreter_intStack[--Interpreter.Interpreter_intStackSize]!);
                    if (jump !== undefined) {
                      var5 += jump;
                    }
                  } else if (var32 === ScriptOpcodes.PUSH_NULL_OBJECT) {
                    Interpreter.Interpreter_stringStack[++Interpreter.Interpreter_stringStackSize - 1] = null;
                  } else {
                    if (var32 === ScriptOpcodes.GET_VARCLANSETTING) {
                      Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = -1;
                    } else if (var32 === ScriptOpcodes.GET_VARCLAN) {
                      Interpreter.Interpreter_intStack[++Interpreter.Interpreter_intStackSize - 1] = -1;
                    } else {
                      throw new IllegalStateScriptError();
                    }
                  }
                }
              } else {
                var13 = activeScript.intOperands[var5]!;
                const { scriptRev, cacheHeaders } = getCs2RuntimeContext();
                const var35 = await Script.getScript(var13, scriptRev, cacheHeaders);
                if (!var35) throw new IllegalStateScriptError();
                const var15 = new Array(var35.localIntCount).fill(0);
                const var16 = new Array<unknown>(var35.localStringCount).fill(null);

                for (var17 = 0; var17 < var35.intArgumentCount; ++var17) {
                  var15[var17] = Interpreter.Interpreter_intStack[
                    var17 + (Interpreter.Interpreter_intStackSize - var35.intArgumentCount)
                  ]!;
                }

                for (var17 = 0; var17 < var35.stringArgumentCount; ++var17) {
                  var16[var17] = Interpreter.Interpreter_stringStack[
                    var17 + (Interpreter.Interpreter_stringStackSize - var35.stringArgumentCount)
                  ];
                }

                Interpreter.Interpreter_intStackSize -= var35.intArgumentCount;
                Interpreter.Interpreter_stringStackSize -= var35.stringArgumentCount;
                const var22 = new ScriptFrame();
                var22.script = activeScript;
                var22.pc = var5;
                var22.intLocals = Interpreter.Interpreter_intLocals;
                var22.stringLocals = Interpreter.Interpreter_stringLocals;
                Interpreter.Interpreter_frames[++Interpreter.Interpreter_frameDepth - 1] = var22;
                activeScript = var35;
                var5 = -1;
                Interpreter.Interpreter_intLocals = var15;
                Interpreter.Interpreter_stringLocals = var16;
              }
            }
            normalizeIntStackWindow(activeScript.cacheKey, var32, var5);
          }
        } catch (var30) {
          var9 = true;
          const var26: string[] = [];
          var26.push("");
          var26.push(String(activeScript.cacheKey));
          var26.push(" ");

          for (var13 = Interpreter.Interpreter_frameDepth - 1; var13 >= 0; --var13) {
            var26.push("");
            var26.push(String(Interpreter.Interpreter_frames[var13]!.script?.cacheKey ?? "?"));
            var26.push(" ");
          }

          var26.push("");
          var26.push(String(var8));
          RunException_sendStackTrace(var26.join(""), var30 as Error);
          var29 = false;
          break label934;
        }
      } finally {
        if (var29) {
          while (Interpreter.field847.length > 0) {
            Interpreter.field847.shift();
          }

          if (Interpreter.field846) {
            Interpreter.field846 = false;
          }

          if (!var9 && var3 > 0 && var10 >= var3) {
            RunException_sendStackTrace(
              `Warning: Script ${activeScript.field974} finished at op count ${var10} of max ${var2}`,
              null,
            );
          }
        }
      }

      while (Interpreter.field847.length > 0) {
        Interpreter.field847.shift();
      }

      if (Interpreter.field846) {
        Interpreter.field846 = false;
      }

      if (!var9 && var3 > 0 && var10 >= var3) {
        RunException_sendStackTrace(
          `Warning: Script ${activeScript.field974} finished at op count ${var10} of max ${var2}`,
          null,
        );
      }

      return;
    }

    while (Interpreter.field847.length > 0) {
      Interpreter.field847.shift();
    }

    if (Interpreter.field846) {
      Interpreter.field846 = false;
    }

    if (!var9 && var3 > 0 && var10 >= var3) {
      RunException_sendStackTrace(
        `Warning: Script ${activeScript.field974} finished at op count ${var10} of max ${var2}`,
        null,
      );
    }

    return;
  }

  while (Interpreter.field847.length > 0) {
    Interpreter.field847.shift();
  }

  if (Interpreter.field846) {
    Interpreter.field846 = false;
  }

  if (!var9 && var3 > 0 && var10 >= var3) {
    RunException_sendStackTrace(
      `Warning: Script ${activeScript.field974} finished at op count ${var10} of max ${var2}`,
      null,
    );
  }
}

class RuntimeLimitError extends Error {
  constructor() {
    super();
    this.name = "RuntimeLimitError";
  }
}

class RuntimeError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "RuntimeError";
  }
}

class IllegalStateScriptError extends Error {
  constructor() {
    super();
    this.name = "IllegalStateScriptError";
  }
}
