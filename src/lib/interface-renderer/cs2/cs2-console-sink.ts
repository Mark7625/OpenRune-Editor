export type Cs2LogLevel = "info" | "warn" | "error" | "success" | "load";

export type Cs2LogLine = {
  id: number;
  at: string;
  level: Cs2LogLevel;
  body: string;
};

let nextLineId = 1;

function timeStamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export function makeCs2LogLine(level: Cs2LogLevel, body: string): Cs2LogLine {
  return { id: nextLineId++, at: timeStamp(), level, body };
}

type Cs2LogSink = (line: Cs2LogLine) => void;

let sink: Cs2LogSink | null = null;

/** Register UI sink (e.g. interface viewer console). Only one active sink. */
export function setCs2ConsoleSink(next: Cs2LogSink | null): void {
  sink = next;
}

/** Emit from CS2 runtime (e.g. unhandled opcodes) into the registered UI console. */
export function emitCs2RuntimeLog(level: Cs2LogLevel, body: string): void {
  const line = makeCs2LogLine(level, body);
  sink?.(line);
}
