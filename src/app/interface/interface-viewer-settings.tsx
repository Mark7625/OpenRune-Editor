"use client";

import * as React from "react";
import { Maximize2, Monitor, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { RsInterfaceMode } from "@/components/ui/rs-interface";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export type InterfaceViewerSettingsProps = {
  mode: RsInterfaceMode;
  setMode: React.Dispatch<React.SetStateAction<RsInterfaceMode>>;
  showOverlays: boolean;
  setShowOverlays: React.Dispatch<React.SetStateAction<boolean>>;
  showViewportBorder: boolean;
  setShowViewportBorder: React.Dispatch<React.SetStateAction<boolean>>;
  showPixelGrid: boolean;
  setShowPixelGrid: React.Dispatch<React.SetStateAction<boolean>>;
  onViewportColorChange: (color: string) => void;
};

export function InterfaceViewerSettings({
  mode,
  setMode,
  showOverlays,
  setShowOverlays,
  showViewportBorder,
  setShowViewportBorder,
  showPixelGrid,
  setShowPixelGrid,
  onViewportColorChange,
}: InterfaceViewerSettingsProps): JSX.Element {
  const [viewportColorInput, setViewportColorInput] = React.useState("#171616");
  const debouncedPickerColor = useDebouncedValue(viewportColorInput, 80);

  React.useEffect(() => {
    onViewportColorChange(debouncedPickerColor);
  }, [debouncedPickerColor, onViewportColorChange]);

  return (
    <div className="flex items-center gap-1">
      <Button
        size="icon-xs"
        variant={mode === "fixed" ? "default" : "outline"}
        title="Fixed mode (512×334)"
        onClick={() => setMode("fixed")}
      >
        <Monitor className="size-3.5" />
      </Button>
      <Button
        size="icon-xs"
        variant={mode === "resizable" ? "default" : "outline"}
        title="Resizable mode"
        onClick={() => setMode("resizable")}
      >
        <Maximize2 className="size-3.5" />
      </Button>
      <details className="group relative">
        <summary className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="size-3.5" />
        </summary>
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border bg-popover p-2 text-xs shadow-md">
          <label className="mb-2 flex items-center justify-between gap-2">
            <span>Viewport color</span>
            <input
              type="color"
              value={viewportColorInput}
              onChange={(e) => setViewportColorInput(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border bg-transparent p-0"
            />
          </label>
          <label className="mb-1 flex items-center gap-2">
            <input
              type="checkbox"
              checked={showOverlays}
              onChange={(e) => setShowOverlays(e.target.checked)}
            />
            <span>Show UI overlays</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showViewportBorder}
              onChange={(e) => setShowViewportBorder(e.target.checked)}
            />
            <span>Show viewport border</span>
          </label>
          <label className="mt-1 flex items-center gap-2">
            <input
              type="checkbox"
              checked={showPixelGrid}
              onChange={(e) => setShowPixelGrid(e.target.checked)}
            />
            <span>Pixel lines</span>
          </label>
        </div>
      </details>
    </div>
  );
}
