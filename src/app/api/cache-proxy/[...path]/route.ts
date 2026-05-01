import { NextRequest, NextResponse } from "next/server";

type CacheTarget = {
    ip: string;
    port: number;
};

const DEFAULT_TARGET: CacheTarget = {
    ip: "localhost",
    port: 8090,
};

function parseTargetFromEnv(): CacheTarget {
    const raw = process.env.API_PROXY_DESTINATION;
    if (!raw) return DEFAULT_TARGET;

    try {
        const url = new URL(raw);
        const parsedPort = Number(url.port || "8090");
        if (!Number.isFinite(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
            return DEFAULT_TARGET;
        }
        return { ip: url.hostname, port: parsedPort };
    } catch {
        return DEFAULT_TARGET;
    }
}

function parseTargetFromHeaderOrCookie(
    request: NextRequest,
    fallback: CacheTarget,
): CacheTarget {
    const rawHeader = request.headers.get("x-cache-type");
    const rawCookie = request.cookies.get("cache-type")?.value;
    const raw = rawHeader ?? rawCookie;
    if (!raw) return fallback;

    try {
        const parsed = JSON.parse(raw) as Partial<CacheTarget>;
        const ip = typeof parsed.ip === "string" ? parsed.ip.trim() : "";
        const port = Number(parsed.port);
        const validPort = Number.isFinite(port) && port >= 1 && port <= 65535;
        if (!ip || !validPort) return fallback;
        return { ip, port };
    } catch {
        return fallback;
    }
}

function buildDestination(
    request: NextRequest,
    pathParts: string[],
    target: CacheTarget,
): string {
    const path = pathParts.join("/");
    const query = request.nextUrl.searchParams.toString();
    return `http://${target.ip}:${target.port}/${path}${query ? `?${query}` : ""}`;
}

function isZipDownloadPath(pathParts: string[]): boolean {
    return pathParts.length >= 2 && pathParts[0] === "zip" && pathParts[1] === "download";
}

/** Zip routes can take a long time (build + large binary); avoid short proxy aborts. */
function proxyTimeoutMsForPath(pathParts: string[]): number {
    if (pathParts[0] === "zip") {
        return isZipDownloadPath(pathParts) ? 0 : 120_000;
    }
    return 10_000;
}

async function proxyToCache(
    request: NextRequest,
    pathParts: string[],
): Promise<NextResponse> {
    const envTarget = parseTargetFromEnv();
    const target = parseTargetFromHeaderOrCookie(request, envTarget);
    const destination = buildDestination(request, pathParts, target);
    const isStatusRequest = pathParts.join("/") === "status";
    const zipDownload = isZipDownloadPath(pathParts);
    const proxyTimeoutMs = proxyTimeoutMsForPath(pathParts);

    const headers = new Headers(request.headers);
    headers.set("host", `${target.ip}:${target.port}`);
    headers.delete("content-length");

    const controller = proxyTimeoutMs > 0 ? new AbortController() : null;
    const timeoutId =
        controller != null ? setTimeout(() => controller.abort(), proxyTimeoutMs) : null;

    try {
        const body =
            request.method === "GET" || request.method === "HEAD"
                ? undefined
                : await request.arrayBuffer();

        const upstream = await fetch(destination, {
            method: request.method,
            headers,
            body,
            signal: controller?.signal,
            redirect: "manual",
            cache: "no-store",
        });

        if (isStatusRequest && !upstream.ok) {
            return NextResponse.json(
                {
                    status: "ERROR",
                    game: "unknown",
                    revision: 0,
                    environment: "offline",
                    port: target.port,
                    statusMessage: "Cache server returned an error status",
                },
                { status: 200 },
            );
        }

        const status = upstream.status;
        const nullBodyStatus = status === 204 || status === 205 || status === 304;
        if (nullBodyStatus) {
            await upstream.arrayBuffer();
        }

        if (zipDownload && upstream.body && !nullBodyStatus) {
            const response = new NextResponse(upstream.body, {
                status,
                statusText: upstream.statusText,
            });
            upstream.headers.forEach((value, key) => {
                const lower = key.toLowerCase();
                if (!["content-encoding", "transfer-encoding"].includes(lower)) {
                    response.headers.set(key, value);
                }
            });
            return response;
        }

        const responseBody = nullBodyStatus ? null : await upstream.arrayBuffer();
        const response = new NextResponse(responseBody, {
            status,
            statusText: upstream.statusText,
        });

        upstream.headers.forEach((value, key) => {
            const lower = key.toLowerCase();
            if (!["content-encoding", "transfer-encoding", "content-length"].includes(lower)) {
                response.headers.set(key, value);
            }
        });

        return response;
    } catch (error) {
        if (isStatusRequest) {
            return NextResponse.json(
                {
                    status: "ERROR",
                    game: "unknown",
                    revision: 0,
                    environment: "offline",
                    port: target.port,
                    statusMessage: "Cache server is not responding",
                },
                { status: 200 },
            );
        }

        if (
            (error as { name?: string }).name === "AbortError" ||
            (error as { code?: string }).code === "ECONNREFUSED"
        ) {
            return NextResponse.json(
                {
                    error: "Service unavailable",
                    message: "Cache server is not responding",
                },
                { status: 503 },
            );
        }

        return NextResponse.json(
            {
                error: "Gateway error",
                message: error instanceof Error ? error.message : "Unknown proxy error",
            },
            { status: 502 },
        );
    } finally {
        if (timeoutId != null) clearTimeout(timeoutId);
    }
}

async function handler(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> },
) {
    const resolved = await params;
    return proxyToCache(request, resolved.path);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const HEAD = handler;
