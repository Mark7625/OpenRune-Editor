import type { ReactNode } from "react";
import type { DockviewApi } from "dockview";
import type { EditorToolKeyChord } from "./builtins/builtin-plugin-types";
import type { IEditorPluginHost } from "./editor-plugin-host";

export interface PluginManifest {
    icon: ReactNode;
    name: string;
    description: string;
    author: string;
    version: string;
    tags: string[];
    pluginConflicts?: string[];
    internalOnly?: boolean;
    showInHub?: boolean;
}

export interface PluginState {
    id: string;
    manifest: PluginManifest;
    enabled: boolean;
}

export interface PluginContext {
    pluginHost: IEditorPluginHost;
    dockApi: DockviewApi | null;
    plugins: PluginState[];
    setPluginEnabled: (pluginId: string, enabled: boolean) => void;
    isSettingsOpen: boolean;
    setSettingsOpen: (open: boolean) => void;
    keybindings: {
        pluginId: string;
        pluginName: string;
        id: string;
        key: string;
        name: string;
        description?: string;
        defaultChords: readonly EditorToolKeyChord[];
    }[];
    getResolvedKeybindChords: (bindingKey: string, defaultChords: readonly EditorToolKeyChord[]) => readonly EditorToolKeyChord[];
    setKeybindOverride: (bindingKey: string, chord: EditorToolKeyChord | null) => void;
    clearKeybindOverride: (bindingKey: string) => boolean;
    clearAllKeybindOverrides: () => boolean;
}

export interface ToolbarContribution {
    id: string;
    placement: "titlebar";
    order?: number;
    render: (ctx: PluginContext) => ReactNode;
}

export interface SettingsTabContribution {
    id: string;
    title: string;
    order?: number;
    render: (ctx: PluginContext) => ReactNode;
}

export interface MapEditorPlugin {
    id: string;
    manifest: PluginManifest;
    toolbarItems?: ToolbarContribution[];
    settingsTabs?: SettingsTabContribution[];
}

export interface ResolvedPlugins {
    plugins: MapEditorPlugin[];
    pluginStates: PluginState[];
    toolbarItems: ToolbarContribution[];
    settingsTabs: SettingsTabContribution[];
}

export type ImportExportProviderKind = "import" | "export";

export interface ImportExportProviderContext {
    pluginHost: IEditorPluginHost;
    dockApi: DockviewApi | null;
}

export interface ImportExportProvider {
    id: string;
    kind: ImportExportProviderKind;
    name: string;
    description?: string;
    /**
     * Optional category label used for grouping in dropdowns.
     * Providers without a category are shown under "General".
     */
    category?: string;
    run: (ctx: ImportExportProviderContext) => void | Promise<void>;
}
