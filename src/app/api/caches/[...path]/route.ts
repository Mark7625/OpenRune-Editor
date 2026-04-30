import { promises as fs } from "fs";
import path from "path";

import { NextResponse } from "next/server";

const CACHE_ROOT = path.join(process.cwd(), "caches");

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".json":
      return "application/json; charset=utf-8";
    case ".dat":
    case ".idx":
      return "application/octet-stream";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _request: Request,
  { params }: { params: { path: string[] } },
) {
  const requestedPath = params.path ?? [];
  const normalizedPath = path.normalize(path.join(...requestedPath));
  const fullPath = path.resolve(CACHE_ROOT, normalizedPath);

  // Prevent path traversal outside the caches directory.
  if (!fullPath.startsWith(path.resolve(CACHE_ROOT))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const data = await fs.readFile(fullPath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": getMimeType(fullPath),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
