import { ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ConfirmationDialog } from "../components/ui/ConfirmationDialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { mouseButtonToChordCode } from "../mapviewer/InputManager";
import {
    getDefaultKeybindChords,
    getRegisteredEditorToolKeybinds,
    keybindChordEquals,
    keybindChordToLabel,
    MOUSE_CHORD_CODES,
} from "./editor-tool-input";
import type { BrushOutlineAppearance, MapEditorGizmoAppearance } from "./map-editor-gizmo-settings";
import { sliderFromThickness, thicknessFromSlider } from "./map-editor-gizmo-settings";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { CORE_VIEWER_KEYBIND_PLUGIN_ID } from "./plugins/builtins/core-viewer-keybinds.builtin";
import type { EditorToolKeyChord, EditorToolKeybindTrigger } from "./plugins/builtins/builtin-plugin-types";
import { cn } from "../util/cn";

function rgbToHex(r: number, g: number, b: number): string {
    const h = (n: number) =>
        Math.max(0, Math.min(255, Math.round(n * 255)))
            .toString(16)
            .padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
    if (!m) {
        return [1, 1, 1];
    }
    return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

function keybindTriggerShortLabel(trigger: EditorToolKeybindTrigger | undefined): string {
    if (trigger === "HELD") {
        return "Hold";
    }
    if (trigger === "TOGGLED") {
        return "Toggle";
    }
    return "Press";
}

type EditorToolKeybindDescriptor = ReturnType<typeof getRegisteredEditorToolKeybinds>[number];

/** Codes treated as “still building” until Enter or a non-modifier is added (single non-modifier commits immediately). */
const CHORD_MODIFIER_CODES = new Set([
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "ShiftLeft",
    "ShiftRight",
    "MetaLeft",
    "MetaRight",
]);

function chordFromSortedCodes(codes: readonly string[]): EditorToolKeyChord | null {
    if (codes.length === 0) {
        return null;
    }
    return codes.length === 1 ? { code: codes[0]! } : { code: [...codes] };
}

/** Auto-save without Enter: single non-modifier key, or modifiers + mouse button(s) only. */
function shouldAutoCommitChord(sorted: readonly string[]): boolean {
    if (sorted.length === 0) {
        return false;
    }
    if (sorted.length === 1) {
        return !CHORD_MODIFIER_CODES.has(sorted[0]!);
    }
    const hasMouse = sorted.some((c) => MOUSE_CHORD_CODES.has(c));
    const hasKeyboardLetter = sorted.some((c) => !CHORD_MODIFIER_CODES.has(c) && !MOUSE_CHORD_CODES.has(c));
    if (hasMouse && !hasKeyboardLetter) {
        return sorted.every((c) => CHORD_MODIFIER_CODES.has(c) || MOUSE_CHORD_CODES.has(c));
    }
    return false;
}

function groupKeybindsByPlugin(rows: EditorToolKeybindDescriptor[]): { pluginId: string; pluginName: string; items: EditorToolKeybindDescriptor[] }[] {
    const order: string[] = [];
    const byId = new Map<string, { pluginId: string; pluginName: string; items: EditorToolKeybindDescriptor[] }>();
    for (const row of rows) {
        let g = byId.get(row.pluginId);
        if (!g) {
            g = { pluginId: row.pluginId, pluginName: row.pluginName, items: [] };
            byId.set(row.pluginId, g);
            order.push(row.pluginId);
        }
        g.items.push(row);
    }
    return order.map((id) => byId.get(id)!);
}

function GizmoColorRow({
    label,
    hint,
    value,
    onChange,
}: {
    label: string;
    hint?: string;
    value: readonly [number, number, number, number];
    onChange: (next: readonly [number, number, number, number]) => void;
}): JSX.Element {
    const hex = rgbToHex(value[0], value[1], value[2]);
    const alphaPct = Math.round(value[3] * 100);

    return (
        <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3">
            <div className="flex flex-col gap-0.5">
                <Label className="text-sm font-medium">{label}</Label>
                {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                    <Input
                        type="color"
                        className="h-9 w-14 cursor-pointer border border-border p-1"
                        value={hex}
                        onChange={(e) => {
                            const [r, g, b] = hexToRgb(e.target.value);
                            onChange([r, g, b, value[3]]);
                        }}
                    />
                    <span className="text-xs text-muted-foreground">RGB</span>
                </div>
                <div className="flex min-w-[10rem] flex-1 items-center gap-2">
                    <Label className="whitespace-nowrap text-xs text-muted-foreground">Opacity</Label>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={alphaPct}
                        className="h-2 flex-1 accent-primary"
                        onChange={(e) => {
                            const a = Number(e.target.value) / 100;
                            onChange([value[0], value[1], value[2], a]);
                        }}
                    />
                    <span className="w-8 tabular-nums text-xs text-muted-foreground">{alphaPct}%</span>
                </div>
            </div>
        </div>
    );
}

export interface MapEditorSettingsModalProps {
    pluginHost: IEditorPluginHost;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function MapEditorSettingsModal({
    pluginHost,
    open,
    onOpenChange,
}: MapEditorSettingsModalProps): JSX.Element {
    const workbenchSnap = useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );

    const [tab, setTab] = useState<"gizmo" | "general" | "controls" | "keybinds">("gizmo");
    const [appearance, setAppearance] = useState<MapEditorGizmoAppearance>(() =>
        pluginHost.getGizmoAppearance(),
    );
    const [captureKey, setCaptureKey] = useState<string | null>(null);
    const [captureHeldCodes, setCaptureHeldCodes] = useState<string[]>([]);
    const captureRowRef = useRef<HTMLDivElement | null>(null);
    const captureBannerRef = useRef<HTMLDivElement | null>(null);
    const keybindCtxMenuRef = useRef<HTMLDivElement | null>(null);
    const [keybindCtxMenu, setKeybindCtxMenu] = useState<{
        clientX: number;
        clientY: number;
        bindingKey: string;
    } | null>(null);
    const [keybindUiMode, setKeybindUiMode] = useState<"compact" | "detailed">("compact");
    const [keybindSearch, setKeybindSearch] = useState("");
    const [resetAllKeybindsConfirmOpen, setResetAllKeybindsConfirmOpen] = useState(false);

    useEffect(() => {
        if (open) {
            setAppearance(pluginHost.getGizmoAppearance());
        }
    }, [open, pluginHost]);

    useEffect(() => {
        pluginHost.setEditorInputSuspended(open);
        return () => {
            pluginHost.setEditorInputSuspended(false);
        };
    }, [open, pluginHost]);

    const patchGizmo = (partial: Partial<MapEditorGizmoAppearance>) => {
        const next = pluginHost.setGizmoAppearance(partial);
        setAppearance(next);
    };

    const patchBrushOutline = (partial: Partial<BrushOutlineAppearance>) => {
        patchGizmo({
            brushOutline: { ...appearance.brushOutline, ...partial },
        });
    };

    const allKeybinds = useMemo(() => getRegisteredEditorToolKeybinds(), [workbenchSnap]);
    const pluginKeybindsOnly = useMemo(
        () => allKeybinds.filter((k) => k.pluginId !== CORE_VIEWER_KEYBIND_PLUGIN_ID),
        [allKeybinds],
    );
    const coreKeybindRows = useMemo(
        () => allKeybinds.filter((k) => k.pluginId === CORE_VIEWER_KEYBIND_PLUGIN_ID),
        [allKeybinds],
    );
    const coreKeybindsByPlugin = useMemo(() => groupKeybindsByPlugin(coreKeybindRows), [coreKeybindRows]);
    const filteredKeybinds = useMemo(() => {
        const q = keybindSearch.trim().toLowerCase();
        if (!q) {
            return pluginKeybindsOnly;
        }
        return pluginKeybindsOnly.filter((kb) => {
            const blob = [kb.pluginName, kb.pluginId, kb.binding.name, kb.binding.description ?? ""]
                .join(" ")
                .toLowerCase();
            return blob.includes(q);
        });
    }, [pluginKeybindsOnly, keybindSearch]);
    const keybindsByPlugin = useMemo(() => groupKeybindsByPlugin(filteredKeybinds), [filteredKeybinds]);

    const viewerControls = useMemo(() => pluginHost.getViewerControlSettings(), [workbenchSnap, pluginHost]);

    useEffect(() => {
        if (tab !== "keybinds") {
            setKeybindSearch("");
        }
    }, [tab]);

    useEffect(() => {
        if (!captureKey) {
            setCaptureHeldCodes([]);
            return;
        }
        const held = new Set<string>();
        setCaptureHeldCodes([]);

        const syncHeld = () =>
            setCaptureHeldCodes([...held].sort((a, b) => a.localeCompare(b)));

        const findConflict = (next: EditorToolKeyChord): string | null => {
            const rows = getRegisteredEditorToolKeybinds();
            for (const kb of rows) {
                if (kb.key === captureKey) {
                    continue;
                }
                const resolved = pluginHost.getResolvedKeybindChords(kb.key, getDefaultKeybindChords(kb.binding));
                for (const chord of resolved) {
                    if (keybindChordEquals(chord, next)) {
                        return `${kb.pluginName}: ${kb.binding.name}`;
                    }
                }
            }
            return null;
        };

        const tryCommit = (next: EditorToolKeyChord) => {
            const conflict = findConflict(next);
            if (conflict) {
                toast.error(`Keybind is already taken by ${conflict}`);
                return;
            }
            pluginHost.setKeybindOverride(captureKey, next);
            setCaptureKey(null);
            toast.success(`Set to ${keybindChordToLabel(next)}`);
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                pluginHost.clearKeybindOverride(captureKey);
                setCaptureKey(null);
                return;
            }
            if (e.key === "Enter" && !e.repeat) {
                e.preventDefault();
                const next = chordFromSortedCodes([...held].sort((a, b) => a.localeCompare(b)));
                if (!next) {
                    toast.error("Hold one or more keys, then press Enter");
                    return;
                }
                tryCommit(next);
                return;
            }
            if (e.repeat) {
                return;
            }
            e.preventDefault();
            held.add(e.code);
            syncHeld();

            const sorted = [...held].sort((a, b) => a.localeCompare(b));
            if (shouldAutoCommitChord(sorted)) {
                const next = chordFromSortedCodes(sorted);
                if (next) {
                    tryCommit(next);
                }
            }
        };

        const onKeyUp = (e: KeyboardEvent) => {
            held.delete(e.code);
            syncHeld();
        };

        const onPointerDown = (e: PointerEvent) => {
            const t = e.target as Node;
            const inSurface =
                captureBannerRef.current?.contains(t) || captureRowRef.current?.contains(t);
            if (inSurface && (e.target as HTMLElement).closest("button")) {
                return;
            }
            if (inSurface) {
                const code = mouseButtonToChordCode(e.button);
                if (code) {
                    e.preventDefault();
                    e.stopPropagation();
                    held.add(code);
                    syncHeld();
                    const sorted = [...held].sort((a, b) => a.localeCompare(b));
                    if (shouldAutoCommitChord(sorted)) {
                        const next = chordFromSortedCodes(sorted);
                        if (next) {
                            tryCommit(next);
                        }
                    }
                }
                return;
            }
            pluginHost.clearKeybindOverride(captureKey);
            setCaptureKey(null);
        };

        const onPointerUp = (e: PointerEvent) => {
            const code = mouseButtonToChordCode(e.button);
            if (code) {
                held.delete(code);
                syncHeld();
            }
        };

        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("pointerup", onPointerUp, true);
        return () => {
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("keyup", onKeyUp, true);
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("pointerup", onPointerUp, true);
        };
    }, [captureKey, pluginHost]);

    useEffect(() => {
        if (!keybindCtxMenu) {
            return;
        }
        const onPointerDown = (e: PointerEvent) => {
            if (keybindCtxMenuRef.current?.contains(e.target as Node)) {
                return;
            }
            setKeybindCtxMenu(null);
        };
        window.addEventListener("pointerdown", onPointerDown, true);
        return () => window.removeEventListener("pointerdown", onPointerDown, true);
    }, [keybindCtxMenu]);

    const thicknessSlider = sliderFromThickness(appearance.brushOutline.outlineThickness);

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    "flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl",
                    (tab === "keybinds" || tab === "controls") && "sm:max-w-2xl",
                )}
            >
                <DialogHeader className="border-b border-border px-6 pb-4 pt-6">
                    <DialogTitle>Map editor settings</DialogTitle>
                    <DialogDescription>
                        Brush outline colors are saved in your browser. General options apply to this session.
                    </DialogDescription>
                </DialogHeader>

                <div role="tablist" className="flex shrink-0 gap-1 border-b border-border px-6 pt-2">
                    <Button
                        type="button"
                        role="tab"
                        aria-selected={tab === "gizmo"}
                        variant={tab === "gizmo" ? "secondary" : "ghost"}
                        size="sm"
                        className="rounded-b-none"
                        onClick={() => setTab("gizmo")}
                    >
                        Gizmo editor
                    </Button>
                    <Button
                        type="button"
                        role="tab"
                        aria-selected={tab === "general"}
                        variant={tab === "general" ? "secondary" : "ghost"}
                        size="sm"
                        className="rounded-b-none"
                        onClick={() => setTab("general")}
                    >
                        General
                    </Button>
                    <Button
                        type="button"
                        role="tab"
                        aria-selected={tab === "controls"}
                        variant={tab === "controls" ? "secondary" : "ghost"}
                        size="sm"
                        className="rounded-b-none"
                        onClick={() => setTab("controls")}
                    >
                        Camera &amp; controls
                    </Button>
                    <Button
                        type="button"
                        role="tab"
                        aria-selected={tab === "keybinds"}
                        variant={tab === "keybinds" ? "secondary" : "ghost"}
                        size="sm"
                        className="rounded-b-none"
                        onClick={() => setTab("keybinds")}
                    >
                        Plugin keybinds
                    </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                    {captureKey ? (
                        <div
                            ref={captureBannerRef}
                            className="mb-3 flex flex-col gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm sm:mb-4 sm:flex-row sm:items-center sm:justify-between"
                            role="status"
                        >
                            <div className="min-w-0 space-y-0.5">
                                <p className="font-medium text-foreground">
                                    Recording…{" "}
                                    <span className="font-normal text-muted-foreground">
                                        Keys, or click this bar / the highlighted row with a mouse button. Enter saves
                                        multi-key combos; Esc or Discard cancels.
                                    </span>
                                </p>
                                <p className="font-mono text-xs text-foreground tabular-nums">
                                    {(() => {
                                        const chord = chordFromSortedCodes(captureHeldCodes);
                                        return chord ? `Live: ${keybindChordToLabel(chord)}` : "Live: …";
                                    })()}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="shrink-0 bg-background"
                                title="Stop recording and keep the keybind you had before you clicked Change (does not reset to plugin defaults)."
                                onClick={() => {
                                    pluginHost.clearKeybindOverride(captureKey);
                                    setCaptureKey(null);
                                }}
                            >
                                Discard
                            </Button>
                        </div>
                    ) : null}
                    {tab === "gizmo" ? (
                        <details open className="group rounded-lg border border-border bg-card">
                            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                                Brush outline
                                <span className="ml-auto text-xs font-normal text-muted-foreground">
                                    Hover / brush tile preview
                                </span>
                            </summary>
                            <div className="space-y-4 border-t border-border px-3 py-4">
                                <GizmoColorRow
                                    label="Fill"
                                    hint="Interior of the highlighted tile region."
                                    value={appearance.brushOutline.fill}
                                    onChange={(v) => patchBrushOutline({ fill: v })}
                                />
                                <GizmoColorRow
                                    label="Outline"
                                    hint="Edge stroke around each highlighted triangle or tile quad."
                                    value={appearance.brushOutline.outline}
                                    onChange={(v) => patchBrushOutline({ outline: v })}
                                />
                                <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3">
                                    <Label className="text-sm font-medium">Outline thickness</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Width of the edge band (shader barycentric edge). Increase if the outline
                                        is hard to see.
                                    </p>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="range"
                                            min={1}
                                            max={100}
                                            value={thicknessSlider}
                                            className="h-2 flex-1 accent-primary"
                                            onChange={(e) => {
                                                const th = thicknessFromSlider(Number(e.target.value));
                                                patchBrushOutline({ outlineThickness: th });
                                            }}
                                        />
                                        <span className="w-10 tabular-nums text-xs text-muted-foreground">
                                            {thicknessSlider}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </details>
                    ) : tab === "general" ? (
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="me-render-dist">Render distance</Label>
                                <Input
                                    id="me-render-dist"
                                    type="number"
                                    defaultValue={pluginHost.renderDistance}
                                    key={`rd-${open}`}
                                    onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        if (!Number.isNaN(v)) {
                                            pluginHost.renderDistance = v;
                                        }
                                    }}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="me-level">Selected level</Label>
                                <Input
                                    id="me-level"
                                    type="number"
                                    defaultValue={pluginHost.selectedLevel}
                                    key={`lv-${open}`}
                                    onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        if (!Number.isNaN(v)) {
                                            pluginHost.selectedLevel = v;
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    ) : tab === "controls" ? (
                        <div className="grid gap-5">
                            <div className="grid gap-3 rounded-lg border border-border bg-card p-3">
                                <p className="text-sm font-medium text-foreground">Pointer</p>
                                <label className="flex cursor-pointer items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        className="size-4 rounded border border-input accent-primary"
                                        checked={viewerControls.mouseCameraEnabled}
                                        onChange={(e) =>
                                            pluginHost.setViewerControlSettings({
                                                mouseCameraEnabled: e.target.checked,
                                            })
                                        }
                                    />
                                    <span>Enable drag to pan (2D ortho) / look (3D)</span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        className="size-4 rounded border border-input accent-primary"
                                        checked={viewerControls.mouseWheelZoomEnabled}
                                        onChange={(e) =>
                                            pluginHost.setViewerControlSettings({
                                                mouseWheelZoomEnabled: e.target.checked,
                                            })
                                        }
                                    />
                                    <span>Enable mouse wheel zoom</span>
                                </label>
                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <Label className="text-xs text-muted-foreground">Mouse look sensitivity</Label>
                                        <span className="tabular-nums text-xs text-muted-foreground">
                                            {viewerControls.mouseLookSensitivity.toFixed(2)}×
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min={10}
                                        max={400}
                                        value={Math.round(viewerControls.mouseLookSensitivity * 100)}
                                        className="h-2 w-full accent-primary"
                                        onChange={(e) =>
                                            pluginHost.setViewerControlSettings({
                                                mouseLookSensitivity: Number(e.target.value) / 100,
                                            })
                                        }
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <Label className="text-xs text-muted-foreground">2D pan sensitivity</Label>
                                        <span className="tabular-nums text-xs text-muted-foreground">
                                            {viewerControls.mousePanSensitivity.toFixed(2)}×
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min={10}
                                        max={400}
                                        value={Math.round(viewerControls.mousePanSensitivity * 100)}
                                        className="h-2 w-full accent-primary"
                                        onChange={(e) =>
                                            pluginHost.setViewerControlSettings({
                                                mousePanSensitivity: Number(e.target.value) / 100,
                                            })
                                        }
                                    />
                                </div>
                            </div>
                            <div className="grid gap-3 rounded-lg border border-border bg-card p-3">
                                <p className="text-sm font-medium text-foreground">Keyboard</p>
                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <Label className="text-xs text-muted-foreground">Move speed (WASD / vertical)</Label>
                                        <span className="tabular-nums text-xs text-muted-foreground">
                                            {viewerControls.keyboardMoveSpeed.toFixed(2)}×
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min={10}
                                        max={400}
                                        value={Math.round(viewerControls.keyboardMoveSpeed * 100)}
                                        className="h-2 w-full accent-primary"
                                        onChange={(e) =>
                                            pluginHost.setViewerControlSettings({
                                                keyboardMoveSpeed: Number(e.target.value) / 100,
                                            })
                                        }
                                    />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <p className="text-sm font-medium text-foreground">Navigation keys</p>
                                <div className="overflow-hidden rounded-md border border-border">
                                    {coreKeybindsByPlugin.map((group) => (
                                        <div key={group.pluginId}>
                                            <div
                                                className="sticky top-0 z-[1] border-b border-border bg-muted/55 px-2 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-sm"
                                                title={group.pluginId}
                                            >
                                                <span className="text-foreground">{group.pluginName}</span>
                                                <span className="ml-1.5 font-mono text-[10px] font-normal tabular-nums">
                                                    {group.pluginId}
                                                </span>
                                            </div>
                                            <ul className="divide-y divide-border">
                                                {group.items.map((kb) => {
                                                    const chords = pluginHost.getResolvedKeybindChords(
                                                        kb.key,
                                                        getDefaultKeybindChords(kb.binding),
                                                    );
                                                    const label = chords.length > 0
                                                        ? chords.map((c) => keybindChordToLabel(c)).join(" · ")
                                                        : keybindChordToLabel(null);
                                                    const capturing = captureKey === kb.key;
                                                    return (
                                                        <li key={kb.key}>
                                                            <div
                                                                ref={capturing ? captureRowRef : undefined}
                                                                className={cn(
                                                                    "flex items-start gap-2 px-2 py-1.5",
                                                                    capturing &&
                                                                        "bg-primary/5 ring-2 ring-inset ring-primary/35",
                                                                )}
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-sm font-medium leading-snug text-foreground">
                                                                        {kb.binding.name}
                                                                    </p>
                                                                    <p className="line-clamp-2 text-xs text-muted-foreground">
                                                                        {kb.binding.description?.trim()
                                                                            ? kb.binding.description
                                                                            : "—"}
                                                                    </p>
                                                                </div>
                                                                <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                                                                    <span
                                                                        className={cn(
                                                                            "max-w-[7rem] truncate rounded border border-border bg-muted/30 px-1.5 py-0.5 text-center font-mono text-[11px] font-medium tabular-nums text-foreground",
                                                                            capturing && "border-primary/50",
                                                                        )}
                                                                        title={capturing ? "Live preview" : label}
                                                                    >
                                                                        {capturing
                                                                            ? (() => {
                                                                                  const c = chordFromSortedCodes(
                                                                                      captureHeldCodes,
                                                                                  );
                                                                                  return c
                                                                                      ? keybindChordToLabel(c)
                                                                                      : "…";
                                                                              })()
                                                                            : label}
                                                                    </span>
                                                                    <Button
                                                                        type="button"
                                                                        variant="secondary"
                                                                        size="sm"
                                                                        className="h-7 shrink-0 px-2 text-xs"
                                                                        disabled={!!captureKey && captureKey !== kb.key}
                                                                        onClick={() => setCaptureKey(kb.key)}
                                                                        onContextMenu={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            if (capturing) {
                                                                                return;
                                                                            }
                                                                            if (captureKey && captureKey !== kb.key) {
                                                                                return;
                                                                            }
                                                                            setKeybindCtxMenu({
                                                                                clientX: e.clientX,
                                                                                clientY: e.clientY,
                                                                                bindingKey: kb.key,
                                                                            });
                                                                        }}
                                                                        title="Left-click: record. Right-click: reset to default."
                                                                    >
                                                                        {capturing ? "…" : "Change"}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {pluginKeybindsOnly.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No plugin keybinds registered.</p>
                            ) : (
                                <>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                                        <div className="relative min-w-0 flex-1">
                                            <Search
                                                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                                aria-hidden
                                            />
                                            <Input
                                                id="me-keybind-search"
                                                type="search"
                                                value={keybindSearch}
                                                onChange={(e) => setKeybindSearch(e.target.value)}
                                                placeholder="Search by name, plugin, or description…"
                                                className="h-9 pl-9"
                                                autoComplete="off"
                                            />
                                        </div>
                                        <div
                                            className="flex shrink-0 rounded-md border border-border bg-muted/30 p-0.5"
                                            role="group"
                                            aria-label="Keybind list layout"
                                        >
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={keybindUiMode === "compact" ? "secondary" : "ghost"}
                                                className="h-8 px-3"
                                                onClick={() => setKeybindUiMode("compact")}
                                            >
                                                Compact
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={keybindUiMode === "detailed" ? "secondary" : "ghost"}
                                                className="h-8 px-3"
                                                onClick={() => setKeybindUiMode("detailed")}
                                            >
                                                Detailed
                                            </Button>
                                        </div>
                                    </div>

                                    {keybindUiMode === "detailed" ? (
                                        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                                            <p className="font-medium text-foreground">How keybinds work</p>
                                            <ul className="mt-1 list-inside list-disc space-y-0.5">
                                                <li>
                                                    <span className="text-foreground">Change</span> — record keys or mouse
                                                    buttons (LMB / MMB / RMB). Click the recording bar or highlighted row
                                                    with the desired button; hold modifiers for Ctrl+click-style chords.{" "}
                                                    <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">
                                                        Enter
                                                    </kbd>{" "}
                                                    saves multi-key combos without a mouse button.
                                                </li>
                                                <li>
                                                    <span className="text-foreground">Right-click Change</span> — reset
                                                    that row to the plugin default.
                                                </li>
                                                <li>
                                                    While recording:{" "}
                                                    <span className="text-foreground">Discard</span>,{" "}
                                                    <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">
                                                        Esc
                                                    </kbd>
                                                    , or click outside the recording area — stops without saving and
                                                    keeps your previous binding (not a full reset to plugin defaults).
                                                </li>
                                            </ul>
                                        </div>
                                    ) : null}

                                    {filteredKeybinds.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                            No keybinds match “{keybindSearch.trim()}”.
                                        </p>
                                    ) : keybindUiMode === "compact" ? (
                                        <div className="overflow-hidden rounded-md border border-border">
                                            <ul className="divide-y divide-border">
                                                {keybindsByPlugin.flatMap((g) =>
                                                    g.items.map((kb) => {
                                                        const chords = pluginHost.getResolvedKeybindChords(
                                                            kb.key,
                                                            getDefaultKeybindChords(kb.binding),
                                                        );
                                                        const label = chords.length > 0
                                                            ? chords.map((c) => keybindChordToLabel(c)).join(" · ")
                                                            : keybindChordToLabel(null);
                                                        const capturing = captureKey === kb.key;
                                                        return (
                                                            <li key={kb.key}>
                                                                <div
                                                                    ref={capturing ? captureRowRef : undefined}
                                                                    className={cn(
                                                                        "flex items-start gap-2 px-2 py-1.5",
                                                                        capturing &&
                                                                            "bg-primary/5 ring-2 ring-inset ring-primary/35",
                                                                    )}
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="text-sm font-medium leading-snug text-foreground">
                                                                            {kb.binding.name}
                                                                        </p>
                                                                        <p className="line-clamp-2 text-xs text-muted-foreground">
                                                                            {kb.binding.description?.trim()
                                                                                ? kb.binding.description
                                                                                : "—"}
                                                                        </p>
                                                                    </div>
                                                                    <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                                                                        <span
                                                                            className={cn(
                                                                                "max-w-[7rem] truncate rounded border border-border bg-muted/30 px-1.5 py-0.5 text-center font-mono text-[11px] font-medium tabular-nums text-foreground",
                                                                                capturing && "border-primary/50",
                                                                            )}
                                                                            title={capturing ? "Live preview" : label}
                                                                        >
                                                                            {capturing
                                                                                ? (() => {
                                                                                      const c = chordFromSortedCodes(
                                                                                          captureHeldCodes,
                                                                                      );
                                                                                      return c
                                                                                          ? keybindChordToLabel(c)
                                                                                          : "…";
                                                                                  })()
                                                                                : label}
                                                                        </span>
                                                                        <Button
                                                                            type="button"
                                                                            variant="secondary"
                                                                            size="sm"
                                                                            className="h-7 shrink-0 px-2 text-xs"
                                                                            disabled={
                                                                                !!captureKey && captureKey !== kb.key
                                                                            }
                                                                            onClick={() => setCaptureKey(kb.key)}
                                                                            onContextMenu={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                if (capturing) {
                                                                                    return;
                                                                                }
                                                                                if (
                                                                                    captureKey &&
                                                                                    captureKey !== kb.key
                                                                                ) {
                                                                                    return;
                                                                                }
                                                                                setKeybindCtxMenu({
                                                                                    clientX: e.clientX,
                                                                                    clientY: e.clientY,
                                                                                    bindingKey: kb.key,
                                                                                });
                                                                            }}
                                                                            title="Left-click: record. Right-click: reset to plugin default."
                                                                        >
                                                                            {capturing ? "…" : "Change"}
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </li>
                                                        );
                                                    }),
                                                )}
                                            </ul>
                                        </div>
                                    ) : (
                                        <div className="grid gap-3">
                                            {keybindsByPlugin.map((group) => (
                                                <div
                                                    key={group.pluginId}
                                                    className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                                                >
                                                    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
                                                        <span className="text-sm font-semibold text-foreground">
                                                            {group.pluginName}
                                                        </span>
                                                        <Badge
                                                            variant="secondary"
                                                            className="font-mono text-[10px] font-normal tabular-nums"
                                                        >
                                                            {group.pluginId}
                                                        </Badge>
                                                        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                                                            {group.items.length} bind
                                                            {group.items.length === 1 ? "" : "s"}
                                                        </span>
                                                    </div>
                                                    <ul className="divide-y divide-border">
                                                        {group.items.map((kb) => {
                                                            const chords = pluginHost.getResolvedKeybindChords(
                                                                kb.key,
                                                                getDefaultKeybindChords(kb.binding),
                                                            );
                                                            const label = chords.length > 0
                                                                ? chords.map((c) => keybindChordToLabel(c)).join(" · ")
                                                                : keybindChordToLabel(null);
                                                            const capturing = captureKey === kb.key;
                                                            const trigger = keybindTriggerShortLabel(kb.binding.trigger);
                                                            return (
                                                                <li key={kb.key}>
                                                                    <div
                                                                        ref={capturing ? captureRowRef : undefined}
                                                                        className={cn(
                                                                            "flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                                                                            capturing &&
                                                                                "bg-primary/5 ring-2 ring-inset ring-primary/35",
                                                                        )}
                                                                    >
                                                                        <div className="min-w-0 flex-1">
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                <p className="text-sm font-medium text-foreground">
                                                                                    {kb.binding.name}
                                                                                </p>
                                                                                <Badge
                                                                                    variant="outline"
                                                                                    className="h-5 px-1.5 text-[10px] font-normal"
                                                                                >
                                                                                    {trigger}
                                                                                </Badge>
                                                                            </div>
                                                                            {kb.binding.description ? (
                                                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                                                    {kb.binding.description}
                                                                                </p>
                                                                            ) : null}
                                                                        </div>
                                                                        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                                                                            <span
                                                                                className={cn(
                                                                                    "min-w-[6.5rem] rounded-md border border-border bg-muted/40 px-2 py-1 text-center font-mono text-xs font-medium tabular-nums",
                                                                                    capturing && "border-primary/50",
                                                                                )}
                                                                                title="Current binding"
                                                                            >
                                                                                {capturing
                                                                                    ? (() => {
                                                                                          const c =
                                                                                              chordFromSortedCodes(
                                                                                                  captureHeldCodes,
                                                                                              );
                                                                                          return c
                                                                                              ? keybindChordToLabel(c)
                                                                                              : "…";
                                                                                      })()
                                                                                    : label}
                                                                            </span>
                                                                            <Button
                                                                                type="button"
                                                                                variant="secondary"
                                                                                size="sm"
                                                                                className="h-8"
                                                                                disabled={
                                                                                    !!captureKey && captureKey !== kb.key
                                                                                }
                                                                                onClick={() => setCaptureKey(kb.key)}
                                                                                onContextMenu={(e) => {
                                                                                    e.preventDefault();
                                                                                    e.stopPropagation();
                                                                                    if (capturing) {
                                                                                        return;
                                                                                    }
                                                                                    if (
                                                                                        captureKey &&
                                                                                        captureKey !== kb.key
                                                                                    ) {
                                                                                        return;
                                                                                    }
                                                                                    setKeybindCtxMenu({
                                                                                        clientX: e.clientX,
                                                                                        clientY: e.clientY,
                                                                                        bindingKey: kb.key,
                                                                                    });
                                                                                }}
                                                                                title="Left-click to record. Right-click: reset to plugin default."
                                                                            >
                                                                                {capturing ? "Listening" : "Change"}
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter
                    className={cn(
                        "flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row",
                        tab === "keybinds" || tab === "controls" ? "sm:justify-between" : "sm:justify-end",
                    )}
                >
                    {tab === "keybinds" || tab === "controls" ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setResetAllKeybindsConfirmOpen(true)}
                        >
                            Reset all keybinds…
                        </Button>
                    ) : null}
                    <Button type="button" onClick={() => onOpenChange(false)}>
                        Done
                    </Button>
                </DialogFooter>
            </DialogContent>
            {keybindCtxMenu
                ? createPortal(
                      <div
                          ref={keybindCtxMenuRef}
                          className="fixed z-[300] min-w-[12rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                          style={{
                              left: Math.min(
                                  keybindCtxMenu.clientX,
                                  typeof window !== "undefined"
                                      ? window.innerWidth - 200
                                      : keybindCtxMenu.clientX,
                              ),
                              top: Math.min(
                                  keybindCtxMenu.clientY,
                                  typeof window !== "undefined"
                                      ? window.innerHeight - 88
                                      : keybindCtxMenu.clientY,
                              ),
                          }}
                          role="menu"
                          onContextMenu={(e) => e.preventDefault()}
                          onPointerDownCapture={(e) => e.stopPropagation()}
                      >
                          <button
                              type="button"
                              role="menuitem"
                              className="flex w-full cursor-default select-none rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                              onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const bindingKey = keybindCtxMenu.bindingKey;
                                  const changed = pluginHost.clearKeybindOverride(bindingKey);
                                  setCaptureKey((cur) => (cur === bindingKey ? null : cur));
                                  setKeybindCtxMenu(null);
                                  if (changed) {
                                      toast.success("Reset to plugin default");
                                  } else {
                                      toast.message("Already using plugin default.");
                                  }
                              }}
                          >
                              Reset to default
                          </button>
                      </div>,
                      document.body,
                  )
                : null}
        </Dialog>

            <ConfirmationDialog
                open={resetAllKeybindsConfirmOpen}
                title="Reset all keybinds?"
                description="This removes every saved remap and returns all actions to each plugin’s default keys. This cannot be undone from here (you can re-record keys afterward)."
                confirmLabel="Reset all"
                cancelLabel="Keep current"
                destructive
                onConfirm={() => {
                    setResetAllKeybindsConfirmOpen(false);
                    const didReset = pluginHost.clearAllKeybindOverrides();
                    setCaptureKey(null);
                    setKeybindCtxMenu(null);
                    if (didReset) {
                        toast.success("All keybinds reset to defaults");
                    } else {
                        toast.message("No saved keybind changes to reset.");
                    }
                }}
                onCancel={() => setResetAllKeybindsConfirmOpen(false)}
            />
        </>
    );
}
