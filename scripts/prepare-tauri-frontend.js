const fs = require("fs");
const path = require("path");

const root = process.cwd();
const nextAppDir = path.join(root, ".next", "server", "app");
const nextStaticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");
const outDir = path.join(root, ".tauri-frontend");

function ensureExists(p, label) {
    if (!fs.existsSync(p)) {
        throw new Error(`${label} not found: ${path.relative(root, p)}`);
    }
}

function resetDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
    fs.cpSync(src, dest, { recursive: true, force: true });
}

function copyPublicDirWithoutHtmlTemplate(src, dest) {
    if (!fs.existsSync(src)) {
        return;
    }
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyPublicDirWithoutHtmlTemplate(srcPath, destPath);
            continue;
        }
        // Keep Next app entrypoint from `.next/server/app/index.html`.
        if (entry.name.toLowerCase() === "index.html") {
            continue;
        }
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
    }
}

try {
    ensureExists(nextAppDir, "Next app output");
    ensureExists(nextStaticDir, "Next static output");

    resetDir(outDir);

    // Copy prerendered app html structure (includes root index.html).
    copyDir(nextAppDir, outDir);

    // Tauri expects static assets relative to frontendDist root.
    const outNextDir = path.join(outDir, "_next");
    fs.mkdirSync(outNextDir, { recursive: true });
    copyDir(nextStaticDir, path.join(outNextDir, "static"));

    // Keep public assets available (icons, images, etc.).
    copyPublicDirWithoutHtmlTemplate(publicDir, outDir);

    const indexHtml = path.join(outDir, "index.html");
    ensureExists(indexHtml, "Tauri frontend entry");

    console.log("Prepared Tauri frontend:", path.relative(root, outDir));
} catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
}
