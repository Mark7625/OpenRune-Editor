import { useEffect, useState } from "react";
import type { DockviewApi } from "dockview";

import { activateBuiltinEditorToolWorkspaces } from "./plugins/builtins/current-plugin-runtime.builtin";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import "./MapEditorContainer.css";
import { MapEditorTitleBar } from "./MapEditorTitleBar";
import { MapEditorToolsDock } from "./MapEditorToolsDock";

export interface MapEditorContainerProps {
    pluginHost: IEditorPluginHost;
}

export function MapEditorContainer({ pluginHost }: MapEditorContainerProps): JSX.Element {
    const [dockApi, setDockApi] = useState<DockviewApi | null>(null);

    useEffect(() => {
        if (!dockApi) {
            return;
        }
        activateBuiltinEditorToolWorkspaces(dockApi, pluginHost, pluginHost.getEditorTool());
    }, [dockApi, pluginHost]);

    useEffect(() => {
        return pluginHost.subscribeEditorTool(() => {
            activateBuiltinEditorToolWorkspaces(dockApi, pluginHost, pluginHost.getEditorTool());
        });
    }, [pluginHost, dockApi]);

    return (
        <div className="map-editor-container">
            <MapEditorTitleBar pluginHost={pluginHost} dockApi={dockApi} />
            <div className="map-editor-workbench-body">
                <MapEditorToolsDock pluginHost={pluginHost} onDockReady={setDockApi} />
            </div>
        </div>
    );
}
