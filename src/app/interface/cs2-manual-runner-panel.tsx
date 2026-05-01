"use client";

import * as React from "react";
import { Minus, Plus, Trash2, Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ComponentType, InterfaceEntry } from "@/lib/interface-renderer/component-types";
import { ScriptEvent } from "@/lib/interface-renderer/cs2/script-event";
import { runScript } from "@/lib/interface-renderer/cs2/run-script";
import { getCs2RuntimeContext } from "@/lib/interface-renderer/cs2/runtime-context";
import { makeCs2LogLine, type Cs2LogLevel, type Cs2LogLine } from "@/lib/interface-renderer/cs2/cs2-console-sink";
import { cn } from "@/lib/utils";

function firstWidgetForInterface(entry: InterfaceEntry | null, interfaceRootId: number): ComponentType | null {
  if (!entry?.components) return null;
  const iface = interfaceRootId & 0xffff;
  const comps = Object.values(entry.components).sort((a, b) => a.id - b.id);
  for (const c of comps) {
    if (typeof c.packedId === "number" && ((c.packedId >>> 16) & 0xffff) !== iface) continue;
    return c;
  }
  return comps[0] ?? null;
}

function parseArgCell(raw: string): string | number | boolean {
  const t = raw.trim();
  if (t === "") return "";
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return Number.parseInt(t, 10);
  if (/^-?\d*\.\d+(?:[eE][+-]?\d+)?$/.test(t) || /^-?\d+[eE][+-]?\d+$/.test(t)) {
    const n = Number.parseFloat(t);
    return Number.isFinite(n) ? n : t;
  }
  return t;
}

function buildArgsFromRows(rows: string[]): unknown[] {
  const trimmed = rows.map((r) => r.trimEnd());
  while (trimmed.length > 0 && trimmed[trimmed.length - 1]!.trim() === "") {
    trimmed.pop();
  }
  return trimmed.map((cell) => parseArgCell(cell));
}

function levelBadgeClass(level: Cs2LogLevel): string {
  switch (level) {
    case "error":
      return "bg-red-500/15 text-red-300 ring-red-500/30";
    case "warn":
      return "bg-amber-500/15 text-amber-200 ring-amber-500/25";
    case "success":
      return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/25";
    case "load":
      return "bg-sky-500/15 text-sky-200 ring-sky-500/25";
    default:
      return "bg-zinc-500/15 text-zinc-300 ring-zinc-500/25";
  }
}

export type Cs2ManualRunnerPanelProps = {
  interfaceData: InterfaceEntry | null;
  interfaceRootId: number | null;
  /** Increment in parent to force canvas redraw after a script mutates widgets. */
  onAfterRun?: () => void;
  logLines: Cs2LogLine[];
  appendLogLine: (line: Cs2LogLine) => void;
  onClearLog: () => void;
};

export function Cs2ManualRunnerPanel({
  interfaceData,
  interfaceRootId,
  onAfterRun,
  logLines,
  appendLogLine,
  onClearLog,
}: Cs2ManualRunnerPanelProps): JSX.Element {
  const [scriptIdText, setScriptIdText] = React.useState("");
  const [argRows, setArgRows] = React.useState<string[]>([]);
  const [running, setRunning] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logLines]);

  const disabled = interfaceRootId == null || !interfaceData || running;

  const pushSend = React.useCallback(
    (level: Cs2LogLevel, body: string) => {
      appendLogLine(makeCs2LogLine(level, body));
    },
    [appendLogLine],
  );

  const handleSend = React.useCallback(async () => {
    if (interfaceRootId == null || !interfaceData) return;
    const sid = Number.parseInt(scriptIdText.trim(), 10);
    if (!Number.isFinite(sid) || sid < 0) {
      pushSend("warn", "[send] Invalid script id (need non-negative integer).");
      return;
    }

    const extra = buildArgsFromRows(argRows);
    const { clientScriptIndex } = getCs2RuntimeContext();
    if (!clientScriptIndex) {
      pushSend("warn", "[send] No client script index in runtime (DAT2 index 12).");
      return;
    }

    setRunning(true);
    pushSend("info", `[send] Running script ${sid} with ${extra.length} extra arg(s)…`);

    const ev = new ScriptEvent();
    ev.args = [sid, ...extra];
    ev.widget = firstWidgetForInterface(interfaceData, interfaceRootId);

    try {
      await runScript(ev, 5000000, 0);
      pushSend("success", `[send] Finished script ${sid}.`);
      onAfterRun?.();
    } catch (e) {
      pushSend("error", `[send] Script ${sid} threw: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  }, [argRows, interfaceData, interfaceRootId, onAfterRun, pushSend, scriptIdText]);

  const handleCopyAll = React.useCallback(() => {
    const text = logLines.map((l) => `[${l.at}] [${l.level}] ${l.body}`).join("\n");
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [logLines]);

  return (
    <div className="space-y-3 border-t border-border px-2 pb-3 pt-3 text-[11px] leading-snug">
      <div className="font-semibold text-foreground">Manual CS2</div>
      <div className="space-y-1.5">
        <Label htmlFor="cs2-manual-script-id">Script id</Label>
        <Input
          id="cs2-manual-script-id"
          className="h-8 font-mono text-xs"
          placeholder="e.g. 902"
          value={scriptIdText}
          disabled={disabled}
          onChange={(e) => setScriptIdText(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label>Script args (one field per value, after script id)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[10px]"
            disabled={disabled}
            onClick={() => setArgRows((r) => [...r, ""])}
            title="Add argument"
          >
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>
        {argRows.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/80 bg-muted/20 px-2 py-2 text-[10px] text-muted-foreground">
            No extra arguments. Click <span className="font-mono">Add</span> to append values after the script id.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {argRows.map((row, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className="w-5 shrink-0 text-right font-mono text-[10px] text-muted-foreground">{i + 1}</span>
                <Input
                  className="h-8 min-w-0 flex-1 font-mono text-xs"
                  placeholder={`Arg ${i + 1}`}
                  value={row}
                  disabled={disabled}
                  onChange={(e) => {
                    const v = e.target.value;
                    setArgRows((prev) => prev.map((p, j) => (j === i ? v : p)));
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={disabled}
                  title="Remove this argument"
                  onClick={() => setArgRows((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Minus className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button
        type="button"
        size="sm"
        className="h-8 w-full text-[11px]"
        disabled={disabled}
        onClick={() => void handleSend()}
      >
        {running ? "Running…" : "Send"}
      </Button>

      <div className="flex min-h-[220px] max-h-[min(50vh,320px)] flex-col overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 shadow-inner">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/80 px-2 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">CS2 console</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              disabled={logLines.length === 0}
              onClick={() => void handleCopyAll()}
            >
              {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              disabled={logLines.length === 0}
              onClick={onClearLog}
            >
              <Trash2 className="size-3.5" />
              Clear
            </Button>
          </div>
        </div>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto px-2 py-2 font-mono text-[10px] leading-relaxed text-zinc-200"
          role="log"
          aria-live="polite"
        >
          {logLines.length === 0 ? (
            <span className="text-zinc-500">No messages yet. On-load diagnostics and script runs appear here.</span>
          ) : (
            logLines.map((line) => (
              <div key={line.id} className="flex gap-2 border-b border-zinc-800/60 py-1 last:border-b-0">
                <span className="shrink-0 text-zinc-500">{line.at}</span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1 py-0 text-[9px] font-medium uppercase ring-1 ring-inset",
                    levelBadgeClass(line.level),
                  )}
                >
                  {line.level}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-zinc-100">{line.body}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
