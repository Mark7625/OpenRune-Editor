import React from "react";

const STORAGE_SIDEBAR = "app-shell-sidebar-collapsed";

type ShellPreferencesContextValue = {
    sidebarCollapsed: boolean;
    setSidebarCollapsed: (v: boolean) => void;
    toggleSidebarCollapsed: () => void;
};

const ShellPreferencesContext = React.createContext<ShellPreferencesContextValue | null>(null);

export function ShellPreferencesProvider({
    children,
}: {
    children: React.ReactNode;
}): JSX.Element {
    const [sidebarCollapsed, setSidebarCollapsedState] = React.useState(false);

    React.useEffect(() => {
        try {
            setSidebarCollapsedState(localStorage.getItem(STORAGE_SIDEBAR) === "true");
        } catch {
            // Ignore local storage access errors.
        }
    }, []);

    const setSidebarCollapsed = React.useCallback((v: boolean) => {
        setSidebarCollapsedState(v);
        try {
            localStorage.setItem(STORAGE_SIDEBAR, String(v));
        } catch {
            // Ignore local storage write errors.
        }
    }, []);

    const toggleSidebarCollapsed = React.useCallback(() => {
        setSidebarCollapsedState((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(STORAGE_SIDEBAR, String(next));
            } catch {
                // Ignore local storage write errors.
            }
            return next;
        });
    }, []);

    return (
        <ShellPreferencesContext.Provider
            value={{ sidebarCollapsed, setSidebarCollapsed, toggleSidebarCollapsed }}
        >
            {children}
        </ShellPreferencesContext.Provider>
    );
}

export function useShellPreferences(): ShellPreferencesContextValue {
    const ctx = React.useContext(ShellPreferencesContext);
    if (!ctx) {
        throw new Error("useShellPreferences must be used within ShellPreferencesProvider");
    }
    return ctx;
}
