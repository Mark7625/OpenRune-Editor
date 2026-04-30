import { Settings } from "lucide-react";

import { Button } from "../../../components/ui/button";
import type { MapEditorPlugin } from "../types";

export const settingsLauncherPlugin: MapEditorPlugin = {
    id: "openrune.settings-launcher",
    manifest: {
        icon: <Settings className="size-4" />,
        name: "Settings Launcher",
        description: "Opens plugin-driven map editor settings.",
        author: "OpenRune",
        version: "0.1.0",
        tags: ["settings", "ui"],
        internalOnly: true,
        showInHub: false,
    },
    toolbarItems: [
        {
            id: "settings-button",
            placement: "titlebar",
            order: 140,
            render: (ctx) => (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 px-2"
                    onClick={() => ctx.setSettingsOpen(true)}
                >
                    <Settings className="size-4" />
                    <span className="hidden sm:inline">Settings</span>
                </Button>
            ),
        },
    ],
};
