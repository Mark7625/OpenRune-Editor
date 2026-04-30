import { ReactNode, useEffect, useMemo, useState } from "react";
import { ChevronDown, PlugZap, Search, Settings } from "lucide-react";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Separator } from "../../../components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip";
import type { IEditorPluginHost } from "../editor-plugin-host";
import { BUILTIN_BRUSH_TYPE_PLUGINS } from "./current-plugin-layout.builtin";
import { MapEditorPlugin } from "../types";

function PluginHubButton({
                             plugins,
                             setPluginEnabled,
                             pluginHost,
                         }: {
    plugins: {
        id: string;
        enabled: boolean;
        manifest: {
            icon: ReactNode;
            name: string;
            description: string;
            author: string;
            version: string;
            tags: string[];
        };
    }[];
    setPluginEnabled: (pluginId: string, enabled: boolean) => void;
    pluginHost: IEditorPluginHost;
}): JSX.Element {
    const [open, setOpen] = useState(false);
    const [brushSettingsOpen, setBrushSettingsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [author, setAuthor] = useState("");
    const [disabledTags, setDisabledTags] = useState<string[]>([]);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        for (const plugin of plugins) {
            for (const tag of plugin.manifest.tags) {
                tags.add(tag);
            }
        }
        return Array.from(tags).sort();
    }, [plugins]);

    const filteredPlugins = useMemo(() => {
        const searchLower = search.trim().toLowerCase();
        const authorLower = author.trim().toLowerCase();
        return plugins.filter((plugin) => {
            const visibleInHub = plugin.manifest.showInHub !== false;
            const hideInternal = plugin.manifest.internalOnly && plugin.manifest.showInHub !== true;
            if (!visibleInHub || hideInternal) {
                return false;
            }
            const matchesSearch =
                searchLower.length === 0 ||
                plugin.manifest.name.toLowerCase().includes(searchLower) ||
                plugin.manifest.description.toLowerCase().includes(searchLower) ||
                plugin.id.toLowerCase().includes(searchLower);
            const matchesAuthor =
                authorLower.length === 0 ||
                plugin.manifest.author.toLowerCase().includes(authorLower);
            const matchesTag =
                allTags.length === 0 ||
                plugin.manifest.tags.some((tag) => !disabledTags.includes(tag));
            return matchesSearch && matchesAuthor && matchesTag;
        });
    }, [allTags.length, author, disabledTags, plugins, search]);

    const brushesPluginId = "openrune.internal.brushes.all";
    const enabledBrushCount = BUILTIN_BRUSH_TYPE_PLUGINS.filter((brush) =>
        pluginHost.isBrushShapePluginEnabled(brush.id),
    ).length;
    const anyDialogOpen = open || brushSettingsOpen;

    useEffect(() => {
        pluginHost.setEditorInputSuspendedBySource("plugin-hub-dialog", anyDialogOpen);
        return () => {
            pluginHost.setEditorInputSuspendedBySource("plugin-hub-dialog", false);
        };
    }, [anyDialogOpen, pluginHost]);

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => setOpen(true)}
                    >
                        <PlugZap className="size-4" />
                        <span>Plugin Hub</span>
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Browse, filter, and toggle editor plugins.</TooltipContent>
            </Tooltip>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Plugin Hub</DialogTitle>
                    </DialogHeader>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search plugins..."
                                className="pl-8 pr-28"
                            />
                            <div className="absolute right-1 top-1/2 -translate-y-1/2">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-7 gap-1 px-2 text-[11px]"
                                        >
                                            Tags ({Math.max(0, allTags.length - disabledTags.length)})
                                            <ChevronDown className="size-3.5" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-72">
                                        <DropdownMenuLabel>Filter tags</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <div className="grid max-h-44 grid-cols-3 gap-2 overflow-y-auto p-1">
                                            {allTags.map((tag) => {
                                                const enabled = !disabledTags.includes(tag);
                                                return (
                                                    <button
                                                        key={tag}
                                                        type="button"
                                                        className="text-left"
                                                        onClick={() => {
                                                            setDisabledTags((prev) =>
                                                                prev.includes(tag)
                                                                    ? prev.filter((t) => t !== tag)
                                                                    : [...prev, tag],
                                                            );
                                                        }}
                                                    >
                                                        <Badge variant={enabled ? "secondary" : "outline"}>{tag}</Badge>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <DropdownMenuSeparator />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-full justify-start px-2 text-[11px]"
                                            onClick={() => setDisabledTags([])}
                                        >
                                            Enable all tags
                                        </Button>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                        <Input
                            value={author}
                            onChange={(event) => setAuthor(event.target.value)}
                            placeholder="Filter by author..."
                            className="max-w-52"
                        />
                    </div>
                    <Separator />
                    <div className="max-h-[52vh] space-y-2 overflow-y-auto">
                        {filteredPlugins.map((plugin) => (
                            <div
                                key={plugin.id}
                                className="flex items-start justify-between gap-4 rounded-md border p-3"
                            >
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
                                            {plugin.manifest.icon}
                                        </span>
                                        <span className="font-medium">{plugin.manifest.name}</span>
                                        <Badge variant="outline">v{plugin.manifest.version}</Badge>
                                        <Badge variant="secondary">{plugin.manifest.author}</Badge>
                                        <Badge variant={plugin.enabled ? "secondary" : "outline"}>
                                            {plugin.enabled ? "Enabled" : "Disabled"}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {plugin.manifest.description}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {plugin.id === brushesPluginId ? (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setBrushSettingsOpen(true)}
                                        >
                                            <Settings className="mr-1 size-4" />
                                            Configure
                                        </Button>
                                    ) : null}
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={plugin.enabled ? "outline" : "default"}
                                        disabled={plugin.id === "openrune.plugin-hub" || plugin.id === brushesPluginId}
                                        onClick={() => setPluginEnabled(plugin.id, !plugin.enabled)}
                                    >
                                        {plugin.id === "openrune.plugin-hub" || plugin.id === brushesPluginId
                                            ? "Required"
                                            : plugin.enabled
                                                ? "Disable"
                                                : "Enable"}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
            <Dialog open={brushSettingsOpen} onOpenChange={setBrushSettingsOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Brushes</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                        {BUILTIN_BRUSH_TYPE_PLUGINS.map((brush) => {
                            const enabled = pluginHost.isBrushShapePluginEnabled(brush.id);
                            const disableLocked = enabled && enabledBrushCount <= 1;
                            return (
                                <div key={brush.id} className="flex items-center justify-between rounded-md border p-2">
                                    <div>
                                        <p className="text-sm font-medium">{brush.name}</p>
                                        <p className="text-xs text-muted-foreground">{brush.description}</p>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={enabled ? "outline" : "default"}
                                        disabled={disableLocked}
                                        onClick={() => pluginHost.setBrushShapePluginEnabled(brush.id, !enabled)}
                                    >
                                        {enabled ? "Disable" : "Enable"}
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export const pluginHubPlugin: MapEditorPlugin = {
    id: "openrune.plugin-hub",
    manifest: {
        icon: <PlugZap className="size-4" />,
        name: "Plugin Hub",
        description: "Discover, filter, and manage map editor plugins.",
        author: "OpenRune",
        version: "0.1.0",
        tags: ["plugin", "management", "ui"],
        pluginConflicts: [],
    },
    toolbarItems: [
        {
            id: "plugin-hub-button",
            placement: "top",
            order: 200,
            render: (ctx) => (
                <PluginHubButton plugins={ctx.plugins} setPluginEnabled={ctx.setPluginEnabled} pluginHost={ctx.pluginHost} />
            ),
        },
    ],
};
