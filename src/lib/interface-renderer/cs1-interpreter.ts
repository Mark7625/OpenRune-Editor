import type { ComponentType, InterfaceEntry } from "./component-types";
import type { VarbitDefinitionLookup } from "./varbit-definition";
import { experienceForMaxLevel } from "./osrs-experience-table";
import { Varps } from "./varps";

export { DEFAULT_VARP_MAIN_LENGTH, Varps } from "./varps";

export type Cs1SimInventory = {
  itemIds: number[];
  itemQuantities: number[];
};

export type Cs1SimState = {
  combatLevel: number;
  runEnergy: number;
  weight: number;
  currentLevels: number[];
  maximumLevels: number[];
  currentExp: number[];
  isMembersWorld: boolean;
  membersOnlyItemIds?: ReadonlySet<number> | null;
  simulatedInventories: Record<number, Cs1SimInventory>;
  varps: Varps;
  localTileX: number;
  localTileY: number;
};

export type Cs1InterpreterContext = {
  interfaceEntry: InterfaceEntry | null;
  varbitDefinitionLookup?: VarbitDefinitionLookup | null;
};

export class Cs1Interpreter {
  static readonly SKILL_COUNT = 25;
  static readonly VISIBLE_SKILL_COUNT = 24;
  static readonly XP_AT_99 = 13_034_431;
  static readonly DEFAULT_INV_SLOTS = 28;
  static readonly DEFAULT_COMBAT_LEVEL = 3;
  static readonly DEFAULT_RUN_ENERGY = 89;
  static readonly DEFAULT_WEIGHT = 30;
  static readonly DEFAULT_TILE_X = 0;
  static readonly DEFAULT_TILE_Y = 0;

  static readonly WIDGET_ITEM_FOUND_SENTINEL = 999_999_999;

  static readonly Op = {
    RETURN: 0,
    SKILL_CUR: 1,
    SKILL_MAX: 2,
    SKILL_XP: 3,
    WIDGET_ITEM_QTY: 4,
    VARP: 5,
    XP_FOR_MAX: 6,
    VARP_SCALED: 7,
    COMBAT: 8,
    SUM_MAX_LV: 9,
    WIDGET_HAS_ITEM: 10,
    RUN_ENERGY: 11,
    WEIGHT: 12,
    VARP_BIT: 13,
    VARBIT: 14,
    COMBINE_SUB: 15,
    COMBINE_DIV: 16,
    COMBINE_MUL: 17,
    TILE_X: 18,
    TILE_Y: 19,
    LITERAL: 20,
  } as const;

  static readonly SIM_SKILL_OPCODES: ReadonlySet<number> = new Set([
    Cs1Interpreter.Op.SKILL_CUR,
    Cs1Interpreter.Op.SKILL_MAX,
    Cs1Interpreter.Op.SKILL_XP,
    Cs1Interpreter.Op.XP_FOR_MAX,
  ]);

  static readonly SIM_INVENTORY_OPCODES: ReadonlySet<number> = new Set([
    Cs1Interpreter.Op.WIDGET_ITEM_QTY,
    Cs1Interpreter.Op.WIDGET_HAS_ITEM,
  ]);

  static readonly SIM_GENERAL_OPCODES: ReadonlySet<number> = new Set([
    Cs1Interpreter.Op.COMBAT,
    Cs1Interpreter.Op.RUN_ENERGY,
    Cs1Interpreter.Op.WEIGHT,
  ]);

  static readonly SIM_VARIABLE_OPCODES: ReadonlySet<number> = new Set([
    Cs1Interpreter.Op.VARP,
    Cs1Interpreter.Op.VARP_SCALED,
    Cs1Interpreter.Op.VARP_BIT,
    Cs1Interpreter.Op.VARBIT,
  ]);

  static defaultState(): Cs1SimState {
    const n = Cs1Interpreter.SKILL_COUNT;
    return {
      combatLevel: Cs1Interpreter.DEFAULT_COMBAT_LEVEL,
      runEnergy: Cs1Interpreter.DEFAULT_RUN_ENERGY,
      weight: Cs1Interpreter.DEFAULT_WEIGHT,
      currentLevels: Array.from({ length: n }, () => 1),
      maximumLevels: Array.from({ length: n }, () => 99),
      currentExp: Array.from({ length: n }, () => 0),
      isMembersWorld: true,
      membersOnlyItemIds: null,
      simulatedInventories: {},
      varps: Varps.createDefault(),
      localTileX: Cs1Interpreter.DEFAULT_TILE_X,
      localTileY: Cs1Interpreter.DEFAULT_TILE_Y,
    };
  }

  static itemSlotEncoding(definitionId: number): number {
    if (definitionId <= 0) return 0;
    return definitionId + 1;
  }

  static interfaceUsesCs1(entry: InterfaceEntry | null): boolean {
    if (!entry?.components) return false;
    for (const c of Object.values(entry.components)) {
      const scripts = c.cs1Instructions;
      if (scripts != null && scripts.length > 0) return true;
    }
    return false;
  }

  static interfaceScriptsUseOpcodes(entry: InterfaceEntry | null, wanted: ReadonlySet<number>): boolean {
    if (!entry?.components) return false;
    for (const c of Object.values(entry.components)) {
      const scripts = c.cs1Instructions;
      if (!scripts) continue;
      for (const script of scripts) {
        if (script && script.length > 0 && Cs1Interpreter.scriptUsesAnyOpcode(script, wanted)) return true;
      }
    }
    return false;
  }

  private static scriptUsesAnyOpcode(code: readonly number[], wanted: ReadonlySet<number>): boolean {
    let ip = 0;
    const O = Cs1Interpreter.Op;
    while (ip < code.length) {
      const op = code[ip++]!;
      if (wanted.has(op)) return true;
      if (op === O.RETURN) return false;
      const next = Cs1Interpreter.advanceIpPastOperands(op, code, ip);
      if (next < 0) return false;
      ip = next;
    }
    return false;
  }

  private static advanceIpPastOperands(op: number, code: readonly number[], ip: number): number {
    const O = Cs1Interpreter.Op;
    switch (op) {
      case O.SKILL_CUR:
      case O.SKILL_MAX:
      case O.SKILL_XP:
      case O.VARP:
      case O.XP_FOR_MAX:
      case O.VARP_SCALED:
      case O.COMBAT:
      case O.SUM_MAX_LV:
      case O.RUN_ENERGY:
      case O.WEIGHT:
      case O.VARBIT:
        return ip + 1 <= code.length ? ip + 1 : -1;
      case O.WIDGET_ITEM_QTY:
      case O.WIDGET_HAS_ITEM:
        return ip + 3 <= code.length ? ip + 3 : -1;
      case O.VARP_BIT:
        return ip + 2 <= code.length ? ip + 2 : -1;
      case O.COMBINE_SUB:
      case O.COMBINE_DIV:
      case O.COMBINE_MUL:
      case O.TILE_X:
      case O.TILE_Y:
        return ip;
      case O.LITERAL:
        return ip + 1 <= code.length ? ip + 1 : -1;
      default:
        return -1;
    }
  }

  static evaluate(
    widget: ComponentType,
    scriptIndex: number,
    state: Cs1SimState,
    context?: Cs1InterpreterContext,
  ): number {
    const scripts = widget.cs1Instructions;
    if (!scripts || scriptIndex >= scripts.length) return -2;
    const code = scripts[scriptIndex];
    if (!code || code.length === 0) return -2;

    const O = Cs1Interpreter.Op;
    const iface = context?.interfaceEntry ?? null;
    const varbitLookup = context?.varbitDefinitionLookup ?? null;

    try {
      let acc = 0;
      let ip = 0;
      let pendingCombine = 0;

      while (true) {
        const op = code[ip++]!;
        let push = 0;
        let setCombine = 0;

        if (op === O.RETURN) return acc;

        if (op === O.SKILL_CUR) {
          push = Cs1Interpreter.at(state.currentLevels, code[ip++]!);
        } else if (op === O.SKILL_MAX) {
          push = Cs1Interpreter.at(state.maximumLevels, code[ip++]!);
        } else if (op === O.SKILL_XP) {
          push = Cs1Interpreter.at(state.currentExp, code[ip++]!);
        } else if (op === O.WIDGET_ITEM_QTY) {
          let packed = code[ip++]! << 16;
          packed += code[ip++]!;
          const itemId = code[ip++]!;
          const raw = Cs1Interpreter.resolveWidget(iface, packed);
          const target = raw ? Cs1Interpreter.applySimInventory(raw, state) : null;
          if (
            target &&
            Cs1Interpreter.itemCountsForWorld(itemId, state) &&
            target.itemIds &&
            target.itemQuantities &&
            target.itemIds.length > 0
          ) {
            const n = Math.min(target.itemIds.length, target.itemQuantities.length);
            for (let s = 0; s < n; s++) {
              if (itemId + 1 === target.itemIds[s]) push += target.itemQuantities[s] ?? 0;
            }
          }
        } else if (op === O.VARP) {
          push = state.varps.getVarp(code[ip++]!);
        } else if (op === O.VARP_SCALED) {
          push = Math.trunc((state.varps.getVarp(code[ip++]!) * 100) / 46875);
        } else if (op === O.SUM_MAX_LV) {
          for (let i = 0; i < Cs1Interpreter.SKILL_COUNT; i++) {
            push += Cs1Interpreter.at(state.maximumLevels, i);
          }
        } else if (op === O.WIDGET_HAS_ITEM) {
          let packed = code[ip++]! << 16;
          packed += code[ip++]!;
          const itemId = code[ip++]!;
          const raw = Cs1Interpreter.resolveWidget(iface, packed);
          const target = raw ? Cs1Interpreter.applySimInventory(raw, state) : null;
          if (target && Cs1Interpreter.itemCountsForWorld(itemId, state) && target.itemIds?.length) {
            for (let s = 0; s < target.itemIds.length; s++) {
              if (itemId + 1 === target.itemIds[s]) {
                push = Cs1Interpreter.WIDGET_ITEM_FOUND_SENTINEL;
                break;
              }
            }
          }
        } else if (op === O.XP_FOR_MAX) {
          const skill = code[ip++]!;
          push = experienceForMaxLevel(Cs1Interpreter.at(state.maximumLevels, skill));
        } else if (op === O.COMBAT) {
          push = state.combatLevel;
        } else if (op === O.RUN_ENERGY) {
          push = state.runEnergy;
        } else if (op === O.WEIGHT) {
          push = state.weight;
        } else if (op === O.VARBIT) {
          push = state.varps.getVarbit(code[ip++]!, varbitLookup);
        } else if (op === O.VARP_BIT) {
          const varpId = code[ip++]!;
          const bit = code[ip++]!;
          push = Cs1Interpreter.varpBit(state.varps.getVarp(varpId), bit) ? 1 : 0;
        } else if (op === O.COMBINE_SUB) {
          setCombine = 1;
        } else if (op === O.COMBINE_DIV) {
          setCombine = 2;
        } else if (op === O.COMBINE_MUL) {
          setCombine = 3;
        } else if (op === O.TILE_X) {
          push = state.localTileX;
        } else if (op === O.TILE_Y) {
          push = state.localTileY;
        } else if (op === O.LITERAL) {
          push = code[ip++]!;
        } else {
          return -1;
        }

        if (setCombine === 0) {
          if (pendingCombine === 0) acc += push;
          else if (pendingCombine === 1) acc -= push;
          else if (pendingCombine === 2 && push !== 0) acc = Math.trunc(acc / push);
          else if (pendingCombine === 3) acc *= push;
          pendingCombine = 0;
        } else {
          pendingCombine = setCombine;
        }
      }
    } catch {
      return -1;
    }
  }

  private static applySimInventory(comp: ComponentType, state: Cs1SimState): ComponentType {
    const sim = state.simulatedInventories[comp.id];
    if (!sim) return comp;
    return { ...comp, itemIds: [...sim.itemIds], itemQuantities: [...sim.itemQuantities] };
  }

  private static itemCountsForWorld(itemId: number, state: Cs1SimState): boolean {
    if (itemId === -1) return false;
    const memb = state.membersOnlyItemIds;
    if (memb == null || memb.size === 0) return true;
    return !memb.has(itemId) || state.isMembersWorld;
  }

  private static resolveWidget(entry: InterfaceEntry | null, packed: number): ComponentType | null {
    if (!entry?.components) return null;
    const componentId = packed & 0xffff;
    const comps = entry.components as Record<string, ComponentType>;
    const direct = comps[String(componentId)];
    if (direct) return direct;
    for (const c of Object.values(comps)) {
      if (c.id === componentId) return c;
      if (typeof c.packedId === "number" && (c.packedId & 0xffff) === componentId) return c;
    }
    return null;
  }

  private static at(arr: readonly number[], index: number): number {
    if (index < 0 || index >= arr.length) return 0;
    return arr[index]!;
  }

  private static varpBit(rawVarp: number, bit: number): boolean {
    if (!Number.isFinite(bit) || bit < 0 || bit > 31) return false;
    const v = rawVarp | 0;
    const mask = bit === 31 ? -2147483648 : 1 << bit;
    return (v & mask) !== 0;
  }
}
