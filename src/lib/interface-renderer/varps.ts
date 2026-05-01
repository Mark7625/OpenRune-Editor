import type { VarbitDefinition, VarbitDefinitionLookup } from "./varbit-definition";

export const DEFAULT_VARP_MAIN_LENGTH = 10_000;

export const Varps_masks: readonly number[] = Object.freeze(
  Array.from({ length: 32 }, (_, span) => {
    const bitCount = span + 1;
    if (bitCount >= 32) return (-1 >>> 0) >>> 0;
    return (((1 << bitCount) >>> 0) - 1) >>> 0;
  }),
);

export class Varps {
  Varps_main: number[];

  static readonly Varps_masks = Varps_masks;
  constructor(capacity: number = DEFAULT_VARP_MAIN_LENGTH, copyFrom?: readonly number[]) {
    const cap =
      typeof capacity === "number" && Number.isFinite(capacity) && capacity > 0
        ? Math.trunc(capacity)
        : DEFAULT_VARP_MAIN_LENGTH;
    if (copyFrom) {
      this.Varps_main = Array.from({ length: cap }, (_, i) => copyFrom[i] ?? 0);
    } else {
      this.Varps_main = Array.from({ length: cap }, () => 0);
    }
  }

  getVarp(id: number): number {
    if (!Number.isFinite(id) || id < 0 || id >= this.Varps_main.length) return 0;
    return this.Varps_main[id]!;
  }

  getVarbit(varbitId: number, lookup: VarbitDefinitionLookup | null | undefined): number {
    if (!lookup) return 0;
    const def = lookup(varbitId);
    if (!def) return 0;
    return Varps.evaluateVarbit(this.Varps_main, def);
  }

  static getVarbit(
    varbitId: number,
    main: readonly number[] | null | undefined,
    lookup: VarbitDefinitionLookup | null | undefined,
  ): number {
    if (!main || !lookup) return 0;
    const def = lookup(varbitId);
    if (!def) return 0;
    return Varps.evaluateVarbit(main, def);
  }

  static evaluateVarbit(main: readonly number[], def: VarbitDefinition): number {
    const span = def.endBit - def.startBit;
    if (span < 0 || span >= Varps_masks.length) return 0;
    const mask = Varps_masks[span]! >>> 0;
    const bi = def.baseVar;
    if (bi < 0 || bi >= main.length) return 0;
    const raw = main[bi]! | 0;
    return ((raw >> def.startBit) & mask) | 0;
  }

  setVarp(id: number, value: number): void {
    if (!Number.isFinite(id) || id < 0 || id >= this.Varps_main.length) return;
    this.Varps_main[id] = Math.trunc(value);
  }

  withVarp(id: number, value: number): Varps {
    const next = new Varps(this.Varps_main.length, this.Varps_main);
    next.setVarp(id, value);
    return next;
  }

  clone(): Varps {
    return new Varps(this.Varps_main.length, this.Varps_main);
  }

  static createDefault(capacity: number = DEFAULT_VARP_MAIN_LENGTH): Varps {
    return new Varps(capacity);
  }
}
