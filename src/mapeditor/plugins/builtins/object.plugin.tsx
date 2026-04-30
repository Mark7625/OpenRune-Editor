import type { EditorToolPlugin } from "./builtin-plugin-types";
import { Boxes } from "lucide-react";

export const objectEditorTool: EditorToolPlugin = {
    id: "object",
    name: "Object Select",
    description: "Inspect objects on hovered tile.",
    icon: Boxes,
    actions: [{ kind: "select-tool", tool: "object" }],
    keyBindings: [
        {
            id: "select-tool",
            name: "Select Object tool",
            defaultChords: [{ code: "Digit4" }],
            action: ({ host }) => {
                host.setEditorTool("object");
            },
        },
    ],
};
