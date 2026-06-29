import { cn } from "../util/cn";

/** Compact floating strip (paint tools undocked). */
export const mapEditorStripChromeClass =
    "rounded-md border border-border/80 bg-card/95 shadow-lg backdrop-blur-sm";

/** Larger docked / floating panels (palettes, workspaces). */
export const mapEditorPanelChromeClass =
    "rounded-lg border border-border/80 bg-card/95 shadow-xl backdrop-blur-sm";

export function mapEditorStripChrome(...extra: Array<string | false | null | undefined>): string {
    return cn(mapEditorStripChromeClass, "p-0.5", ...extra);
}

export function mapEditorDockPanelShellClassName(
    ...extra: Array<string | false | null | undefined>
): string {
    return cn(mapEditorPanelChromeClass, "flex min-h-0 flex-1 flex-col overflow-hidden", ...extra);
}

export function mapEditorDockPanelFrameClassName(
    ...extra: Array<string | false | null | undefined>
): string {
    return cn("flex h-full min-h-0 flex-col bg-background/40 p-2", ...extra);
}
