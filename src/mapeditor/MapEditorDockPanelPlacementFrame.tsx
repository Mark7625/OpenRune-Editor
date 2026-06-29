import { memo, type ReactNode } from "react";

import { mapEditorDockPanelShellClassName } from "./map-editor-workbench-chrome";
import { cn } from "../util/cn";

export interface MapEditorDockPanelPlacementFrameProps {
    children: ReactNode;
    shellClassName?: string;
}

/** Lightweight shell for docked palette panels (placement is on the tab context menu). */
export const MapEditorDockPanelPlacementFrame = memo(function MapEditorDockPanelPlacementFrame({
    children,
    shellClassName,
}: MapEditorDockPanelPlacementFrameProps): JSX.Element {
    return (
        <div className={cn(mapEditorDockPanelShellClassName("h-full min-h-0 border-0 shadow-none"), shellClassName)}>
            {children}
        </div>
    );
});
