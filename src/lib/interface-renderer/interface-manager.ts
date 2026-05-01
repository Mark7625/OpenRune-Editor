import type { ComponentType, InterfaceEntry } from "./component-types";
import { InterfaceParent, registerInterfaceParent, parseInterfaceParentsLookup } from "./interface-parent";
import { Cs1Interpreter, type Cs1SimState } from "./cs1-interpreter";
import type { VarbitDefinitionLookup } from "./varbit-definition";
import { Rasterizer2D } from "./rasterizer2d";
import { type Sprite, fetchSpriteCached } from "./sprite";
import { runWidgetOnLoadListener } from "./cs2/runWidgetOnLoadListener";

let cs1InterfaceEntry: InterfaceEntry | null = null;

export function setCs1InterfaceEntry(entry: InterfaceEntry | null) {
  cs1InterfaceEntry = entry;
}

let cs1SimState: Cs1SimState | null = null;

export function setCs1SimState(state: Cs1SimState | null) {
  cs1SimState = state;
}

let cs1VarbitDefinitionLookup: VarbitDefinitionLookup | null = null;

export function setCs1VarbitDefinitionLookup(lookup: VarbitDefinitionLookup | null) {
  cs1VarbitDefinitionLookup = lookup;
}

export const Interpreter = {
  mousedOverWidgetIf1: null as ComponentType | null,
  clickedWidget: null as ComponentType | null,
  isDraggingWidget: false,
  field674: false,
  meslayerContinueWidget: null as ComponentType | null,
};

export type ComponentDrawBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

let mouseX = 0;
let mouseY = 0;
let widgetClickX = 0;
let widgetClickY = 0;
let field554 = 0;
let field676 = 0;
let clickedWidgetParentWidth = 0;
let clickedWidgetParentHeight = 0;

let field1453: Map<number, ComponentType[]> | null = null;
let field2040 = 0;
let field1167 = 0;
let rootInterface = -1;

export function setInterfaceMousePosition(x: number, y: number) {
  mouseX = x;
  mouseY = y;
}

export function setDragRuntimeState(state: {
  widgetClickX?: number;
  widgetClickY?: number;
  field554?: number;
  field676?: number;
  clickedWidgetParentWidth?: number;
  clickedWidgetParentHeight?: number;
}) {
  if (state.widgetClickX !== undefined) widgetClickX = state.widgetClickX;
  if (state.widgetClickY !== undefined) widgetClickY = state.widgetClickY;
  if (state.field554 !== undefined) field554 = state.field554;
  if (state.field676 !== undefined) field676 = state.field676;
  if (state.clickedWidgetParentWidth !== undefined) clickedWidgetParentWidth = state.clickedWidgetParentWidth;
  if (state.clickedWidgetParentHeight !== undefined) clickedWidgetParentHeight = state.clickedWidgetParentHeight;
}

let _tick = 0;
export function advanceTick() { _tick++; }
export function getTick() { return _tick; }

const scrollState = new Map<number, { x: number; y: number }>();
function getScroll(compId: number): { x: number; y: number } {
  let s = scrollState.get(compId);
  if (!s) {
    s = { x: 0, y: 0 };
    scrollState.set(compId, s);
  }
  return s;
}
export function clearScrollState() { scrollState.clear(); }

export function nudgeScrollY(
  compRuntimeId: number,
  deltaY: number,
  scrollHeight: number,
  tempHeight: number,
): void {
  if (scrollHeight <= tempHeight || deltaY === 0) return;
  const s = getScroll(compRuntimeId);
  s.y += deltaY;
  if (s.y < 0) s.y = 0;
  const maxY = scrollHeight - tempHeight;
  if (s.y > maxY) s.y = maxY;
}

const rootWidgetXs: number[] = [];
const rootWidgetYs: number[] = [];
const rootWidgetWidths: number[] = [];
const rootWidgetHeights: number[] = [];
let rootWidgetCount = 0;

function componentRuntimeId(comp: ComponentType): number {
  return typeof comp.packedId === "number" ? comp.packedId : comp.id;
}

function collectAllComponents(entry: InterfaceEntry): ComponentType[] {
  const out: ComponentType[] = [];
  const visit = (c: ComponentType) => {
    out.push(c);
    if (c.children) {
      for (const ch of c.children) {
        if (ch) visit(ch);
      }
    }
  };
  for (const c of Object.values(entry.components)) {
    visit(c);
  }
  return out;
}

function findWidgetByPackedId(entry: InterfaceEntry, packedRoot: number): ComponentType | null {
  for (const c of collectAllComponents(entry)) {
    if (componentRuntimeId(c) === packedRoot) return c;
  }
  return null;
}

function resetModelFramesForInterface(entry: InterfaceEntry, group: number): void {
  if (!Number.isFinite(group)) return;
  const iface = group & 0xffff;
  for (const c of collectAllComponents(entry)) {
    if (typeof c.packedId !== "number") continue;
    if ((c.packedId >>> 16) !== iface) continue;
    const w = c as ComponentType & { modelFrame?: number; modelFrameCycle?: number };
    w.modelFrame = 0;
    w.modelFrameCycle = 0;
  }
}

function invalidateWidget(_w: ComponentType | null): void {
}

function revalidateWidgetScrollFromJava(entry: InterfaceEntry, widget: ComponentType | null): void {
  if (!widget) return;
  const innerW = widget.scrollWidth !== 0 ? widget.scrollWidth : widget.tempWidth;
  const innerH = widget.scrollHeight !== 0 ? widget.scrollHeight : widget.tempHeight;
  const parentPacked = componentRuntimeId(widget);
  const all = collectAllComponents(entry);

  const resizeForParent = (parentPackedId: number, w: number, h: number): void => {
    for (const c of all) {
      if (c.layer !== parentPackedId) continue;
      alignWidgetSize(c, w, h, false);
      alignWidgetPosition(c, w, h);
      resizeInterfaceScroll(c);
      if (c.type === 0) {
        resizeForParent(componentRuntimeId(c), w, h);
      }
    }
  };

  resizeForParent(parentPacked, innerW, innerH);
  if (widget.children) {
    for (const ch of widget.children) {
      if (!ch) continue;
      alignWidgetSize(ch, innerW, innerH, false);
      alignWidgetPosition(ch, innerW, innerH);
      resizeInterfaceScroll(ch);
    }
  }
}

function runIntfCloseListeners(_root: number, _mode: number): void {
}

export function setRootInterface(value: number): void {
  rootInterface = value;
}

export async function openInterface(var0: number, var1: number, var2: number): Promise<InterfaceParent> {
  const entry = cs1InterfaceEntry;
  if (!entry) {
    throw new Error("openInterface called without cs1InterfaceEntry");
  }

  const var3 = registerInterfaceParent(entry, var0, var1, var2, false);
  resetModelFramesForInterface(entry, var1);
  const var4 = findWidgetByPackedId(entry, var0);
  invalidateWidget(var4);
  if (Interpreter.meslayerContinueWidget != null) {
    invalidateWidget(Interpreter.meslayerContinueWidget);
    Interpreter.meslayerContinueWidget = null;
  }

  revalidateWidgetScrollFromJava(entry, var4);

  try {
    await runWidgetOnLoadListener(entry, var1);
  } catch {
    console.log("Unable to run script on interface: " + (var0 >> 16));
  }

  if (rootInterface !== -1) {
    runIntfCloseListeners(rootInterface, 1);
  }

  return var3;
}

export function resetRootWidgets() {
  rootWidgetCount = 0;
  rootWidgetXs.length = 0;
  rootWidgetYs.length = 0;
  rootWidgetWidths.length = 0;
  rootWidgetHeights.length = 0;
}

function isComponentHidden(comp: ComponentType): boolean {
  return comp.hide;
}

function method8602(trans: number): number {
  return 255 - (trans & 255);
}

function method3864(text: string, _comp: ComponentType): string {
  if (!text.includes("%")) return text;
  let out = text;
  for (let i = 1; i <= 5; i++) {
    const marker = `%${i}`;
    while (out.includes(marker)) {
      const at = out.indexOf(marker);
      const varValue = 0;
      const varStr = varValue < 999999999 ? String(varValue) : "*";
      out = out.slice(0, at) + varStr + out.slice(at + 2);
    }
  }
  return out;
}

function runCs1(comp: ComponentType): boolean {
  if (!comp.cs1Comparisons || comp.cs1Comparisons.length === 0) return false;
  for (let i = 0; i < comp.cs1Comparisons.length; i++) {
    let value = 0;
    if (cs1SimState && comp.cs1Instructions && comp.cs1Instructions.length > 0) {
      const evaluated = Cs1Interpreter.evaluate(comp, i, cs1SimState, {
        interfaceEntry: cs1InterfaceEntry,
        varbitDefinitionLookup: cs1VarbitDefinitionLookup ?? undefined,
      });
      if (evaluated >= 0) {
        value = evaluated;
      }
    }
    const threshold = comp.cs1ComparisonValues?.[i] ?? 0;
    const op = comp.cs1Comparisons[i]!;
    if (op === 2) {
      if (value >= threshold) return false;
    } else if (op === 3) {
      if (value <= threshold) return false;
    } else if (op === 4) {
      if (value === threshold) return false;
    } else if (value !== threshold) {
      return false;
    }
  }
  return true;
}

function colorStartTag(color: number): string {
  return `<col=${color.toString(16).padStart(6, "0")}>`;
}

function alignWidgetSize(var0: ComponentType, var1: number, var2: number, _var3: boolean): void {
  if (var0.type === 12) {
    var0.tempWidth = var0.width;
    var0.tempHeight = var0.height;
    return;
  }
  if (var0.clientCode === 1337) {
    var0.tempWidth = var0.width;
    var0.tempHeight = var0.height;
    return;
  }

  if (var0.widthMode === 0) {
    var0.tempWidth = var0.width;
  } else if (var0.widthMode === 1) {
    var0.tempWidth = var1 - var0.width;
  } else if (var0.widthMode === 2) {
    var0.tempWidth = (var0.width * var1) >> 14;
  } else {
    var0.tempWidth = var0.width;
  }

  if (var0.heightMode === 0) {
    var0.tempHeight = var0.height;
  } else if (var0.heightMode === 1) {
    var0.tempHeight = var2 - var0.height;
  } else if (var0.heightMode === 2) {
    var0.tempHeight = (var0.height * var2) >> 14;
  } else {
    var0.tempHeight = var0.height;
  }

  const field3677 = Math.max(1, var0.field3677 ?? 1);
  const field3770 = Math.max(1, var0.field3770 ?? 1);
  if (var0.widthMode === 4) {
    var0.tempWidth = Math.trunc((field3770 * var0.tempHeight) / field3677);
  }
  if (var0.heightMode === 4) {
    var0.tempHeight = Math.trunc((var0.tempWidth * field3677) / field3770);
  }
}

function alignWidgetPosition(var0: ComponentType, var1: number, var2: number): void {
  const width1 = var0.tempWidth;
  const height1 = var0.tempHeight;

  if (var0.xMode === 0) {
    var0.x1 = var0.x;
  } else if (var0.xMode === 1) {
    var0.x1 = var0.x + ((var1 - width1) >> 1);
  } else if (var0.xMode === 2) {
    var0.x1 = var1 - width1 - var0.x;
  } else if (var0.xMode === 3) {
    var0.x1 = (var0.x * var1) >> 14;
  } else if (var0.xMode === 4) {
    var0.x1 = ((var1 - width1) >> 1) + ((var0.x * var1) >> 14);
  } else {
    var0.x1 = var1 - width1 - ((var0.x * var1) >> 14);
  }

  if (var0.yMode === 0) {
    var0.y1 = var0.y;
  } else if (var0.yMode === 1) {
    var0.y1 = ((var2 - height1) >> 1) + var0.y;
  } else if (var0.yMode === 2) {
    var0.y1 = var2 - height1 - var0.y;
  } else if (var0.yMode === 3) {
    var0.y1 = (var2 * var0.y) >> 14;
  } else if (var0.yMode === 4) {
    var0.y1 = ((var2 - height1) >> 1) + ((var2 * var0.y) >> 14);
  } else {
    var0.y1 = var2 - height1 - ((var2 * var0.y) >> 14);
  }
}

function alignWidget(var0: ComponentType, parentTempWidth: number, parentTempHeight: number): void {
  alignWidgetSize(var0, parentTempWidth, parentTempHeight, false);
  alignWidgetPosition(var0, parentTempWidth, parentTempHeight);
}

function resizeInterfaceScroll(var0: ComponentType): void {
  const scroll = getScroll(componentRuntimeId(var0));
  if (scroll.x > var0.scrollWidth - var0.tempWidth) scroll.x = var0.scrollWidth - var0.tempWidth;
  if (scroll.x < 0) scroll.x = 0;
  if (scroll.y > var0.scrollHeight - var0.tempHeight) scroll.y = var0.scrollHeight - var0.tempHeight;
  if (scroll.y < 0) scroll.y = 0;
}

export class InterfaceManager {
  private rast: Rasterizer2D;

  private spriteCache: Map<number, Sprite | null> = new Map();

  private cacheHeaders: HeadersInit;
  private rev: string | number;
  public readonly validRootWidgets = Array.from({ length: 100 }, () => false);
  private drawBoundsByComponentId = new Map<number, ComponentDrawBounds>();
  private drawBoundsByComponentRef: WeakMap<ComponentType, ComponentDrawBounds> = new WeakMap();

  onSpriteLoaded: (() => void) | null = null;

  constructor(
    ctx: CanvasRenderingContext2D,
    cacheHeaders: HeadersInit,
    rev: string | number,
  ) {
    this.rast = new Rasterizer2D(ctx);
    this.cacheHeaders = cacheHeaders;
    this.rev = rev;
  }

  drawInterfaceClipped(
    entry: InterfaceEntry,
    rootX: number,
    rootY: number,
    clipW: number,
    clipH: number,
    interfaceId: number,
  ) {
    this.drawWidgets(
      entry,
      interfaceId,
      rootX,
      rootY,
      rootX + clipW,
      rootY + clipH,
      rootX,
      rootY,
      -1,
    );
  }

  drawWidgets(
    entry: InterfaceEntry | null,
    var0: number,
    var1: number,
    var2: number,
    var3: number,
    var4: number,
    var5: number,
    var6: number,
    var7: number,
  ): { loaded: boolean; validRootWidgets: boolean[] } {
    const loaded = !!entry;
    if (loaded && entry) {
      const byLayer = buildLayerMap(entry.components);
      resetRootWidgets();
      this.drawBoundsByComponentId.clear();
      this.drawBoundsByComponentRef = new WeakMap();
      this.rast.setClip(var1, var2, var3, var4);

      const rootLayer = byLayer.has(-1) ? -1 : var0;
      const embeddedParents = parseInterfaceParentsLookup(entry.interfaceParents);

      this.drawWidgetsPass(
        byLayer,
        rootLayer,
        var1,
        var2,
        var3,
        var4,
        var5,
        var6,
        var3 - var1,
        var4 - var2,
        var7,
        embeddedParents,
      );

      this.rast.restoreAll();
    } else if (var7 !== -1 && var7 < this.validRootWidgets.length) {
      this.validRootWidgets[var7] = true;
    } else {
      this.validRootWidgets.fill(true);
    }

    return { loaded, validRootWidgets: [...this.validRootWidgets] };
  }

  private drawWidgetsPass(
    byLayer: Map<number, ComponentType[]>,
    layer: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    x: number,
    y: number,
    parentW: number,
    parentH: number,
    rootIndex: number,
    embeddedParents: ReadonlyMap<number, InterfaceParent> | null,
  ) {
    field1453 = null;
    this.drawInterface(
      byLayer,
      layer,
      minX,
      minY,
      maxX,
      maxY,
      x,
      y,
      rootIndex,
      parentW,
      parentH,
      embeddedParents,
    );
    if (field1453) {
      this.drawInterface(
        field1453,
        -1412584499,
        minX,
        minY,
        maxX,
        maxY,
        field2040,
        field1167,
        rootIndex,
        parentW,
        parentH,
        embeddedParents,
      );
      field1453 = null;
    }
  }

  private drawInterface(
    byLayer: Map<number, ComponentType[]>,
    var1: number,
    var2: number,
    var3: number,
    var4: number,
    var5: number,
    var6: number,
    var7: number,
    var8: number,
    parentTempWidth: number,
    parentTempHeight: number,
    embeddedParents: ReadonlyMap<number, InterfaceParent> | null,
  ) {
    const components = byLayer.get(var1);
    if (!components) return;

    for (const var10 of components) {
      alignWidget(var10, parentTempWidth, parentTempHeight);
      resizeInterfaceScroll(var10);

      let currentRoot = var8;
      if (var8 === -1) {
        const bx = (var10.x1 ?? 0) + var6;
        const by = (var10.y1 ?? 0) + var7;
        rootWidgetXs[rootWidgetCount] = bx;
        rootWidgetYs[rootWidgetCount] = by;
        rootWidgetWidths[rootWidgetCount] = var10.tempWidth;
        rootWidgetHeights[rootWidgetCount] = var10.tempHeight;
        currentRoot = rootWidgetCount;
        rootWidgetCount++;
      }

      if (var10.v3 && isComponentHidden(var10)) continue;

      let x = (var10.x1 ?? 0) + var6;
      let y = (var10.y1 ?? 0) + var7;
      let trans = var10.trans1;

      if (var10 === Interpreter.clickedWidget) {
        if (var1 !== -1412584499 && !var10.draggableBehavior) {
          field1453 = byLayer;
          field2040 = var6;
          field1167 = var7;
          continue;
        }
        if (Interpreter.isDraggingWidget && Interpreter.field674) {
          let var15 = mouseX;
          let var16 = mouseY;
          var15 -= widgetClickX;
          var16 -= widgetClickY;

          if (var15 < field554) {
            var15 = field554;
          }
          if (var15 + var10.tempWidth > field554 + clickedWidgetParentWidth) {
            var15 = field554 + clickedWidgetParentWidth - var10.tempWidth;
          }
          if (var16 < field676) {
            var16 = field676;
          }
          if (var16 + var10.tempHeight > field676 + clickedWidgetParentHeight) {
            var16 = field676 + clickedWidgetParentHeight - var10.tempHeight;
          }

          x = var15;
          y = var16;
        }
        if (!var10.draggableBehavior) trans = 128;
      }

      this.drawBoundsByComponentId.set(var10.id, {
        x,
        y,
        width: var10.tempWidth,
        height: var10.tempHeight,
      });
      this.drawBoundsByComponentRef.set(var10, {
        x,
        y,
        width: var10.tempWidth,
        height: var10.tempHeight,
      });

      let clipX1: number;
      let clipY1: number;
      let clipX2: number;
      let clipY2: number;

      if (var10.type === 9) {
        let lx1 = x;
        let ly1 = y;
        let lx2 = x + var10.tempWidth;
        let ly2 = y + var10.tempHeight;
        if (lx2 < lx1) { const t = lx1; lx1 = lx2; lx2 = t; }
        if (ly2 < ly1) { const t = ly1; ly1 = ly2; ly2 = t; }
        lx2++;
        ly2++;
        clipX1 = Math.max(lx1, var2);
        clipY1 = Math.max(ly1, var3);
        clipX2 = Math.min(lx2, var4);
        clipY2 = Math.min(ly2, var5);
      } else {
        clipX1 = Math.max(x, var2);
        clipY1 = Math.max(y, var3);
        clipX2 = Math.min(x + var10.tempWidth, var4);
        clipY2 = Math.min(y + var10.tempHeight, var5);
      }

      if (var10.v3 && !(clipX1 < clipX2 && clipY1 < clipY2)) continue;

      if (var10.clientCode !== 0) {
        if (var10.clientCode === 1336) continue;
        if (var10.clientCode === 1337) continue;
        if (var10.clientCode === 1338) continue;
        if (var10.clientCode === 1339) continue;
      }

      this.rast.setClip(clipX1, clipY1, clipX2, clipY2);
      try {
      if (var10.type === 0) {
        if (!var10.v3 && isComponentHidden(var10) && var10 !== Interpreter.mousedOverWidgetIf1) {
          continue;
        }

        const compRuntimeId = componentRuntimeId(var10);
        const scroll = getScroll(compRuntimeId);
        const childParentW = var10.scrollWidth !== 0 ? var10.scrollWidth : var10.tempWidth;
        const childParentH = var10.scrollHeight !== 0 ? var10.scrollHeight : var10.tempHeight;

        this.drawInterface(
          byLayer,
          compRuntimeId,
          clipX1,
          clipY1,
          clipX2,
          clipY2,
          x - scroll.x,
          y - scroll.y,
          currentRoot,
          childParentW,
          childParentH,
          embeddedParents,
        );

        if (var10.children && var10.children.length > 0) {
          const childLayerMap = buildLayerMapFromArray(var10.children, compRuntimeId);
          this.drawInterface(
            childLayerMap,
            compRuntimeId,
            clipX1,
            clipY1,
            clipX2,
            clipY2,
            x - scroll.x,
            y - scroll.y,
            currentRoot,
            childParentW,
            childParentH,
            embeddedParents,
          );
        }

        const ifaceParent = embeddedParents?.get(compRuntimeId);
        if (ifaceParent) {
          this.drawWidgetsPass(
            byLayer,
            ifaceParent.group,
            clipX1,
            clipY1,
            clipX2,
            clipY2,
            x,
            y,
            var10.tempWidth,
            var10.tempHeight,
            currentRoot,
            embeddedParents,
          );
        }

        this.rast.setClip(var2, var3, var4, var5);
      } else if (var10.type === 11) {
        if (isComponentHidden(var10) && var10 !== Interpreter.mousedOverWidgetIf1) continue;

        const compRuntimeId = componentRuntimeId(var10);
        const scroll = getScroll(compRuntimeId);
        const childParentW = var10.scrollWidth !== 0 ? var10.scrollWidth : var10.tempWidth;
        const childParentH = var10.scrollHeight !== 0 ? var10.scrollHeight : var10.tempHeight;
        this.drawInterface(
          byLayer,
          compRuntimeId,
          clipX1,
          clipY1,
          clipX2,
          clipY2,
          x - scroll.x,
          y - scroll.y,
          currentRoot,
          childParentW,
          childParentH,
          embeddedParents,
        );

        if (var10.children && var10.children.length > 0) {
          const childLayerMap = buildLayerMapFromArray(var10.children, compRuntimeId);
          this.drawInterface(
            childLayerMap,
            compRuntimeId,
            clipX1,
            clipY1,
            clipX2,
            clipY2,
            x - scroll.x,
            y - scroll.y,
            currentRoot,
            childParentW,
            childParentH,
            embeddedParents,
          );
        }

        this.rast.setClip(var2, var3, var4, var5);
      }

      if ((var10.type === 0 || var10.type === 11) && !var10.v3 && var10.scrollHeight > var10.tempHeight) {
        const scroll = getScroll(componentRuntimeId(var10));
        this.rast.drawScrollBar(
          x + var10.tempWidth,
          y,
          scroll.y,
          var10.tempHeight,
          var10.scrollHeight,
          {
            up: this.getOrFetchSprite(801),
            down: this.getOrFetchSprite(802),
          },
        );
      }

      if (var10.type === 1) continue;

      if (var10.type === 3) {
        let color: number;
        if (runCs1(var10)) {
          color = var10.colour2;
          if (var10 === Interpreter.mousedOverWidgetIf1 && var10.mouseOverColour2 !== 0) {
            color = var10.mouseOverColour2;
          }
        } else {
          color = var10.colour1;
          if (var10 === Interpreter.mousedOverWidgetIf1 && var10.mouseOverColour1 !== 0) {
            color = var10.mouseOverColour1;
          }
        }

        if (var10.fill) {
          const compMaybe = var10 as ComponentType & {
            fillMode?: number | { field5221?: number };
            transparencyBot?: number;
          };
          const fillMode = typeof compMaybe.fillMode === "number"
            ? compMaybe.fillMode
            : (compMaybe.fillMode?.field5221 ?? 0);

          if (fillMode === 1) {
            this.rast.fillRectGradient(x, y, var10.tempWidth, var10.tempHeight, var10.colour1, var10.colour2);
          } else if (fillMode === 2) {
            const alphaTop = 255 - (var10.trans1 & 255);
            const alphaBot = 255 - ((compMaybe.transparencyBot ?? var10.trans1) & 255);
            this.rast.fillRectGradientAlpha(
              x,
              y,
              var10.tempWidth,
              var10.tempHeight,
              var10.colour1,
              var10.colour2,
              alphaTop,
              alphaBot,
            );
          } else if (trans === 0) {
            this.rast.fillRect(x, y, var10.tempWidth, var10.tempHeight, color);
          } else {
            this.rast.fillRectAlpha(x, y, var10.tempWidth, var10.tempHeight, color, 256 - (trans & 255));
          }
        } else if (trans === 0) {
          this.rast.drawRect(x, y, var10.tempWidth, var10.tempHeight, color);
        } else {
          this.rast.drawRectAlpha(x, y, var10.tempWidth, var10.tempHeight, color, 256 - (trans & 255));
        }
        continue;
      }

      if (var10.type === 4) {
        let text = var10.text ?? "";
        let color: number;

        if (runCs1(var10)) {
          color = var10.colour2;
          if (var10 === Interpreter.mousedOverWidgetIf1 && var10.mouseOverColour2 !== 0) {
            color = var10.mouseOverColour2;
          }
          if (var10.secondaryText.length > 0) text = var10.secondaryText;
        } else {
          color = var10.colour1;
          if (var10 === Interpreter.mousedOverWidgetIf1 && var10.mouseOverColour1 !== 0) {
            color = var10.mouseOverColour1;
          }
        }

        void colorStartTag;

        if (var10 === Interpreter.meslayerContinueWidget) {
          text = "Please wait...";
          color = var10.colour1;
        }

        if (!var10.v3) text = method3864(text, var10);
        if (!text) continue;

        this.rast.drawText(
          text,
          x,
          y,
          var10.tempWidth,
          var10.tempHeight,
          color,
          var10.textAlignH,
          var10.textAlignV,
          var10.textShadow,
          method8602(var10.trans1),
          var10.textLineHeight,
          var10.textFont,
        );
        continue;
      }

      if (var10.type === 5) {
        if (!var10.v3) {
          const spriteId = runCs1(var10) ? var10.secondaryGraphic : var10.graphic;
          if (spriteId < 0) continue;
          const spr = this.getOrFetchSprite(spriteId);
          if (!spr) continue;
          spr.drawTransBgAt(this.rast.ctx, x, y, var10.hFlip, var10.vFlip);
          continue;
        }

        const spriteId = var10.graphic;
        if (spriteId < 0) continue;
        const spr = this.getOrFetchSprite(spriteId);
        if (!spr) continue;

        const fullW = spr.width;
        const fullH = spr.height;
        const alpha = 256 - (trans & 255);

        if (!var10.tiling) {
          const scale4096 = fullW > 0 ? Math.trunc((var10.tempWidth * 4096) / fullW) : 0;
          if (var10.angle2d !== 0) {
            spr.drawRotatedLikeClient(
              this.rast.ctx,
              x + var10.tempWidth / 2,
              y + var10.tempHeight / 2,
              var10.angle2d,
              scale4096,
              var10.hFlip,
              var10.vFlip,
            );
          } else if (trans !== 0) {
            spr.drawTransScaledAt(this.rast.ctx, x, y, var10.tempWidth, var10.tempHeight, alpha, var10.hFlip, var10.vFlip);
          } else if (fullW === var10.tempWidth && fullH === var10.tempHeight) {
            spr.drawTransBgAt(this.rast.ctx, x, y, var10.hFlip, var10.vFlip);
          } else {
            spr.drawScaledAt(this.rast.ctx, x, y, var10.tempWidth, var10.tempHeight, var10.hFlip, var10.vFlip);
          }
        } else {
          if (fullW <= 0 || fullH <= 0) continue;
          const tilesX = Math.trunc((fullW - 1 + var10.tempWidth) / fullW);
          const tilesY = Math.trunc((fullH - 1 + var10.tempHeight) / fullH);
          const ctx = this.rast.ctx;
          ctx.save();
          ctx.beginPath();
          ctx.rect(clipX1, clipY1, Math.max(0, clipX2 - clipX1), Math.max(0, clipY2 - clipY1));
          ctx.clip();
          for (let tx = 0; tx < tilesX; tx++) {
            for (let ty = 0; ty < tilesY; ty++) {
              const drawX = x + fullW * tx;
              const drawY = y + fullH * ty;
              if (var10.angle2d !== 0) {
                spr.drawRotatedLikeClient(
                  ctx,
                  x + fullW / 2 + fullW * tx,
                  y + fullH / 2 + fullH * ty,
                  var10.angle2d,
                  4096,
                  var10.hFlip,
                  var10.vFlip,
                );
              } else if (trans !== 0) {
                spr.drawTransAt(ctx, drawX, drawY, alpha, var10.hFlip, var10.vFlip);
              } else {
                spr.drawTransBgAt(ctx, drawX, drawY, var10.hFlip, var10.vFlip);
              }
            }
          }
          ctx.restore();
        }
        continue;
      }

      if (var10.type === 6) {
        continue;
      }

      if (var10.type === 8) {
        const text = method3864(var10.text ?? "", var10);
        if (text) {
          const lines = text.split("<br>");
          const lineH = 13;
          const blockW = Math.max(...lines.map((l) => l.length * 6)) + 6;
          const blockH = lines.length * lineH + 7;
          const bx = Math.max(x + 5, Math.min(var4 - blockW, x + var10.tempWidth - 5 - blockW));
          const byTip = Math.min(var5 - blockH, y + var10.tempHeight + 5);
          this.rast.fillRect(bx, byTip, blockW, blockH, 0xffff60);
          this.rast.drawRect(bx, byTip, blockW, blockH, 0x000000);
          for (let i = 0; i < lines.length; i++) {
            this.rast.drawText(lines[i]!, bx + 3, byTip + i * lineH, blockW, lineH, 0x000000, 0, 0, false, 255, 0, 494);
          }
        }
        continue;
      }

      if (var10.type === 9) {
        let lxA: number;
        let lyA: number;
        let lxB: number;
        let lyB: number;

        if (var10.lineDirection) {
          lxA = x;
          lyA = y + var10.tempHeight;
          lxB = x + var10.tempWidth;
          lyB = y;
        } else {
          lxA = x;
          lyA = y;
          lxB = x + var10.tempWidth;
          lyB = y + var10.tempHeight;
        }

        if (var10.lineWid === 1) {
          this.rast.drawLine(lxA, lyA, lxB, lyB, var10.colour1);
        } else {
          this.rast.drawThickLine(lxA, lyA, lxB, lyB, var10.colour1, var10.lineWid);
        }
        continue;
      }

      if (var10.type === 12) {
        continue;
      }
      } finally {
        this.rast.setClip(var2, var3, var4, var5);
      }
    }
  }

  private getOrFetchSprite(spriteId: number): Sprite | null {
    const cached = this.spriteCache.get(spriteId);
    if (cached !== undefined) return cached;

    this.spriteCache.set(spriteId, null);
    fetchSpriteCached(spriteId, this.rev, this.cacheHeaders).then((sprite) => {
      this.spriteCache.set(spriteId, sprite);
      this.onSpriteLoaded?.();
    });
    return null;
  }

  clearSpriteCache() {
    this.spriteCache.clear();
  }

  getComponentDrawBounds(componentId: number): ComponentDrawBounds | null {
    return this.drawBoundsByComponentId.get(componentId) ?? null;
  }

  getComponentDrawBoundsFor(comp: ComponentType | null | undefined): ComponentDrawBounds | null {
    if (!comp) return null;
    return this.drawBoundsByComponentRef.get(comp) ?? this.getComponentDrawBounds(comp.id);
  }
}

function buildLayerMapFromArray(children: ComponentType[], fallbackLayer: number): Map<number, ComponentType[]> {
  const map = new Map<number, ComponentType[]>();
  for (const comp of children) {
    let layer = comp.layer;
    if (!Number.isFinite(layer)) {
      layer = fallbackLayer;
    }
    let arr = map.get(layer);
    if (!arr) {
      arr = [];
      map.set(layer, arr);
    }
    arr.push(comp);
  }

  if (!map.has(fallbackLayer)) {
    map.set(fallbackLayer, [...children]);
  }
  return map;
}

function buildLayerMap(components: Record<string, ComponentType>): Map<number, ComponentType[]> {
  const map = new Map<number, ComponentType[]>();
  for (const key of Object.keys(components)) {
    const comp = components[key]!;
    const layer = comp.layer;
    let arr = map.get(layer);
    if (!arr) {
      arr = [];
      map.set(layer, arr);
    }
    arr.push(comp);
  }
  return map;
}

