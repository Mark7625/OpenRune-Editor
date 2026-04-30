import type { InputManager } from "../mapviewer/InputManager";
import {
    CORE_VIEWER_KEYBIND_PLUGIN_ID,
    CORE_VIEWER_KEYBIND_PLUGIN_NAME,
    CORE_VIEWER_KEY_BINDINGS,
} from "./plugins/builtins/core-viewer-keybinds.builtin";
import {
    WORKBENCH_KEYBIND_PLUGIN_ID,
    WORKBENCH_KEYBIND_PLUGIN_NAME,
    WORKBENCH_KEY_BINDINGS,
} from "./plugins/builtins/workbench-keybinds.builtin";
import {
    BUILTIN_EDITOR_TOOL_PLUGINS,
    getBuiltinEditorToolPlugin,
} from "./plugins/builtins/current-plugin-layout.builtin";
import type {
    EditorToolKeyBinding,
    EditorToolKeybindTrigger,
    EditorToolKeyChord,
    EditorToolPaintModifiers,
} from "./plugins/builtins/builtin-plugin-types";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";

const DEFAULT_PAINT_MODIFIERS: EditorToolPaintModifiers = {
    controlWheelAdjustsBrushSize: true,
};

export function getActivePaintModifiers(host: IEditorPluginHost): Required<EditorToolPaintModifiers> {
    if (host.isEditorInputSuspended()) {
        return {
            controlWheelAdjustsBrushSize: DEFAULT_PAINT_MODIFIERS.controlWheelAdjustsBrushSize ?? true,
            overlayRestrictToFootprintWithControl: false,
            overlaySameIdFloodWithControlAlt: false,
            heightInvertWithAlt: false,
        };
    }
    const plugin = getBuiltinEditorToolPlugin(host.getEditorTool());
    const merged = {
        ...DEFAULT_PAINT_MODIFIERS,
        ...(
            plugin.paintPolicy?.getPaintModifiers?.({ host, input: host.inputManager }) ??
            plugin.getPaintModifiers?.({ host, input: host.inputManager })
        ),
    };
    return {
        controlWheelAdjustsBrushSize: merged.controlWheelAdjustsBrushSize ?? true,
        overlayRestrictToFootprintWithControl: merged.overlayRestrictToFootprintWithControl ?? false,
        overlaySameIdFloodWithControlAlt: merged.overlaySameIdFloodWithControlAlt ?? false,
        heightInvertWithAlt: merged.heightInvertWithAlt ?? false,
    };
}

function chordMatchesModifiers(chord: EditorToolKeyChord, input: InputManager): boolean {
    if (chord.ctrlKey !== undefined && chord.ctrlKey !== input.isControlDown()) {
        return false;
    }
    if (chord.altKey !== undefined && chord.altKey !== input.isAltDown()) {
        return false;
    }
    if (chord.shiftKey !== undefined && chord.shiftKey !== input.isShiftDown()) {
        return false;
    }
    return true;
}

export const MOUSE_CHORD_CODES = new Set(["MouseLeft", "MouseRight", "MouseMiddle"]);

export function isMouseChordCode(code: string): boolean {
    return MOUSE_CHORD_CODES.has(code);
}

export function getChordCodes(chord: EditorToolKeyChord): readonly string[] {
    return Array.isArray(chord.code) ? chord.code : [chord.code];
}

/** True if any resolved chord for this binding shares a `KeyboardEvent.code` with the tool-suppressed set. */
export function isEditorToolBindingSuppressedThisFrame(
    host: IEditorPluginHost,
    bindingKey: string,
    defaultChords: readonly EditorToolKeyChord[],
    suppressedCodes: Set<string>,
): boolean {
    if (suppressedCodes.size === 0) {
        return false;
    }
    const resolved = host.getResolvedKeybindChords(bindingKey, defaultChords);
    for (const chord of resolved) {
        for (const code of getChordCodes(chord)) {
            if (suppressedCodes.has(code)) {
                return true;
            }
        }
    }
    return false;
}

function formatChordCode(code: string): string {
    if (code === "MouseLeft") {
        return "LMB";
    }
    if (code === "MouseRight") {
        return "RMB";
    }
    if (code === "MouseMiddle") {
        return "MMB";
    }
    if (code.startsWith("Key")) {
        return code.slice(3).toUpperCase();
    }
    if (code.startsWith("Digit")) {
        return code.slice(5);
    }
    return code.replace(/(Left|Right)$/, "");
}

function chordMatchesHeldState(chord: EditorToolKeyChord, input: InputManager): boolean {
    for (const code of getChordCodes(chord)) {
        if (!input.isKeyDown(code)) {
            return false;
        }
    }
    return true;
}

function chordMatchesPressedState(chord: EditorToolKeyChord, input: InputManager): boolean {
    const codes = getChordCodes(chord);
    if (codes.length === 0) {
        return false;
    }
    const allHeld = codes.every((code) => input.isKeyDown(code));
    if (!allHeld) {
        return false;
    }
    return codes.some((code) => input.keysPressedThisFrame.has(code));
}

export function keybindChordEquals(a: EditorToolKeyChord, b: EditorToolKeyChord): boolean {
    const aCodes = getChordCodes(a);
    const bCodes = getChordCodes(b);
    if (aCodes.length !== bCodes.length) {
        return false;
    }
    const bSet = new Set(bCodes);
    return (
        aCodes.every((code) => bSet.has(code)) &&
        !!a.ctrlKey === !!b.ctrlKey &&
        !!a.altKey === !!b.altKey &&
        !!a.shiftKey === !!b.shiftKey
    );
}

export function keybindChordToLabel(chord: EditorToolKeyChord | null): string {
    if (!chord) {
        return "Not set";
    }
    const parts: string[] = [];
    if (chord.ctrlKey) {
        parts.push("Ctrl");
    }
    if (chord.altKey) {
        parts.push("Alt");
    }
    if (chord.shiftKey) {
        parts.push("Shift");
    }
    for (const code of getChordCodes(chord)) {
        const formatted = formatChordCode(code);
        if (formatted) {
            parts.push(formatted);
        }
    }
    return parts.join("+");
}

export function getDefaultKeybindChords(binding: EditorToolKeyBinding): readonly EditorToolKeyChord[] {
    return binding.defaultChords;
}

export type EditorToolKeybindDescriptor = {
    pluginId: string;
    pluginName: string;
    binding: EditorToolKeyBinding;
    key: string;
};

export function isEditorToolKeybindHeld(
    host: IEditorPluginHost,
    bindingKey: string,
    defaultChords: readonly EditorToolKeyChord[],
): boolean {
    if (host.isEditorInputSuspended()) {
        return false;
    }
    const input = host.inputManager;
    const chords = host.getResolvedKeybindChords(bindingKey, defaultChords);
    for (const chord of chords) {
        if (chordMatchesModifiers(chord, input) && chordMatchesHeldState(chord, input)) {
            return true;
        }
    }
    return false;
}

export function getRegisteredEditorToolKeybinds(): EditorToolKeybindDescriptor[] {
    const rows: EditorToolKeybindDescriptor[] = [];
    for (const binding of CORE_VIEWER_KEY_BINDINGS) {
        rows.push({
            pluginId: CORE_VIEWER_KEYBIND_PLUGIN_ID,
            pluginName: CORE_VIEWER_KEYBIND_PLUGIN_NAME,
            binding,
            key: `${CORE_VIEWER_KEYBIND_PLUGIN_ID}:${binding.id}`,
        });
    }
    for (const binding of WORKBENCH_KEY_BINDINGS) {
        rows.push({
            pluginId: WORKBENCH_KEYBIND_PLUGIN_ID,
            pluginName: WORKBENCH_KEYBIND_PLUGIN_NAME,
            binding,
            key: `${WORKBENCH_KEYBIND_PLUGIN_ID}:${binding.id}`,
        });
    }
    for (const plugin of BUILTIN_EDITOR_TOOL_PLUGINS) {
        for (const binding of plugin.keyBindings ?? []) {
            rows.push({
                pluginId: plugin.id,
                pluginName: plugin.name,
                binding,
                key: `${plugin.id}:${binding.id}`,
            });
        }
    }
    return rows;
}

/**
 * Runs `keyBindings` on the active editor tool plugin for keys pressed this frame (non-repeating keydown).
 * Returns `KeyboardEvent.code` values that should not drive default camera movement for this frame.
 */
export function runEditorToolKeyBindings(host: IEditorPluginHost): Set<string> {
    if (host.isEditorInputSuspended()) {
        return new Set();
    }
    const suppressed = new Set<string>();
    const input = host.inputManager;
    for (const row of getRegisteredEditorToolKeybinds()) {
        const kb = row.binding;
        const defaultChords = getDefaultKeybindChords(kb);
        if (defaultChords.length === 0) {
            continue;
        }
        const resolved = host.getResolvedKeybindChords(row.key, defaultChords);
        const trigger: EditorToolKeybindTrigger = kb.trigger ?? "PRESSED";
        let firedChord: EditorToolKeyChord | null = null;
        for (const chord of resolved) {
            const modifierMatch = chordMatchesModifiers(chord, input);
            if (!modifierMatch) {
                continue;
            }
            const fireNow =
                trigger === "HELD"
                    ? chordMatchesHeldState(chord, input)
                    : chordMatchesPressedState(chord, input);
            if (fireNow) {
                firedChord = chord;
                break;
            }
        }
        if (!firedChord) {
            continue;
        }
        if (kb.shouldProcess && !kb.shouldProcess({ host, input })) {
            continue;
        }
        const result = kb.action({ host, input });
        if (result !== false) {
            for (const code of getChordCodes(firedChord)) {
                suppressed.add(code);
            }
        }
    }
    return suppressed;
}
