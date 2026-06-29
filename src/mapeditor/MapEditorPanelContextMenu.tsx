import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "../util/cn";

export type MapEditorPanelContextMenuItem = {
    id: string;
    label: ReactNode;
    icon?: ReactNode;
    disabled?: boolean;
    onSelect: () => void;
};

const CONTEXT_MENU_VIEWPORT_MARGIN = 8;

export function getViewportClampedContextMenuPosition(
    anchor: { x: number; y: number },
    menuSize: { width: number; height: number },
): { x: number; y: number } {
    const margin = CONTEXT_MENU_VIEWPORT_MARGIN;
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : menuSize.width;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : menuSize.height;

    let x = anchor.x;
    let y = anchor.y;

    if (y + menuSize.height + margin > viewportHeight) {
        y = anchor.y - menuSize.height;
    }
    if (x + menuSize.width + margin > viewportWidth) {
        x = anchor.x - menuSize.width;
    }

    const maxX = Math.max(margin, viewportWidth - menuSize.width - margin);
    const maxY = Math.max(margin, viewportHeight - menuSize.height - margin);

    return {
        x: Math.min(Math.max(margin, x), maxX),
        y: Math.min(Math.max(margin, y), maxY),
    };
}

function MapEditorPanelContextMenuPortal({
    menuId,
    title,
    open,
    anchor,
    items,
    onClose,
}: {
    menuId: string;
    title: string;
    open: boolean;
    anchor: { x: number; y: number };
    items: readonly MapEditorPanelContextMenuItem[];
    onClose: () => void;
}): JSX.Element | null {
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState(anchor);

    useLayoutEffect(() => {
        if (!open) {
            return;
        }
        setPosition(anchor);
    }, [anchor, open]);

    useLayoutEffect(() => {
        if (!open) {
            return;
        }
        const menu = menuRef.current;
        if (!menu) {
            return;
        }
        const { width, height } = menu.getBoundingClientRect();
        if (width <= 0 || height <= 0) {
            return;
        }
        setPosition(getViewportClampedContextMenuPosition(anchor, { width, height }));
    }, [anchor, items, open, title]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const onPointerDown = (event: PointerEvent) => {
            if (event.button === 2) {
                return;
            }
            const menu = document.getElementById(menuId);
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
    }, [menuId, onClose, open]);

    if (!open) {
        return null;
    }

    return createPortal(
        <div
            ref={menuRef}
            id={menuId}
            role="menu"
            className="fixed z-[300] min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: position.x, top: position.y }}
            onContextMenu={(event) => event.preventDefault()}
        >
            <div className="px-2 py-1.5 text-sm font-semibold">{title}</div>
            {items.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    className={cn(
                        "flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50",
                    )}
                    onClick={() => {
                        if (item.disabled) {
                            return;
                        }
                        item.onSelect();
                        onClose();
                    }}
                >
                    {item.icon}
                    {item.label}
                </button>
            ))}
        </div>,
        document.body,
    );
}

export function useMapEditorPanelContextMenu(
    menuId: string,
    title: string,
    getItems: () => readonly MapEditorPanelContextMenuItem[],
): {
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
        <MapEditorPanelContextMenuPortal
            menuId={menuId}
            title={title}
            open={open}
            anchor={anchor}
            items={open ? getItems() : []}
            onClose={onClose}
        />
    );

    return { onContextMenu, menuPortal };
}
