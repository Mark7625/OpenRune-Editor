import { MonitorCog } from "lucide-react";
import { useEffect, useState } from "react";

import { Label } from "../../../components/ui/label";
import type { MapEditorPlugin } from "../types";

function GraphicsSettingsTab({ pluginHost }: { pluginHost: import("../types").PluginContext["pluginHost"] }): JSX.Element {
    const [renderDistance, setRenderDistance] = useState(pluginHost.renderDistance);
    const [unloadDistance, setUnloadDistance] = useState(pluginHost.unloadDistance);
    const [lodDistance, setLodDistance] = useState(pluginHost.lodDistance);
    const [fpsLimit, setFpsLimit] = useState(pluginHost.renderer.fpsLimit);

    useEffect(() => {
        setRenderDistance(pluginHost.renderDistance);
        setUnloadDistance(pluginHost.unloadDistance);
        setLodDistance(pluginHost.lodDistance);
        setFpsLimit(pluginHost.renderer.fpsLimit);
    }, [pluginHost]);

    return (
        <div className="grid gap-4 rounded-md border p-3">
            <div className="grid gap-1">
                <Label className="text-xs">Render Distance ({renderDistance})</Label>
                <input
                    type="range"
                    min={16}
                    max={2000}
                    step={16}
                    value={renderDistance}
                    className="h-2 w-full accent-primary"
                    onChange={(event) => {
                        const value = Number(event.target.value);
                        setRenderDistance(value);
                        pluginHost.renderDistance = value;
                    }}
                />
            </div>
            <div className="grid gap-1">
                <Label className="text-xs">Unload Distance ({unloadDistance})</Label>
                <input
                    type="range"
                    min={1}
                    max={30}
                    step={1}
                    value={unloadDistance}
                    className="h-2 w-full accent-primary"
                    onChange={(event) => {
                        const value = Number(event.target.value);
                        setUnloadDistance(value);
                        pluginHost.unloadDistance = value;
                    }}
                />
            </div>
            <div className="grid gap-1">
                <Label className="text-xs">LOD Distance ({lodDistance})</Label>
                <input
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    value={lodDistance}
                    className="h-2 w-full accent-primary"
                    onChange={(event) => {
                        const value = Number(event.target.value);
                        setLodDistance(value);
                        pluginHost.lodDistance = value;
                    }}
                />
            </div>
            <div className="grid gap-1">
                <Label className="text-xs">Max FPS ({fpsLimit})</Label>
                <input
                    type="range"
                    min={15}
                    max={240}
                    step={1}
                    value={fpsLimit}
                    className="h-2 w-full accent-primary"
                    onChange={(event) => {
                        const value = Number(event.target.value);
                        setFpsLimit(value);
                        pluginHost.renderer.fpsLimit = value;
                    }}
                />
            </div>
        </div>
    );
}

export const graphicsSettingsPlugin: MapEditorPlugin = {
    id: "openrune.graphics-settings",
    manifest: {
        icon: <MonitorCog className="size-4" />,
        name: "Graphics Settings",
        description: "Editor graphics tuning controls.",
        author: "OpenRune",
        version: "0.1.0",
        tags: ["settings", "graphics"],
        internalOnly: true,
        showInHub: false,
    },
    settingsTabs: [
        {
            id: "graphics",
            title: "Graphics",
            order: 10,
            render: (ctx) => <GraphicsSettingsTab pluginHost={ctx.pluginHost} />,
        },
    ],
};
