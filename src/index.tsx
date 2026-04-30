import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { SettingsProvider } from "./context/settings-context";
import { ShellPreferencesProvider } from "./context/shell-preferences-context";
import "./index.css";
import reportWebVitals from "./reportWebVitals";
import { Bzip2 } from "./rs/compression/Bzip2";
import { Gzip } from "./rs/compression/Gzip";

Bzip2.initWasm();
Gzip.initWasm();

window.wallpaperPropertyListener = {
    applyGeneralProperties: (properties: any) => {
        if (properties.fps) {
            window.wallpaperFpsLimit = properties.fps;
        }
    },
};

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
    // <React.StrictMode>
    <BrowserRouter>
        <SettingsProvider>
            <ShellPreferencesProvider>
                <App />
            </ShellPreferencesProvider>
        </SettingsProvider>
    </BrowserRouter>,
    // </React.StrictMode>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
