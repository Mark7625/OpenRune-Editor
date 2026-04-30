import { useEffect, useMemo, useState } from "react";
import { Keyboard } from "lucide-react";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { keybindChordToLabel } from "../../editor-tool-input";
import { CORE_VIEWER_KEYBIND_PLUGIN_ID } from "./core-viewer-keybinds.builtin";
import type { MapEditorPlugin } from "../types";
import type { PluginContext } from "../types";
import type { EditorToolKeyChord } from "./builtin-plugin-types";

const MODIFIER_ONLY_CODES = new Set(["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight"]);

function mouseCodeFromButton(button: number): string | null {
    if (button === 0) {
        return "MouseLeft";
    }
    if (button === 1) {
        return "MouseMiddle";
    }
    if (button === 2) {
        return "MouseRight";
    }
    return null;
}

function getMenuPosition(x: number, y: number): { x: number; y: number } {
    const MENU_WIDTH = 180;
    const MENU_HEIGHT = 88;
    return {
        x: Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8)),
        y: Math.max(8, Math.min(y, window.innerHeight - MENU_HEIGHT - 8)),
    };
}

function getCaptureLabel(codes: string[], modifiers: { ctrl: boolean; alt: boolean; shift: boolean }): string {
    const parts: string[] = [];
    if (modifiers.ctrl) {
        parts.push("Ctrl");
    }
    if (modifiers.alt) {
        parts.push("Alt");
    }
    if (modifiers.shift) {
        parts.push("Shift");
    }
    if (codes.length > 0) {
        const codeLabel = keybindChordToLabel({
            code: codes.length === 1 ? codes[0]! : codes,
            ctrlKey: false,
            altKey: false,
            shiftKey: false,
        });
        if (codeLabel) {
            parts.push(codeLabel);
        }
    }
    return parts.join("+") || "Waiting...";
}

function KeybindsSettingsTab({ ctx }: { ctx: PluginContext }): JSX.Element {
    const [search, setSearch] = useState("");
    const [compact, setCompact] = useState(false);
    const [capturingKey, setCapturingKey] = useState<string | null>(null);
    const [capturePreview, setCapturePreview] = useState<EditorToolKeyChord | null>(null);
    const [capturePreviewLabel, setCapturePreviewLabel] = useState("Waiting...");
    const [rowMenu, setRowMenu] = useState<{ key: string; x: number; y: number } | null>(null);
    const q = search.trim().toLowerCase();

    const filtered = useMemo(
        () =>
            ctx.keybindings.filter((row) => {
                if (row.pluginId === CORE_VIEWER_KEYBIND_PLUGIN_ID) {
                    return false;
                }
                if (!q) {
                    return true;
                }
                const blob = [row.pluginName, row.pluginId, row.name, row.description ?? "", row.key]
                    .join(" ")
                    .toLowerCase();
                return blob.includes(q);
            }),
        [ctx.keybindings, q],
    );

    const groups = useMemo(() => {
        const map = new Map<string, typeof filtered>();
        for (const row of filtered) {
            const list = map.get(row.pluginName) ?? [];
            list.push(row);
            map.set(row.pluginName, list);
        }
        return Array.from(map.entries());
    }, [filtered]);

    useEffect(() => {
        if (!rowMenu) {
            return;
        }
        const close = () => setRowMenu(null);
        const onEsc = (event: KeyboardEvent) => {
            if (event.code === "Escape") {
                close();
            }
        };
        window.addEventListener("mousedown", close, true);
        window.addEventListener("scroll", close, true);
        window.addEventListener("keydown", onEsc, true);
        return () => {
            window.removeEventListener("mousedown", close, true);
            window.removeEventListener("scroll", close, true);
            window.removeEventListener("keydown", onEsc, true);
        };
    }, [rowMenu]);

    useEffect(() => {
        if (!capturingKey) {
            return;
        }
        const pressedNonModifiers = new Set<string>();
        let pendingChord: EditorToolKeyChord | null = null;

        const onKeyDown = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopPropagation();

            if (event.code === "Escape") {
                setCapturePreview(null);
                setCapturingKey(null);
                return;
            }

            if (event.code === "Backspace" || event.code === "Delete") {
                ctx.setKeybindOverride(capturingKey, null);
                setCapturePreview(null);
                setCapturingKey(null);
                return;
            }

            if (!MODIFIER_ONLY_CODES.has(event.code)) {
                pressedNonModifiers.add(event.code);
            }
            setCapturePreviewLabel(
                getCaptureLabel(Array.from(pressedNonModifiers).sort(), {
                    ctrl: event.ctrlKey,
                    alt: event.altKey,
                    shift: event.shiftKey,
                }),
            );
            if (pressedNonModifiers.size === 0) {
                return;
            }

            const codes = Array.from(pressedNonModifiers).sort();
            const chord: EditorToolKeyChord = {
                code: codes.length === 1 ? codes[0]! : codes,
                ctrlKey: event.ctrlKey || undefined,
                altKey: event.altKey || undefined,
                shiftKey: event.shiftKey || undefined,
            };
            pendingChord = chord;
            setCapturePreview(chord);
        };

        const onKeyUp = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopPropagation();
            if (!MODIFIER_ONLY_CODES.has(event.code)) {
                pressedNonModifiers.delete(event.code);
            }
            setCapturePreviewLabel(
                getCaptureLabel(Array.from(pressedNonModifiers).sort(), {
                    ctrl: event.ctrlKey,
                    alt: event.altKey,
                    shift: event.shiftKey,
                }),
            );
            if (pressedNonModifiers.size > 0) {
                return;
            }
            if (!pendingChord) {
                return;
            }
            ctx.setKeybindOverride(capturingKey, pendingChord);
            setCapturingKey(null);
        };

        const onMouseDown = (event: MouseEvent) => {
            const code = mouseCodeFromButton(event.button);
            if (!code) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            const chord: EditorToolKeyChord = {
                code,
                ctrlKey: event.ctrlKey || undefined,
                altKey: event.altKey || undefined,
                shiftKey: event.shiftKey || undefined,
            };
            setCapturePreview(chord);
            setCapturePreviewLabel(keybindChordToLabel(chord));
            ctx.setKeybindOverride(capturingKey, chord);
            setCapturingKey(null);
        };

        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);
        window.addEventListener("mousedown", onMouseDown, true);
        return () => {
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("keyup", onKeyUp, true);
            window.removeEventListener("mousedown", onMouseDown, true);
        };
    }, [capturingKey, ctx]);

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex items-center gap-2">
                {capturingKey ? (
                    <div className="flex-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-foreground">
                        Recording Keybind.. [{capturePreview ? keybindChordToLabel(capturePreview) : capturePreviewLabel}]
                    </div>
                ) : (
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search keybinds..."
                        className="h-8"
                    />
                )}
                <Button
                    type="button"
                    size="sm"
                    variant={compact ? "default" : "outline"}
                    onClick={() => setCompact((v) => !v)}
                >
                    Compact
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                        const ok = window.confirm("Reset all keybind overrides to defaults?");
                        if (ok) {
                            ctx.clearAllKeybindOverrides();
                        }
                    }}
                >
                    Reset all keybinds
                </Button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {groups.map(([pluginName, rows]) => (
                    <div key={pluginName} className="rounded-md border">
                        <div className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
                            {pluginName}
                        </div>
                        <div className="divide-y">
                            {rows.map((row) => {
                                const resolved = ctx.getResolvedKeybindChords(row.key, row.defaultChords);
                                const current =
                                    capturingKey === row.key && capturePreview
                                        ? keybindChordToLabel(capturePreview)
                                        : resolved.length > 0
                                        ? resolved.map((c) => keybindChordToLabel(c)).join(" / ")
                                        : "Not set";
                                const defaults =
                                    row.defaultChords.length > 0
                                        ? row.defaultChords.map((c) => keybindChordToLabel(c)).join(" / ")
                                        : "None";
                                return (
                                    <div key={row.key} className="flex items-center justify-between gap-3 px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">{row.name}</p>
                                            {!compact ? (
                                                <>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {row.description || row.key}
                                                    </p>
                                                    <p className="truncate text-[11px] text-muted-foreground">
                                                        Default: {defaults}
                                                    </p>
                                                </>
                                            ) : null}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="rounded border bg-muted/40 px-2 py-1 font-mono text-xs">
                                                {current}
                                            </span>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={capturingKey === row.key ? "default" : "outline"}
                                                disabled={!!capturingKey && capturingKey !== row.key}
                                                onClick={() => {
                                                    setCapturePreview(null);
                                                    setCapturePreviewLabel("Waiting...");
                                                    setCapturingKey((prev) => (prev === row.key ? null : row.key));
                                                }}
                                                onContextMenu={(event) => {
                                                    event.preventDefault();
                                                    const pos = getMenuPosition(event.clientX, event.clientY);
                                                    setRowMenu({ key: row.key, x: pos.x, y: pos.y });
                                                }}
                                                title="Left click: change keybind. Right click: reset."
                                            >
                                                {capturingKey === row.key ? "Cancel" : "Change"}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
                {groups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No keybinds match this filter.</p>
                ) : null}
            </div>
            {rowMenu ? (
                <div
                    className="fixed z-[80] min-w-40 rounded-md border bg-popover p-1 shadow-md"
                    style={{ left: rowMenu.x, top: rowMenu.y }}
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <button
                        type="button"
                        className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
                        onClick={() => {
                            setCapturePreview(null);
                            setCapturingKey(rowMenu.key);
                            setRowMenu(null);
                        }}
                    >
                        Change keybind
                    </button>
                    <button
                        type="button"
                        className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
                        onClick={() => {
                            ctx.clearKeybindOverride(rowMenu.key);
                            setRowMenu(null);
                        }}
                    >
                        Reset to default
                    </button>
                </div>
            ) : null}
        </div>
    );
}

export const keybindsSettingsPlugin: MapEditorPlugin = {
    id: "openrune.settings.keybinds",
    manifest: {
        icon: <Keyboard className="size-4" />,
        name: "Keybinds",
        description: "View and manage core/plugin keybinds.",
        author: "OpenRune",
        version: "0.1.0",
        tags: ["settings", "keybinds"],
        internalOnly: true,
        showInHub: false,
    },
    settingsTabs: [
        {
            id: "keybinds",
            title: "Keybinds",
            order: 180,
            render: (ctx) => <KeybindsSettingsTab ctx={ctx} />,
        },
    ],
};
