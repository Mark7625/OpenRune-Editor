import type { IEditorPluginHost } from "./editor-plugin-host";
import type { MapEditorTool } from "./map-editor-kinds";
import {
    toConvertedPluginId,
    convertedCurrentBuiltinPlugins,
    parseConvertedPluginId,
} from "./builtins/converted-current-plugins.builtin";
import { BUILTIN_BRUSH_TYPE_PLUGINS } from "./builtins/current-plugin-layout.builtin";
import { coreKeybindsSettingsPlugin } from "./builtins/core-keybinds-settings.plugin";
import { gizmoStyleSettingsPlugin } from "./builtins/gizmo-style-settings.plugin";
import { graphicsSettingsPlugin } from "./builtins/graphics-settings.plugin";
import { keybindsSettingsPlugin } from "./builtins/keybinds-settings.plugin";
import { pluginHubPlugin } from "./builtins/plugin-hub.plugin";
import { settingsLauncherPlugin } from "./builtins/settings-launcher.plugin";
import { BUILTIN_IMPORT_EXPORT_PROVIDERS } from "./builtins/import-export.providers";
import { registerImportExportProvider } from "./import-export-registry";
import {
    listRegisteredPluginIds,
    removePlugin,
    resolvePlugins,
    setPluginEnabled as setPluginEnabledInRegistry,
    upsertPlugin,
} from "./registry";
import type { MapEditorPlugin, PluginContext, ResolvedPlugins } from "./types";

let initialized = false;

function ensureConvertedPluginsRegistered(): void {
    const nextIds = new Set(convertedCurrentBuiltinPlugins.map((plugin) => plugin.id));
    for (const existingId of listRegisteredPluginIds()) {
        if (!existingId.startsWith("openrune.internal.")) {
            continue;
        }
        if (!nextIds.has(existingId)) {
            removePlugin(existingId);
        }
    }
    for (const plugin of convertedCurrentBuiltinPlugins) {
        upsertPlugin(plugin);
    }
}

function ensureBuiltinsRegistered(): void {
    // Cleanup stale tab from earlier iteration.
    removePlugin("openrune.settings.core-plugins");
    if (initialized) {
        ensureConvertedPluginsRegistered();
        return;
    }
    initialized = true;
    upsertPlugin(settingsLauncherPlugin);
    upsertPlugin(pluginHubPlugin);
    upsertPlugin(gizmoStyleSettingsPlugin);
    upsertPlugin(graphicsSettingsPlugin);
    upsertPlugin(coreKeybindsSettingsPlugin);
    upsertPlugin(keybindsSettingsPlugin);
    for (const provider of BUILTIN_IMPORT_EXPORT_PROVIDERS) {
        registerImportExportProvider(provider);
    }
    ensureConvertedPluginsRegistered();
}

export function getMapEditorPluginRuntime(): ResolvedPlugins {
    ensureBuiltinsRegistered();
    return resolvePlugins();
}

export function setMapEditorPluginState(
    pluginId: string,
    enabled: boolean,
    pluginHost: IEditorPluginHost,
): void {
    const converted = parseConvertedPluginId(pluginId);
    if (converted?.kind === "tool") {
        const ok = pluginHost.setEditorToolPluginEnabled(
            converted.id as Parameters<typeof pluginHost.setEditorToolPluginEnabled>[0],
            enabled,
        );
        if (!ok) {
            return;
        }
    } else if (converted?.kind === "toolset") {
        if (converted.id === "terrain-paint") {
            const terrainTools: readonly MapEditorTool[] = ["underlay", "overlay"];
            for (const tool of terrainTools) {
                pluginHost.setEditorToolPluginEnabled(tool, enabled);
            }
        }
    } else if (converted?.kind === "brushes") {
        for (const brush of BUILTIN_BRUSH_TYPE_PLUGINS) {
            pluginHost.setBrushShapePluginEnabled(brush.id, enabled);
        }
    } else if (converted?.kind === "workbench") {
        pluginHost.setWorkbenchUiPluginEnabled(
            converted.id as Parameters<typeof pluginHost.setWorkbenchUiPluginEnabled>[0],
            enabled,
        );
    }
    setPluginEnabledInRegistry(pluginId, enabled);
}

export function syncConvertedPluginStates(
    runtime: ResolvedPlugins,
    pluginHost: PluginContext["pluginHost"],
): ResolvedPlugins {
    const pluginStates = runtime.pluginStates.map((state) => {
        const converted = parseConvertedPluginId(state.id);
        if (converted?.kind === "tool") {
            return {
                ...state,
                enabled: pluginHost.isEditorToolPluginEnabled(
                    converted.id as Parameters<typeof pluginHost.isEditorToolPluginEnabled>[0],
                ),
            };
        }
        if (converted?.kind === "toolset") {
            if (converted.id === "terrain-paint") {
                return {
                    ...state,
                    enabled:
                        pluginHost.isEditorToolPluginEnabled("underlay") &&
                        pluginHost.isEditorToolPluginEnabled("overlay"),
                };
            }
            return state;
        }
        if (state.id === toConvertedPluginId("brushes", "all")) {
            return {
                ...state,
                enabled: BUILTIN_BRUSH_TYPE_PLUGINS.every((brush) => pluginHost.isBrushShapePluginEnabled(brush.id)),
            };
        }
        if (converted?.kind === "brushes") {
            return {
                ...state,
                enabled: BUILTIN_BRUSH_TYPE_PLUGINS.every((brush) => pluginHost.isBrushShapePluginEnabled(brush.id)),
            };
        }
        if (converted?.kind === "workbench") {
            return {
                ...state,
                enabled: pluginHost.isWorkbenchUiPluginEnabled(
                    converted.id as Parameters<typeof pluginHost.isWorkbenchUiPluginEnabled>[0],
                ),
            };
        }
        return state;
    });

    return { ...runtime, pluginStates };
}

export function registerCustomMapEditorPlugin(plugin: MapEditorPlugin): void {
    ensureBuiltinsRegistered();
    upsertPlugin(plugin);
}

export function registerCustomImportExportProvider(
    provider: import("./types").ImportExportProvider,
): void {
    ensureBuiltinsRegistered();
    registerImportExportProvider(provider);
}

export { listImportExportProviders } from "./import-export-registry";
export type { MapEditorPlugin, PluginContext, ImportExportProvider } from "./types";
