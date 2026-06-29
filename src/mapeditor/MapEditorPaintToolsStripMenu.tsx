import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Columns3, PanelLeft, Rows3 } from "lucide-react";

import { cn } from "../util/cn";
import type { PaintToolsStripModel, PaintToolsStripOrientation } from "./plugins/builtins/paint-tools-strip-model";

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

function MenuRadioItem({
    checked,
    children,
    onSelect,
}: {
    checked: boolean;
    children: React.ReactNode;
    onSelect: () => void;
}): JSX.Element {
    return (
        <button
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={onSelect}
        >
            <span className="absolute left-2 flex size-3.5 items-center justify-center">
                {checked ? <span className="size-2 rounded-full bg-current" /> : null}
            </span>
            {children}
        </button>
    );
}

function PaintToolsStripContextMenuPortal({
    model,
    open,
    anchor,
    onClose,
}: {
    model: PaintToolsStripModel;
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
            const menu = document.getElementById("map-editor-paint-tools-context-menu");
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

    const onOrientationChange = useCallback(
        (value: PaintToolsStripOrientation) => {
            model.setOrientation(value);
            onClose();
        },
        [model, onClose],
    );

    if (!open) {
        return null;
    }

    return createPortal(
        <div
            id="map-editor-paint-tools-context-menu"
            role="menu"
            className="fixed z-[200] min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: anchor.x, top: anchor.y }}
            onContextMenu={(event) => event.preventDefault()}
        >
            <div className="px-2 py-1.5 text-sm font-semibold">Paint tools</div>
            <MenuItem
                onSelect={() => {
                    model.setDockSide("left");
                    onClose();
                }}
            >
                <PanelLeft className="size-4" />
                Dock to left
            </MenuItem>
            <div className="my-1 h-px bg-muted" />
            <div className="px-2 py-1.5 text-xs font-normal text-muted-foreground">Layout</div>
            <MenuRadioItem
                checked={model.orientation === "vertical"}
                onSelect={() => onOrientationChange("vertical")}
            >
                <Rows3 className="size-4" />
                Vertical
            </MenuRadioItem>
            <MenuRadioItem
                checked={model.orientation === "horizontal"}
                onSelect={() => onOrientationChange("horizontal")}
            >
                <Columns3 className="size-4" />
                Horizontal
            </MenuRadioItem>
        </div>,
        document.body,
    );
}

export function usePaintToolsStripContextMenu(model: PaintToolsStripModel): {
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
        <PaintToolsStripContextMenuPortal model={model} open={open} anchor={anchor} onClose={onClose} />
    );

    return { onContextMenu, menuPortal };
}
