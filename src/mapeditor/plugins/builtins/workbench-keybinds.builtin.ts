import type { EditorToolKeyBinding, EditorToolKeyChord } from "./builtin-plugin-types";

export const WORKBENCH_KEYBIND_PLUGIN_ID = "workbench";
export const WORKBENCH_KEYBIND_PLUGIN_NAME = "Workbench";

export const WORKBENCH_KEY_BINDINGS: readonly EditorToolKeyBinding[] = [
    { id: "brush-size-up", name: "Increase brush size", defaultChords: [{ code: "BracketRight" }], trigger: "PRESSED", action: ({ host }) => void host.adjustBrushSize(1) },
    { id: "brush-size-down", name: "Decrease brush size", defaultChords: [{ code: "BracketLeft" }], trigger: "PRESSED", action: ({ host }) => void host.adjustBrushSize(-1) },
    { id: "toggle-objects-visible", name: "Toggle objects visible", description: "Show or hide world objects in the editor viewport.", defaultChords: [{ code: "KeyO" }], trigger: "PRESSED", action: ({ host }) => void host.toggleObjectsVisible() },
    { id: "toggle-terrain-smoothing", name: "Toggle terrain smoothing", description: "Enable or disable terrain underlay smoothing/blending in the editor view.", defaultChords: [{ code: "KeyM" }], trigger: "PRESSED", action: ({ host }) => void host.toggleTerrainSmoothingEnabled() },
];

const workbenchChordByBindingId = new Map<string, readonly EditorToolKeyChord[]>();
for (const b of WORKBENCH_KEY_BINDINGS) {
    workbenchChordByBindingId.set(b.id, b.defaultChords);
}

export function workbenchBindingKey(bindingId: string): string {
    return `${WORKBENCH_KEYBIND_PLUGIN_ID}:${bindingId}`;
}

export function workbenchDefaultChords(bindingId: string): readonly EditorToolKeyChord[] {
    return workbenchChordByBindingId.get(bindingId) ?? [];
}
