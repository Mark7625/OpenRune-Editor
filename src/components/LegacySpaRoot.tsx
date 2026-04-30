"use client";

import React, { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";

import App from "../App";
import { SettingsProvider } from "../context/settings-context";
import { ShellPreferencesProvider } from "../context/shell-preferences-context";
import { Bzip2 } from "../rs/compression/Bzip2";
import { Gzip } from "../rs/compression/Gzip";

export function LegacySpaRoot(): JSX.Element {
  useEffect(() => {
    Bzip2.initWasm();
    Gzip.initWasm();

    window.wallpaperPropertyListener = {
      applyGeneralProperties: (properties: any) => {
        if (properties.fps) {
          window.wallpaperFpsLimit = properties.fps;
        }
      },
    };
  }, []);

  return (
    <BrowserRouter>
      <SettingsProvider>
        <ShellPreferencesProvider>
          <App />
        </ShellPreferencesProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}
