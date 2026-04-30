import { Blend, Boxes, SlidersHorizontal } from "lucide-react";
import { useMemo } from "react";

import { Button } from "../../../components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip";
import { keybindChordToLabel } from "../../editor-tool-input";
import type { IEditorPluginHost } from "../editor-plugin-host";
import type { EditorViewNavPlugin } from "./builtin-plugin-types";
import { workbenchBindingKey, workbenchDefaultChords } from "./workbench-keybinds.builtin";

function TerrainSmoothingNavButton({ pluginHost }: { pluginHost: IEditorPluginHost }): JSX.Element {
    const terrainSmoothingToggleHint = useMemo(() => {
        const key = workbenchBindingKey("toggle-terrain-smoothing");
        const chords = pluginHost.getResolvedKeybindChords(key, workbenchDefaultChords("toggle-terrain-smoothing"));
        return chords.length === 0 ? "No hotkey" : chords.map((c) => keybindChordToLabel(c)).join(" / ");
    }, [pluginHost]);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant={pluginHost.terrainSmoothingEnabled ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => pluginHost.toggleTerrainSmoothingEnabled()}
                    aria-pressed={pluginHost.terrainSmoothingEnabled}
                >
                    <Blend className="size-3.5" />
                    <span>{pluginHost.terrainSmoothingEnabled ? "Terrain Smoothing on" : "Terrain Smoothing off"}</span>
                </Button>
            </TooltipTrigger>
            <TooltipContent>
                Toggle terrain smoothing/blending ({terrainSmoothingToggleHint}) - currently{" "}
                {pluginHost.terrainSmoothingEnabled ? "on" : "off"}
            </TooltipContent>
        </Tooltip>
    );
}

function ObjectsVisibleNavButton({ pluginHost }: { pluginHost: IEditorPluginHost }): JSX.Element {
    const objectToggleHint = useMemo(() => {
        const key = workbenchBindingKey("toggle-objects-visible");
        const chords = pluginHost.getResolvedKeybindChords(key, workbenchDefaultChords("toggle-objects-visible"));
        return chords.length === 0 ? "No hotkey" : chords.map((c) => keybindChordToLabel(c)).join(" / ");
    }, [pluginHost]);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant={pluginHost.objectsVisible ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    onClick={() => pluginHost.toggleObjectsVisible()}
                    aria-pressed={pluginHost.objectsVisible}
                >
                    <Boxes className="size-3.5" />
                    <span>{pluginHost.objectsVisible ? "Objects on" : "Objects off"}</span>
                </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle objects visibility ({objectToggleHint})</TooltipContent>
        </Tooltip>
    );
}

export const terrainSmoothingNavPlugin: EditorViewNavPlugin = {
    id: "terrain-smoothing",
    name: "Terrain Smoothing",
    order: 10,
    component: TerrainSmoothingNavButton,
};

export const objectsVisibleNavPlugin: EditorViewNavPlugin = {
    id: "objects-visible",
    name: "Objects",
    order: 20,
    component: ObjectsVisibleNavButton,
};

function QuickControlsNavDropdown({ pluginHost }: { pluginHost: IEditorPluginHost }): JSX.Element {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
                    <SlidersHorizontal className="size-3.5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Quick controls</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                    checked={pluginHost.terrainSmoothingEnabled}
                    onCheckedChange={() => pluginHost.toggleTerrainSmoothingEnabled()}
                >
                    Terrain smoothing: {pluginHost.terrainSmoothingEnabled ? "On" : "Off"}
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                    checked={pluginHost.objectsVisible}
                    onCheckedChange={() => pluginHost.toggleObjectsVisible()}
                >
                    Objects: {pluginHost.objectsVisible ? "On" : "Off"}
                </DropdownMenuCheckboxItem>
                <DropdownMenuItem onSelect={() => pluginHost.setViewMode("editor")}>Switch to Editor view</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export const quickControlsNavPlugin: EditorViewNavPlugin = {
    id: "quick-controls",
    name: "Quick Controls",
    order: 30,
    component: QuickControlsNavDropdown,
};
