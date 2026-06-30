import { useEffect, useState } from "react";

import { Button } from "../../../components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../../components/ui/dialog";
import { Label } from "../../../components/ui/label";
import type { IEditorPluginHost } from "../editor-plugin-host";
import {
    DEFAULT_REGION_STAMP_COPY_OPTIONS,
    REGION_STAMP_COPY_OPTION_ROWS,
    hasAnyRegionStampCopyOption,
    type RegionStampCopyOptions,
} from "./region-stamp-copy-options";

export function RegionStampCopyDialog({ pluginHost }: { pluginHost: IEditorPluginHost }): JSX.Element {
    const open = pluginHost.isRegionStampCopyDialogOpen();
    const [options, setOptions] = useState<RegionStampCopyOptions>(DEFAULT_REGION_STAMP_COPY_OPTIONS);

    useEffect(() => {
        if (open) {
            setOptions({ ...pluginHost.getRegionStampCopyOptions() });
        }
    }, [open, pluginHost]);

    const setOption = (key: keyof RegionStampCopyOptions, value: boolean): void => {
        setOptions((prev) => ({ ...prev, [key]: value }));
    };

    const setAll = (value: boolean): void => {
        const next = { ...DEFAULT_REGION_STAMP_COPY_OPTIONS };
        for (const key of Object.keys(next) as (keyof RegionStampCopyOptions)[]) {
            next[key] = value;
        }
        setOptions(next);
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    pluginHost.cancelRegionStampCopyDialog();
                }
            }}
        >
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Copy region</DialogTitle>
                    <DialogDescription>
                        Choose what to include in the stamp. Paste preview shows the real terrain and objects at full
                        opacity while you move and rotate.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center justify-end gap-2 py-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => setAll(true)}>
                        Select all
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setAll(false)}>
                        Clear all
                    </Button>
                </div>

                <div className="max-h-[min(50vh,24rem)] space-y-2 overflow-y-auto pr-1">
                    {REGION_STAMP_COPY_OPTION_ROWS.map((row) => (
                        <label
                            key={row.key}
                            className="flex cursor-pointer items-start gap-3 rounded-md border border-border/70 bg-muted/20 px-3 py-2.5"
                        >
                            <input
                                type="checkbox"
                                className="mt-0.5 size-4 shrink-0 accent-primary"
                                checked={options[row.key]}
                                onChange={(event) => setOption(row.key, event.target.checked)}
                            />
                            <span className="min-w-0">
                                <Label className="text-sm font-medium leading-none">{row.label}</Label>
                                <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
                            </span>
                        </label>
                    ))}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={() => pluginHost.cancelRegionStampCopyDialog()}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={!hasAnyRegionStampCopyOption(options)}
                        onClick={() => pluginHost.confirmRegionStampCopy(options)}
                    >
                        Copy & paste
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
