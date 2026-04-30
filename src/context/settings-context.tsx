import React from "react";

const STORAGE_SETTINGS = "app-shell-settings";

export type ThemePreset =
    | "default"
    | "blue"
    | "green"
    | "amber"
    | "default-scaled"
    | "blue-scaled"
    | "mono-scaled";

type ThemeMode = "dark" | "light";

export type AppSettings = {
    themePreset: ThemePreset;
    fullWidthContent: boolean;
    themeMode: ThemeMode;
};

type SettingsContextValue = {
    settings: AppSettings;
    updateSettings: (next: Partial<AppSettings>) => void;
};

const defaultSettings: AppSettings = {
    themePreset: "default",
    fullWidthContent: true,
    themeMode: "dark",
};

const THEME_PRESETS: ThemePreset[] = [
    "default",
    "blue",
    "green",
    "amber",
    "default-scaled",
    "blue-scaled",
    "mono-scaled",
];

function coerceSettings(raw: unknown): AppSettings {
    if (!raw || typeof raw !== "object") {
        return defaultSettings;
    }

    const value = raw as Partial<AppSettings>;
    const themePreset = THEME_PRESETS.includes(value.themePreset as ThemePreset)
        ? (value.themePreset as ThemePreset)
        : defaultSettings.themePreset;
    const fullWidthContent =
        typeof value.fullWidthContent === "boolean"
            ? value.fullWidthContent
            : defaultSettings.fullWidthContent;
    // Force dark by default after migration so OpenRune shell styles match expected look.
    const themeMode: ThemeMode = "dark";

    return {
        themePreset,
        fullWidthContent,
        themeMode,
    };
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }): JSX.Element {
    const [settings, setSettings] = React.useState<AppSettings>(defaultSettings);

    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_SETTINGS);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw) as unknown;
            setSettings(coerceSettings(parsed));
        } catch {
            // Ignore malformed storage data.
        }
    }, []);

    React.useEffect(() => {
        try {
            localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
        } catch {
            // Ignore local storage write errors.
        }
    }, [settings]);

    React.useEffect(() => {
        const root = document.documentElement;
        root.classList.remove("light", "dark");
        root.classList.add(settings.themeMode === "light" ? "light" : "dark");
    }, [settings.themeMode]);

    React.useEffect(() => {
        const body = document.body;
        Array.from(body.classList)
            .filter((c) => c.startsWith("theme-"))
            .forEach((c) => body.classList.remove(c));
        body.classList.add(`theme-${settings.themePreset}`);
        body.classList.toggle("theme-scaled", settings.themePreset.endsWith("-scaled"));
        body.classList.toggle("full-width-content", settings.fullWidthContent);
    }, [settings.fullWidthContent, settings.themePreset]);

    const updateSettings = React.useCallback((next: Partial<AppSettings>) => {
        setSettings((prev) => ({
            ...prev,
            ...next,
        }));
    }, []);

    return (
        <SettingsContext.Provider value={{ settings, updateSettings }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings(): SettingsContextValue {
    const context = React.useContext(SettingsContext);
    if (!context) {
        throw new Error("useSettings must be used within SettingsProvider");
    }
    return context;
}
