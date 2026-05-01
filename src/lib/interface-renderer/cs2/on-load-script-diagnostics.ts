import type { InterfaceEntry } from "../component-types";
import { Script } from "./Script";
import { normalizeOnLoadArgs } from "./runWidgetOnLoadListener";
import { getCs2RuntimeContext } from "./runtime-context";

/**
 * Check each widget `onLoad` script id: missing bytes / decode failure / no script index.
 * Does not execute scripts (only {@link Script.getScript}).
 */
export async function collectOnLoadScriptDiagnostics(
  entry: InterfaceEntry,
  interfaceRootId: number,
): Promise<string[]> {
  const lines: string[] = [];
  const { clientScriptIndex } = getCs2RuntimeContext();
  if (!clientScriptIndex) {
    lines.push("[onLoad] No client script index — cannot verify onLoad scripts (DAT2 index 12).");
    return lines;
  }
  if (!entry?.components) return lines;

  const iface = interfaceRootId & 0xffff;
  const comps = Object.values(entry.components).sort((a, b) => a.id - b.id);

  let checkedAnyOnLoad = false;
  for (const comp of comps) {
    if (typeof comp.packedId === "number" && ((comp.packedId >>> 16) & 0xffff) !== iface) {
      continue;
    }
    const rawOnLoad = comp.onLoad;
    if (rawOnLoad == null) continue;
    checkedAnyOnLoad = true;
    const args = normalizeOnLoadArgs(rawOnLoad as unknown);
    if (!args) {
      lines.push(
        `[onLoad] packed=${String(comp.packedId)} id=${comp.id}: invalid onLoad payload (expected [scriptId, ...args])`,
      );
      continue;
    }
    const rawId = args[0];
    const scriptId = typeof rawId === "number" ? rawId : Number(rawId);
    if (!Number.isFinite(scriptId)) {
      lines.push(
        `[onLoad] packed=${String(comp.packedId)} id=${comp.id}: non-numeric script id in onLoad (${String(rawId)})`,
      );
      continue;
    }
    const script = await Script.getScript(Math.trunc(scriptId));
    if (!script) {
      lines.push(
        `[onLoad] packed=${String(comp.packedId)} id=${comp.id}: script ${scriptId} missing or failed to decode`,
      );
    }
  }

  if (!checkedAnyOnLoad) {
    lines.push(`[onLoad] Interface ${interfaceRootId} has no onLoad client scripts on widgets.`);
    return lines;
  }

  if (lines.length === 0) {
    lines.push(`[onLoad] All onLoad scripts for interface ${interfaceRootId} resolved (${comps.length} widget(s) scanned).`);
  }
  return lines;
}
