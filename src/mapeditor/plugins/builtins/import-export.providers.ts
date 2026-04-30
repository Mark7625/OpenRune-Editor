import { toast } from "sonner";

import type { ImportExportProvider } from "../types";

export const BUILTIN_IMPORT_EXPORT_PROVIDERS: readonly ImportExportProvider[] = [
    {
        id: "openrune.import.region-package",
        kind: "import",
        name: "Import region package",
        description: "Load region data from a packaged import file.",
        category: "Region",
        run: () => {
            toast.info("Import region package — hook up provider pipeline.");
        },
    },
    {
        id: "openrune.import.heightmap",
        kind: "import",
        name: "Import heightmap",
        description: "Apply terrain heights from an image/heightmap source.",
        category: "Terrain",
        run: () => {
            toast.info("Import heightmap — hook up provider pipeline.");
        },
    },
    {
        id: "openrune.export.region",
        kind: "export",
        name: "Export region",
        description: "Export current region data.",
        category: "Region",
        run: () => {
            toast.info("Export region — hook up provider pipeline.");
        },
    },
    {
        id: "openrune.export.heightmap",
        kind: "export",
        name: "Export heightmap",
        description: "Export terrain heights as a heightmap.",
        category: "Terrain",
        run: () => {
            toast.info("Export heightmap — hook up provider pipeline.");
        },
    },
    {
        id: "openrune.export.share-package",
        kind: "export",
        name: "Package for share",
        description: "Build a portable package for sharing edits.",
        category: "Package",
        run: () => {
            toast.info("Package for share — hook up provider pipeline.");
        },
    },
];
