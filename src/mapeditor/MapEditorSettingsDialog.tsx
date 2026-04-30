import { useEffect, useMemo, useState } from "react";

import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import type { PluginContext, SettingsTabContribution } from "./plugins/types";

interface MapEditorSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tabs: SettingsTabContribution[];
    pluginContext: PluginContext;
}

export function MapEditorSettingsDialog({
    open,
    onOpenChange,
    tabs,
    pluginContext,
}: MapEditorSettingsDialogProps): JSX.Element {
    const resolvedTabs = useMemo(
        () => tabs.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        [tabs],
    );
    const [activeTabId, setActiveTabId] = useState<string | undefined>(resolvedTabs[0]?.id);

    useEffect(() => {
        if (!activeTabId || !resolvedTabs.some((tab) => tab.id === activeTabId)) {
            setActiveTabId(resolvedTabs[0]?.id);
        }
    }, [activeTabId, resolvedTabs]);

    useEffect(() => {
        pluginContext.pluginHost.setEditorInputSuspendedBySource("settings-dialog", open);
        return () => {
            pluginContext.pluginHost.setEditorInputSuspendedBySource("settings-dialog", false);
        };
    }, [open, pluginContext.pluginHost]);

    const activeTab = resolvedTabs.find((tab) => tab.id === activeTabId) ?? resolvedTabs[0];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Map editor settings</DialogTitle>
                </DialogHeader>
                <div className="flex h-[52vh] gap-3">
                    <div className="flex w-52 shrink-0 flex-col gap-1 border-r pr-3" role="tablist">
                        {resolvedTabs.map((tab) => (
                            <Button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={activeTab?.id === tab.id}
                                variant={activeTab?.id === tab.id ? "secondary" : "ghost"}
                                className="justify-start"
                                onClick={() => setActiveTabId(tab.id)}
                            >
                                {tab.title}
                            </Button>
                        ))}
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                        {activeTab ? activeTab.render(pluginContext) : null}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
