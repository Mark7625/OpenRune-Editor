import { Columns3, ExternalLink, PanelBottom, PanelLeft, PictureInPicture2, Rows3 } from "lucide-react";

import type { MapEditorPanelContextMenuItem } from "./MapEditorPanelContextMenu";
import type { MapEditorPanelPlacement } from "./map-editor-panel-display";
import type { PaintToolsStripModel } from "./plugins/builtins/paint-tools-strip-model";

export function buildMapEditorPanelPlacementMenuItems(options: {
    title: string;
    current: MapEditorPanelPlacement;
    canExternal?: boolean;
    dockLabel?: string;
    dockIcon?: JSX.Element;
    onSelect: (placement: MapEditorPanelPlacement) => void;
}): MapEditorPanelContextMenuItem[] {
    const {
        current,
        canExternal = true,
        dockLabel = "Dock to panel",
        dockIcon = <PanelBottom className="size-4" />,
        onSelect,
    } = options;
    const items: MapEditorPanelContextMenuItem[] = [
        {
            id: "dock",
            label: dockLabel,
            icon: dockIcon,
            disabled: current === "docked",
            onSelect: () => onSelect("docked"),
        },
        {
            id: "float",
            label: "Float over workbench",
            icon: <PictureInPicture2 className="size-4" />,
            disabled: current === "floating",
            onSelect: () => onSelect("floating"),
        },
    ];
    if (canExternal) {
        items.push({
            id: "external",
            label: "Open external window",
            icon: <ExternalLink className="size-4" />,
            disabled: current === "external",
            onSelect: () => onSelect("external"),
        });
    }
    return items;
}

export function buildPaintToolsPlacementMenuItems(options: {
    current: "docked" | "floating";
    onSelect: (mode: "docked" | "floating") => void;
}): MapEditorPanelContextMenuItem[] {
    return [
        {
            id: "dock-left",
            label: "Dock to left",
            icon: <PanelLeft className="size-4" />,
            disabled: options.current === "docked",
            onSelect: () => options.onSelect("docked"),
        },
        {
            id: "float",
            label: "Float over workbench",
            icon: <PictureInPicture2 className="size-4" />,
            disabled: options.current === "floating",
            onSelect: () => options.onSelect("floating"),
        },
    ];
}

/** Full paint-tools strip menu: placement, undock, and layout orientation (floating only). */
export function buildPaintToolsContextMenuItems(model: PaintToolsStripModel): MapEditorPanelContextMenuItem[] {
    const isDocked = model.dockSide === "left";
    const items: MapEditorPanelContextMenuItem[] = [
        {
            id: "dock-left",
            label: "Dock to left",
            icon: <PanelLeft className="size-4" />,
            disabled: isDocked,
            onSelect: () => model.setDockSide("left"),
        },
        {
            id: "float",
            label: "Float over workbench",
            icon: <PictureInPicture2 className="size-4" />,
            disabled: !isDocked,
            onSelect: () => model.setDockSide("none"),
        },
    ];
    if (!isDocked) {
        items.push({
            id: "toggle-orientation",
            label: model.orientation === "vertical" ? "Horizontal layout" : "Vertical layout",
            icon: model.orientation === "vertical" ? <Columns3 className="size-4" /> : <Rows3 className="size-4" />,
            onSelect: () => model.toggleOrientation(),
        });
    }
    return items;
}
