const fs = require("fs");
const path = require("path");

const root = process.cwd();
const frontendDist = path.resolve(root, ".tauri-frontend");
const requiredPaths = [
    path.join(frontendDist, "index.html"),
    path.join(frontendDist, "_next", "static"),
];

const missing = requiredPaths.filter((p) => !fs.existsSync(p));

if (missing.length > 0) {
    const relMissing = missing.map((p) => path.relative(root, p));
    console.error(
        [
            "Tauri frontend assets check failed.",
            "Expected prepared Tauri frontend output in `.tauri-frontend`.",
            "Missing:",
            ...relMissing.map((p) => ` - ${p}`),
            "",
            "Run `npm run build` and then `npm run tauri:build`.",
        ].join("\n"),
    );
    process.exit(1);
}

console.log("Tauri frontend assets verified:", path.relative(root, frontendDist));
