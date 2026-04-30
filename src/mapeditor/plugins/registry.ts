import type { MapEditorPlugin, PluginState, ResolvedPlugins } from "./types";

const registeredPlugins = new Map<string, MapEditorPlugin>();
const pluginEnabledState = new Map<string, boolean>();

export function listRegisteredPluginIds(): string[] {
    return Array.from(registeredPlugins.keys());
}

export function upsertPlugin(plugin: MapEditorPlugin): void {
    registeredPlugins.set(plugin.id, plugin);
    if (!pluginEnabledState.has(plugin.id)) {
        pluginEnabledState.set(plugin.id, true);
    }
}

export function removePlugin(pluginId: string): void {
    registeredPlugins.delete(pluginId);
    pluginEnabledState.delete(pluginId);
}

export function setPluginEnabled(pluginId: string, enabled: boolean): void {
    const plugin = registeredPlugins.get(pluginId);
    if (!plugin) {
        return;
    }
    if (plugin.manifest.internalOnly) {
        pluginEnabledState.set(pluginId, true);
        return;
    }
    pluginEnabledState.set(pluginId, enabled);
}

function listPluginStates(): PluginState[] {
    return Array.from(registeredPlugins.values()).map((plugin) => ({
        id: plugin.id,
        manifest: plugin.manifest,
        enabled: plugin.manifest.internalOnly ? true : pluginEnabledState.get(plugin.id) !== false,
    }));
}

export function resolvePlugins(): ResolvedPlugins {
    const enabledPlugins = Array.from(registeredPlugins.values()).filter((plugin) => {
        if (plugin.manifest.internalOnly) {
            return true;
        }
        return pluginEnabledState.get(plugin.id) !== false;
    });

    const activePlugins: MapEditorPlugin[] = [];
    for (const plugin of enabledPlugins) {
        const conflicts = plugin.manifest.pluginConflicts ?? [];
        const hasConflict = conflicts.some((conflictId) =>
            enabledPlugins.some((candidate) => candidate.id === conflictId),
        );
        if (!hasConflict) {
            activePlugins.push(plugin);
        }
    }

    const toolbarItems = activePlugins
        .flatMap((plugin) => plugin.toolbarItems ?? [])
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const settingsTabs = activePlugins
        .flatMap((plugin) => plugin.settingsTabs ?? [])
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return {
        plugins: activePlugins,
        pluginStates: listPluginStates(),
        toolbarItems,
        settingsTabs,
    };
}
