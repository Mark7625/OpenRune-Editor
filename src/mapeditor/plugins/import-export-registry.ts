import type { ImportExportProvider, ImportExportProviderKind } from "./types";

const providers = new Map<string, ImportExportProvider>();

export function registerImportExportProvider(provider: ImportExportProvider): void {
    providers.set(provider.id, provider);
}

export function listImportExportProviders(kind?: ImportExportProviderKind): readonly ImportExportProvider[] {
    const all = Array.from(providers.values());
    const filtered = kind ? all.filter((p) => p.kind === kind) : all;
    return filtered.sort((a, b) => {
        const aCat = (a.category ?? "General").toLowerCase();
        const bCat = (b.category ?? "General").toLowerCase();
        if (aCat !== bCat) {
            return aCat.localeCompare(bCat);
        }
        return a.name.localeCompare(b.name);
    });
}

export function getImportExportProvider(id: string): ImportExportProvider | undefined {
    return providers.get(id);
}
