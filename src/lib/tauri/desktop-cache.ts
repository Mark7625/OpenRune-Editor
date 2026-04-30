import { isTauriRuntime } from "./is-tauri";

export async function pickSystemCacheDirectory(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    // Use runtime import so web builds don't hard-resolve Tauri plugins.
    const runtimeImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;
    const dialog = await runtimeImport("@tauri-apps/plugin-dialog");
    const selected = await dialog.open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
  } catch {
    return null;
  }
}
