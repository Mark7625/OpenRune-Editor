import type { EditorToolKeyBinding, EditorToolKeyChord } from "./builtin-plugin-types";

export const CORE_VIEWER_KEYBIND_PLUGIN_ID = "core";
export const CORE_VIEWER_KEYBIND_PLUGIN_NAME = "Core";

function noopSuppressCamera(): false {
    return false;
}

export const CORE_VIEWER_KEY_BINDINGS: readonly EditorToolKeyBinding[] = [
    { id: "move-forward", name: "Move forward", description: "Pan the camera forward in the horizontal plane (WASD-style).", defaultChords: [{ code: "KeyW" }], trigger: "HELD", action: noopSuppressCamera },
    { id: "move-back", name: "Move back", defaultChords: [{ code: "KeyS" }], trigger: "HELD", action: noopSuppressCamera },
    { id: "move-left", name: "Move left", defaultChords: [{ code: "KeyA" }], trigger: "HELD", action: noopSuppressCamera },
    { id: "move-right", name: "Move right", defaultChords: [{ code: "KeyD" }], trigger: "HELD", action: noopSuppressCamera },
    { id: "move-up", name: "Move up", description: "Raise camera height. Either chord triggers the same action.", defaultChords: [{ code: "KeyE" }, { code: "KeyR" }], trigger: "HELD", action: noopSuppressCamera },
    { id: "move-down", name: "Move down", description: "Lower camera height.", defaultChords: [{ code: "KeyQ" }, { code: "KeyC" }, { code: "KeyF" }], trigger: "HELD", action: noopSuppressCamera },
    { id: "look-up", name: "Look up / tilt", defaultChords: [{ code: "ArrowUp" }], trigger: "HELD", action: noopSuppressCamera },
    { id: "look-down", name: "Look down / tilt", defaultChords: [{ code: "ArrowDown" }], trigger: "HELD", action: noopSuppressCamera },
    { id: "look-left", name: "Look left / yaw", defaultChords: [{ code: "ArrowLeft" }], trigger: "HELD", action: noopSuppressCamera },
    { id: "look-right", name: "Look right / yaw", defaultChords: [{ code: "ArrowRight" }], trigger: "HELD", action: noopSuppressCamera },
    { id: "zoom-in", name: "Zoom in", description: "Hold to zoom in (same limits as the scroll wheel).", defaultChords: [{ code: "Equal" }, { code: "NumpadAdd" }], trigger: "HELD", action: noopSuppressCamera },
    { id: "zoom-out", name: "Zoom out", defaultChords: [{ code: "Minus" }, { code: "NumpadSubtract" }], trigger: "HELD", action: noopSuppressCamera },
    { id: "speed-boost", name: "Move faster", description: "Hold while moving to multiply travel speed.", defaultChords: [{ code: "ShiftLeft" }, { code: "ShiftRight" }], trigger: "HELD", action: noopSuppressCamera },
    { id: "speed-slow", name: "Move slower", description: "Hold while moving to reduce travel speed.", defaultChords: [{ code: "Tab" }], trigger: "HELD", action: noopSuppressCamera },
];

const coreChordByBindingId = new Map<string, readonly EditorToolKeyChord[]>();
for (const b of CORE_VIEWER_KEY_BINDINGS) {
    coreChordByBindingId.set(b.id, b.defaultChords);
}

export function coreViewerBindingKey(bindingId: string): string {
    return `${CORE_VIEWER_KEYBIND_PLUGIN_ID}:${bindingId}`;
}

export function coreViewerDefaultChords(bindingId: string): readonly EditorToolKeyChord[] {
    return coreChordByBindingId.get(bindingId) ?? [];
}
