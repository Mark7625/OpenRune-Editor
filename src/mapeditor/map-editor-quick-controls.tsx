import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { getEditorBottomBarModel } from "./plugins/builtins/editor-bottom-bar-model";
import {
    ObjectsVisibleNavButton,
    TerrainSmoothingNavButton,
} from "./plugins/builtins/editor-view-nav.plugin";

/** Sticky nav shows quick controls when the brush bar is docked or the brush plugin is off. */
export function shouldQuickControlsUseStickyNav(pluginHost: IEditorPluginHost): boolean {
    if (!pluginHost.isWorkbenchUiPluginEnabled("brush_workspace")) {
        return true;
    }
    return getEditorBottomBarModel(pluginHost).placement === "docked";
}

export interface MapEditorBrushWorkspaceQuickControlsProps {
    pluginHost: IEditorPluginHost;
}

export function MapEditorBrushWorkspaceQuickControls({
    pluginHost,
}: MapEditorBrushWorkspaceQuickControlsProps): JSX.Element {
    return (
        <div className="flex flex-col gap-1 border-b border-border/70 px-2.5 pb-2.5 pt-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Quick controls</p>
            <TerrainSmoothingNavButton pluginHost={pluginHost} />
            <ObjectsVisibleNavButton pluginHost={pluginHost} />
        </div>
    );
}
