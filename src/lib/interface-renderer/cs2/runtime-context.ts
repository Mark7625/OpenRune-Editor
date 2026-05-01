import type { VarbitDefinitionLookup } from "../varbit-definition";
import type { Cs1SimState } from "../cs1-interpreter";
import { Varps } from "../varps";
import type { InterfaceEntry } from "../component-types";

export type Cs2RuntimeContext = {
  scriptRev: string | number;
  cacheHeaders: HeadersInit;
  varps: Varps;
  varbitLookup: VarbitDefinitionLookup | null;
  interfaceEntry: InterfaceEntry | null;
  canvasWidth: number | null;
  canvasHeight: number | null;
};

const defaultVarps = Varps.createDefault();

let ctx: Cs2RuntimeContext = {
  scriptRev: "latest",
  cacheHeaders: {},
  varps: defaultVarps,
  varbitLookup: null,
  interfaceEntry: null,
  canvasWidth: null,
  canvasHeight: null,
};

export function getCs2RuntimeContext(): Cs2RuntimeContext {
  return ctx;
}

export function applyCs2RuntimeFromSim(
  sim: Cs1SimState | null | undefined,
  scriptRev: string | number,
  cacheHeaders: HeadersInit,
  varbitLookup: VarbitDefinitionLookup | null | undefined,
  interfaceEntry: InterfaceEntry | null | undefined = null,
  canvasWidth: number | null | undefined = null,
  canvasHeight: number | null | undefined = null,
): void {
  ctx = {
    scriptRev,
    cacheHeaders,
    varps: sim?.varps ?? defaultVarps,
    varbitLookup: varbitLookup ?? null,
    interfaceEntry: interfaceEntry ?? null,
    canvasWidth: typeof canvasWidth === "number" ? canvasWidth : null,
    canvasHeight: typeof canvasHeight === "number" ? canvasHeight : null,
  };
}
