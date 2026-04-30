import { Sparkles } from "lucide-react";

import type { EditorToolPlugin, MapEditorPalettePanelProps } from "./builtin-plugin-types";

function SmoothEditorToolPanel(_props: MapEditorPalettePanelProps): JSX.Element {
    return (
        <div className="flex h-full min-h-0 items-center justify-center p-3 text-xs text-muted-foreground">
            TODO: implement smooth builtin panel.
        </div>
    );
}

export const smoothEditorTool: EditorToolPlugin = {
    id: "smooth",
    name: "Smooth",
    description: "Smooth tool scaffold for the new plugin system.",
    icon: Sparkles,
    workspaces: [{ panelId: "editor-underlays", activateTab: true }],
    actions: [{ kind: "select-tool", tool: "smooth" }],
    palettePanel: SmoothEditorToolPanel,
    keyBindings: [
        {
            id: "select-tool",
            name: "Select Smooth tool",
            description: "Switch active paint tool to Smooth.",
            defaultChords: [{ code: "Digit4" }],
            action: ({ host }) => {
                host.setEditorTool("smooth");
            },
        },
    ],
};
