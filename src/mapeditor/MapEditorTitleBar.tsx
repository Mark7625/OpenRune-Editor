import { Download, LayoutGrid, PanelRightOpen, RotateCcw, Upload } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { DockviewApi } from "dockview";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Separator } from "../components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import { BUILTIN_EDITOR_HEADER_PLUGINS } from "./plugins/builtins/current-plugin-runtime.builtin";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { getRegisteredEditorToolKeybinds } from "./editor-tool-input";
import { MapEditorSettingsDialog } from "./MapEditorSettingsDialog";
import { applyMapEditorWorkbenchLayout, resetMapEditorWorkbenchLayout } from "./map-editor-workbench-layout";
import {
    getMapEditorPluginRuntime,
    listImportExportProviders,
    setMapEditorPluginState,
    syncConvertedPluginStates,
} from "./plugins";
import type { PluginContext } from "./plugins";

const PANEL_RESTORE: { id: string; title: string }[] = [
    { id: "editor-scene-editor", title: "Editor (3D)" },
    { id: "editor-underlays", title: "Underlays" },
    { id: "editor-overlays", title: "Overlays" },
    { id: "editor-height", title: "Height" },
    { id: "editor-tile-flags", title: "Tile flags" },
    { id: "editor-object-selector", title: "Objects" },
    { id: "editor-object-delete", title: "Delete objects" },
    { id: "editor-region-stamp", title: "Region stamp" },
    { id: "editor-brush-workspace", title: "Brush" },
    { id: "editor-history", title: "History" },
    { id: "editor-minimap", title: "Minimap" },
];

export interface MapEditorTitleBarProps {
    pluginHost: IEditorPluginHost;
    dockApi: DockviewApi | null;
}

export function MapEditorTitleBar({ pluginHost, dockApi }: MapEditorTitleBarProps): JSX.Element {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const workbenchSnapshot = useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );
    const pluginRuntime = useMemo(
        () => syncConvertedPluginStates(getMapEditorPluginRuntime(), pluginHost),
        [pluginHost, workbenchSnapshot],
    );
    const pluginContext = useMemo<PluginContext>(
        () => ({
            pluginHost,
            dockApi,
            plugins: pluginRuntime.pluginStates,
            setPluginEnabled: (pluginId, enabled) => {
                setMapEditorPluginState(pluginId, enabled, pluginHost);
                pluginHost.notifyWorkbenchStateChanged();
            },
            isSettingsOpen: settingsOpen,
            setSettingsOpen,
            keybindings: getRegisteredEditorToolKeybinds().map((row) => ({
                pluginId: row.pluginId,
                pluginName: row.pluginName,
                id: row.binding.id,
                key: row.key,
                name: row.binding.name,
                description: row.binding.description,
                defaultChords: row.binding.defaultChords,
            })),
            getResolvedKeybindChords: (bindingKey, defaultChords) =>
                pluginHost.getResolvedKeybindChords(bindingKey, defaultChords),
            setKeybindOverride: (bindingKey, chord) => pluginHost.setKeybindOverride(bindingKey, chord),
            clearKeybindOverride: (bindingKey) => pluginHost.clearKeybindOverride(bindingKey),
            clearAllKeybindOverrides: () => pluginHost.clearAllKeybindOverrides(),
        }),
        [dockApi, pluginHost, pluginRuntime.pluginStates, settingsOpen],
    );

    const restorePanels = () => {
        if (!dockApi) {
            toast.error("Workbench is still loading.");
            return;
        }
        applyMapEditorWorkbenchLayout(dockApi, pluginHost);
        toast.success("Closed panels restored where possible.");
    };

    const resetWorkspace = () => {
        if (!dockApi) {
            toast.error("Workbench is still loading.");
            return;
        }
        resetMapEditorWorkbenchLayout(dockApi, pluginHost);
        toast.message("Workspace reset to default layout.");
    };

    const importProviders = useMemo(() => listImportExportProviders("import"), []);
    const exportProviders = useMemo(() => listImportExportProviders("export"), []);
    const groupedImportProviders = useMemo(() => {
        const map = new Map<string, typeof importProviders>();
        for (const provider of importProviders) {
            const key = provider.category ?? "General";
            map.set(key, [...(map.get(key) ?? []), provider]);
        }
        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [importProviders]);
    const groupedExportProviders = useMemo(() => {
        const map = new Map<string, typeof exportProviders>();
        for (const provider of exportProviders) {
            const key = provider.category ?? "General";
            map.set(key, [...(map.get(key) ?? []), provider]);
        }
        return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [exportProviders]);

    return (
        <TooltipProvider delayDuration={300}>
            <header
                data-map-editor-title-bar
                className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3 backdrop-blur-sm"
            >
                <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">Map editor</span>
                    <Badge variant="secondary" className="hidden max-w-[10rem] truncate font-normal sm:inline-flex">
                        {pluginHost.loadedCache.info.name}
                    </Badge>
                </div>

                <Separator orientation="vertical" className="mx-1 h-6" />

                <DropdownMenu>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="gap-1.5 px-2">
                                    <Upload className="size-4" />
                                    <span className="hidden sm:inline">Import</span>
                                </Button>
                            </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent>Import map data</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="start" className="w-64">
                        <DropdownMenuLabel>Import</DropdownMenuLabel>
                        {groupedImportProviders.length === 0 ? (
                            <DropdownMenuItem disabled>No import providers registered</DropdownMenuItem>
                        ) : (
                            groupedImportProviders.map(([category, providers]) => (
                                <DropdownMenuSub key={category}>
                                    <DropdownMenuSubTrigger>{category}</DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                        {providers.map((provider) => (
                                            <DropdownMenuItem
                                                key={provider.id}
                                                onSelect={() => provider.run({ pluginHost, dockApi })}
                                            >
                                                {provider.name}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            ))
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="gap-1.5 px-2">
                                    <LayoutGrid className="size-4" />
                                    <span className="hidden sm:inline">View</span>
                                </Button>
                            </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent>Panels & layout</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuLabel>Windows</DropdownMenuLabel>
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <PanelRightOpen className="size-4" />
                                Reopen panel
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                                {PANEL_RESTORE.map((p) => (
                                    <DropdownMenuItem
                                        key={p.id}
                                        disabled={!dockApi || !!dockApi.getPanel(p.id)}
                                        onSelect={() => {
                                            if (dockApi) {
                                                applyMapEditorWorkbenchLayout(dockApi, pluginHost);
                                                toast.success(`${p.title} opened`);
                                            }
                                        }}
                                    >
                                        {p.title}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuItem onSelect={restorePanels}>
                            Restore all missing panels
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={resetWorkspace}>
                            <RotateCcw className="size-4" />
                            Reset workspace layout
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="gap-1.5 px-2">
                                    <Download className="size-4" />
                                    <span className="hidden sm:inline">Export</span>
                                </Button>
                            </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent>Export map data</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="start" className="w-64">
                        <DropdownMenuLabel>Export</DropdownMenuLabel>
                        {groupedExportProviders.length === 0 ? (
                            <DropdownMenuItem disabled>No export providers registered</DropdownMenuItem>
                        ) : (
                            groupedExportProviders.map(([category, providers]) => (
                                <DropdownMenuSub key={category}>
                                    <DropdownMenuSubTrigger>{category}</DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                        {providers.map((provider) => (
                                            <DropdownMenuItem
                                                key={provider.id}
                                                onSelect={() => provider.run({ pluginHost, dockApi })}
                                            >
                                                {provider.name}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            ))
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>

                {pluginRuntime.toolbarItems.map((item) => (
                    <span key={item.id} className="contents">
                        {item.render(pluginContext)}
                    </span>
                ))}

                {BUILTIN_EDITOR_HEADER_PLUGINS.slice()
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                    .map((plugin) => {
                        const Component = plugin.component;
                        return <Component key={plugin.id} pluginHost={pluginHost} dockApi={dockApi} />;
                    })}

                <div className="flex-1" />

                <MapEditorSettingsDialog
                    open={settingsOpen}
                    onOpenChange={setSettingsOpen}
                    tabs={pluginRuntime.settingsTabs}
                    pluginContext={pluginContext}
                />
            </header>
        </TooltipProvider>
    );
}
