import { cn } from "../util/cn";
import { MapEditorBrushWorkspacePanel } from "./MapEditorBrushWorkspacePanel";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";

export interface MapEditorBottomBarStripProps {
    pluginHost: IEditorPluginHost;
    className?: string;
}

/** Docked horizontal brush bar below the map view. */
export function MapEditorBottomBarStrip({ pluginHost, className }: MapEditorBottomBarStripProps): JSX.Element {
    return (
        <div className={cn("flex min-w-0 flex-1 flex-row items-center overflow-hidden", className)}>
            <MapEditorBrushWorkspacePanel pluginHost={pluginHost} variant="bar" />
        </div>
    );
}
