import type { GamevalExtraData, GamevalExtrasById } from "@/context/gameval-context";

export type VarbitDefinition = {
  baseVar: number;
  startBit: number;
  endBit: number;
};

export type VarbitDefinitionLookup = (varbitId: number) => VarbitDefinition | null;

function parseIntStrict(raw: string): number | null {
  const n = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export function tryParseVarbitDefinitionFromGamevalExtra(extra: GamevalExtraData | undefined): VarbitDefinition | null {
  if (!extra) return null;
  const fromSub = parseTripletFromSub(extra.sub);
  if (fromSub) return normalizeVarbitDefinition(fromSub);
  const fromText = parseTripletFromText(`${extra.text}\n${extra.searchable}`);
  if (fromText) return normalizeVarbitDefinition(fromText);
  return null;
}

function parseTripletFromSub(sub: Record<number, string>): { baseVar: number; startBit: number; endBit: number } | null {
  const entries = Object.entries(sub)
    .map(([k, v]) => ({ key: Number.parseInt(k, 10), v: String(v).trim() }))
    .filter((e) => Number.isFinite(e.key))
    .sort((a, b) => a.key - b.key);

  const ints: number[] = [];
  for (const e of entries) {
    const n = parseIntStrict(e.v);
    if (n != null) ints.push(n);
    if (ints.length >= 3) break;
  }
  if (ints.length < 3) return null;
  return { baseVar: ints[0]!, startBit: ints[1]!, endBit: ints[2]! };
}

function parseTripletFromText(text: string): { baseVar: number; startBit: number; endBit: number } | null {
  const matches = text.match(/-?\d+/g);
  if (!matches || matches.length < 3) return null;
  const a = parseIntStrict(matches[0]!);
  const b = parseIntStrict(matches[1]!);
  const c = parseIntStrict(matches[2]!);
  if (a == null || b == null || c == null) return null;
  return { baseVar: a, startBit: b, endBit: c };
}

function normalizeVarbitDefinition(def: VarbitDefinition): VarbitDefinition | null {
  let { baseVar, startBit, endBit } = def;
  if (baseVar < 0 || !Number.isFinite(baseVar)) return null;
  if (!Number.isFinite(startBit) || !Number.isFinite(endBit)) return null;
  if (startBit > endBit) {
    const t = startBit;
    startBit = endBit;
    endBit = t;
  }
  if (startBit < 0 || endBit > 31 || endBit - startBit >= 32) return null;
  return { baseVar: Math.trunc(baseVar), startBit: Math.trunc(startBit), endBit: Math.trunc(endBit) };
}

export function buildVarbitDefinitionMapFromGamevalExtras(extras: GamevalExtrasById): Map<number, VarbitDefinition> {
  const out = new Map<number, VarbitDefinition>();
  for (const [rawId, row] of Object.entries(extras)) {
    const id = Number.parseInt(rawId, 10);
    if (!Number.isFinite(id)) continue;
    const def = tryParseVarbitDefinitionFromGamevalExtra(row);
    if (def) out.set(id, def);
  }
  return out;
}

export function mapToVarbitLookup(map: Map<number, VarbitDefinition> | null | undefined): VarbitDefinitionLookup {
  return (varbitId: number) => map?.get(varbitId) ?? null;
}
