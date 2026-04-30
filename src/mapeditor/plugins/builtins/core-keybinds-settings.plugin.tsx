import { useEffect, useMemo, useState } from "react";
import { Keyboard } from "lucide-react";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { keybindChordToLabel } from "../../editor-tool-input";
import { CORE_VIEWER_KEYBIND_PLUGIN_ID } from "./core-viewer-keybinds.builtin";
import type { EditorToolKeyChord } from "./builtin-plugin-types";
import type { MapEditorPlugin, PluginContext } from "../types";

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

function CoreKeybindsSettingsTab({ ctx }: { ctx: PluginContext }): JSX.Element {
    const [search, setSearch] = useState("");
    const [capturingKey, setCapturingKey] = useState<string | null>(null);
    const [capturePreview, setCapturePreview] = useState<EditorToolKeyChord | null>(null);
    const [capturePreviewLabel, setCapturePreviewLabel] = useState("Waiting...");
    const [rowMenu, setRowMenu] = useState<{ key: string; x: number; y: number } | null>(null);
    const viewer = ctx.pluginHost.getViewerControlSettings();
    const q = search.trim().toLowerCase();

    const rows = useMemo(
        () =>
            ctx.keybindings.filter((row) => {
                if (row.pluginId !== CORE_VIEWER_KEYBIND_PLUGIN_ID) {
                    return false;
                }
                if (!q) {
                    return true;
                }
                const blob = [row.name, row.description ?? "", row.key].join(" ").toLowerCase();
                return blob.includes(q);
            }),
        [ctx.keybindings, q],
    );

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
        <div className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex items-center gap-1.5">
                {capturingKey ? (
                    <div className="flex-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-foreground">
                        Recording Keybind.. [{capturePreview ? keybindChordToLabel(capturePreview) : capturePreviewLabel}]
                    </div>
                ) : (
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search core keybinds..."
                        className="h-7 text-xs"
                    />
                )}
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                        const ok = window.confirm("Reset all core keybind overrides to defaults?");
                        if (!ok) {
                            return;
                        }
                        for (const row of ctx.keybindings) {
                            if (row.pluginId === CORE_VIEWER_KEYBIND_PLUGIN_ID) {
                                ctx.clearKeybindOverride(row.key);
                            }
                        }
                    }}
                >
                    Reset all keybinds
                </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
                <div className="rounded-md border p-2">
                    <p className="mb-1 text-xs font-semibold">Core Controls</p>
                    <div className="grid gap-1.5">
                        <label className="flex cursor-pointer items-start justify-between gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
                            <div>
                                <p className="text-xs font-medium">Mouse drag look/pan</p>
                            </div>
                            <input
                                type="checkbox"
                                className="mt-0.5 size-4 rounded border border-input accent-primary"
                                checked={viewer.mouseCameraEnabled}
                                onChange={(e) =>
                                    ctx.pluginHost.setViewerControlSettings({
                                        mouseCameraEnabled: e.target.checked,
                                    })
                                }
                            />
                        </label>
                        <label className="flex cursor-pointer items-start justify-between gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
                            <div>
                                <p className="text-xs font-medium">Mouse wheel zoom</p>
                            </div>
                            <input
                                type="checkbox"
                                className="mt-0.5 size-4 rounded border border-input accent-primary"
                                checked={viewer.mouseWheelZoomEnabled}
                                onChange={(e) =>
                                    ctx.pluginHost.setViewerControlSettings({
                                        mouseWheelZoomEnabled: e.target.checked,
                                    })
                                }
                            />
                        </label>
                    </div>
                    <div className="mt-2 grid gap-1.5">
                        <div className="grid gap-1">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] text-muted-foreground">Zoom sensitivity</p>
                                <span className="tabular-nums text-[11px] text-muted-foreground">
                                    {viewer.mouseWheelZoomSensitivity.toFixed(2)}x
                                </span>
                            </div>
                            <input
                                type="range"
                                min={10}
                                max={400}
                                value={Math.round(viewer.mouseWheelZoomSensitivity * 100)}
                                className="h-2 w-full accent-primary"
                                onChange={(e) =>
                                    ctx.pluginHost.setViewerControlSettings({
                                        mouseWheelZoomSensitivity: Number(e.target.value) / 100,
                                    })
                                }
                            />
                        </div>
                        <div className="grid gap-1">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] text-muted-foreground">Mouse look sensitivity</p>
                                <span className="tabular-nums text-[11px] text-muted-foreground">
                                    {viewer.mouseLookSensitivity.toFixed(2)}x
                                </span>
                            </div>
                            <input
                                type="range"
                                min={10}
                                max={400}
                                value={Math.round(viewer.mouseLookSensitivity * 100)}
                                className="h-2 w-full accent-primary"
                                onChange={(e) =>
                                    ctx.pluginHost.setViewerControlSettings({
                                        mouseLookSensitivity: Number(e.target.value) / 100,
                                    })
                                }
                            />
                        </div>
                        <div className="grid gap-1">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] text-muted-foreground">2D pan sensitivity</p>
                                <span className="tabular-nums text-[11px] text-muted-foreground">
                                    {viewer.mousePanSensitivity.toFixed(2)}x
                                </span>
                            </div>
                            <input
                                type="range"
                                min={10}
                                max={400}
                                value={Math.round(viewer.mousePanSensitivity * 100)}
                                className="h-2 w-full accent-primary"
                                onChange={(e) =>
                                    ctx.pluginHost.setViewerControlSettings({
                                        mousePanSensitivity: Number(e.target.value) / 100,
                                    })
                                }
                            />
                        </div>
                        <div className="grid gap-1">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] text-muted-foreground">Keyboard move speed</p>
                                <span className="tabular-nums text-[11px] text-muted-foreground">
                                    {viewer.keyboardMoveSpeed.toFixed(2)}x
                                </span>
                            </div>
                            <input
                                type="range"
                                min={10}
                                max={400}
                                value={Math.round(viewer.keyboardMoveSpeed * 100)}
                                className="h-2 w-full accent-primary"
                                onChange={(e) =>
                                    ctx.pluginHost.setViewerControlSettings({
                                        keyboardMoveSpeed: Number(e.target.value) / 100,
                                    })
                                }
                            />
                        </div>
                    </div>
                </div>
                <div className="rounded-md border">
                    {rows.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">No core keybinds match this filter.</p>
                    ) : (
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
                                <div key={row.key} className="flex items-center justify-between gap-2 px-2 py-1.5">
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-medium">{row.name}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px]">
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
                    )}
                </div>
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

export const coreKeybindsSettingsPlugin: MapEditorPlugin = {
    id: "openrune.settings.core-keybinds",
    manifest: {
        icon: <Keyboard className="size-4" />,
        name: "Core Keybinds",
        description: "View and manage core camera/navigation keybinds.",
        author: "OpenRune",
        version: "0.1.0",
        tags: ["settings", "keybinds", "core"],
        internalOnly: true,
        showInHub: false,
    },
    settingsTabs: [
        {
            id: "core-keybinds",
            title: "Core Keybinds",
            order: 170,
            render: (ctx) => <CoreKeybindsSettingsTab ctx={ctx} />,
        },
    ],
};
