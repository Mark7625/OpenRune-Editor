import { DockviewDefaultTab, type IDockviewPanelHeaderProps } from "dockview";
import { memo, useCallback, useContext } from "react";

import { useMapEditorPanelContextMenu } from "./MapEditorPanelContextMenu";
import { buildMapEditorDockTabMenuItems } from "./map-editor-dock-tab-menu";
import { MapEditorWorkbenchContext } from "./map-editor-workbench-context";

export const MapEditorDockTab = memo(function MapEditorDockTab(props: IDockviewPanelHeaderProps): JSX.Element {
    const pluginHost = useContext(MapEditorWorkbenchContext);
    const panelId = props.api.id;
    const title = props.api.title;

    const getMenuItems = useCallback(() => {
        if (!pluginHost) {
            return [];
        }
        return buildMapEditorDockTabMenuItems(pluginHost, panelId, title);
    }, [panelId, pluginHost, title]);

    const { onContextMenu, menuPortal } = useMapEditorPanelContextMenu(
        `map-editor-tab-menu-${panelId}`,
        title,
        getMenuItems,
    );

    const onTabContextMenu = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (getMenuItems().length === 0) {
                return;
            }
            onContextMenu(event);
        },
        [getMenuItems, onContextMenu],
    );

    return (
        <>
            {menuPortal}
            <DockviewDefaultTab {...props} onContextMenu={onTabContextMenu} />
        </>
    );
});
