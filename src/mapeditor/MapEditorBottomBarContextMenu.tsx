import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { PanelBottom } from "lucide-react";

import { cn } from "../util/cn";
import type { EditorBottomBarModel } from "./plugins/builtins/editor-bottom-bar-model";

function MenuItem({
    className,
    children,
    onSelect,
}: {
    className?: string;
    children: React.ReactNode;
    onSelect: () => void;
}): JSX.Element {
    return (
        <button
            type="button"
            role="menuitem"
            className={cn(
                "flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                className,
            )}
            onClick={onSelect}
        >
            {children}
        </button>
    );
}

function BottomBarContextMenuPortal({
    model,
    open,
    anchor,
    onClose,
}: {
    model: EditorBottomBarModel;
    open: boolean;
    anchor: { x: number; y: number };
    onClose: () => void;
}): JSX.Element | null {
    useEffect(() => {
        if (!open) {
            return;
        }
        const onPointerDown = (event: PointerEvent) => {
            if (event.button === 2) {
                return;
            }
            const menu = document.getElementById("map-editor-bottom-bar-context-menu");
            if (menu?.contains(event.target as Node)) {
                return;
            }
            onClose();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };
        window.addEventListener("pointerdown", onPointerDown, true);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("pointerdown", onPointerDown, true);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [onClose, open]);

    if (!open) {
        return null;
    }

    return createPortal(
        <div
            id="map-editor-bottom-bar-context-menu"
            role="menu"
            className="fixed z-[200] min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: anchor.x, top: anchor.y }}
            onContextMenu={(event) => event.preventDefault()}
        >
            <div className="px-2 py-1.5 text-sm font-semibold">Brush bar</div>
            <MenuItem
                onSelect={() => {
                    model.setDockSide("bottom");
                    onClose();
                }}
            >
                <PanelBottom className="size-4" />
                Dock to bottom
            </MenuItem>
        </div>,
        document.body,
    );
}

export function useEditorBottomBarContextMenu(model: EditorBottomBarModel): {
    onContextMenu: (event: ReactMouseEvent) => void;
    menuPortal: JSX.Element | null;
} {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState({ x: 0, y: 0 });

    const onClose = useCallback(() => setOpen(false), []);

    const onContextMenu = useCallback((event: ReactMouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setAnchor({ x: event.clientX, y: event.clientY });
        setOpen(true);
    }, []);

    const menuPortal = (
        <BottomBarContextMenuPortal model={model} open={open} anchor={anchor} onClose={onClose} />
    );

    return { onContextMenu, menuPortal };
}
