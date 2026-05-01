import type { InterfaceEntry } from "../component-types";
import { ScriptEvent } from "./script-event";
import { runScript } from "./run-script";

function normalizeOnLoadArgs(raw: unknown): unknown[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  const scriptId = typeof first === "number" ? first : Number(first);
  if (!Number.isFinite(scriptId)) return null;
  const out: unknown[] = [Math.trunc(scriptId)];
  for (let i = 1; i < raw.length; i++) out.push(raw[i]);
  return out;
}

export async function runWidgetOnLoadListener(entry: InterfaceEntry, var0: number): Promise<void> {
  if (var0 === -1) return;

  const iface = var0 & 0xffff;
  const comps = Object.values(entry.components).sort((a, b) => a.id - b.id);

  for (let var2 = 0; var2 < comps.length; ++var2) {
    const var3 = comps[var2]!;
    if (typeof var3.packedId === "number" && ((var3.packedId >>> 16) & 0xffff) !== iface) {
      continue;
    }
    const rawOnLoad = var3.onLoad;
    if (rawOnLoad == null) continue;
    const args = normalizeOnLoadArgs(rawOnLoad as unknown);
    if (!args) continue;
    const var4 = new ScriptEvent();
    var4.widget = var3;
    var4.args = args;
    await runScript(var4, 5000000, 0);
  }
}
