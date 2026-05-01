import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
        if (!Number.isFinite(parsedPort) || parsedPort < 1 || parsedPort > 65535) return DEFAULT_TARGET;
        return { ip: url.hostname, port: parsedPort };
    } catch {
        return DEFAULT_TARGET;
    }
}

function parseTargetFromHeaderOrCookie(request: NextRequest, fallback: CacheTarget): CacheTarget {
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

const PAGE_SIZE = 500;
const MAX_ROWS = 100_000;
const PAGE_TIMEOUT_MS = 30_000;

type TablePagePayload = {
    total?: unknown;
    rows?: unknown;
    decoding?: unknown;
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ type: string }> },
): Promise<NextResponse> {
    const { type } = await params;

    const sp = request.nextUrl.searchParams;
    const base = sp.get("base");
    const rev = sp.get("rev");

    if (!base || !rev || !/^\d+$/.test(base) || !/^\d+$/.test(rev)) {
        return NextResponse.json({ error: "Missing or invalid base/rev params" }, { status: 400 });
    }

    const envTarget = parseTargetFromEnv();
    const target = parseTargetFromHeaderOrCookie(request, envTarget);

    const forwardHeaders = new Headers();
    const xCacheType = request.headers.get("x-cache-type");
    if (xCacheType) forwardHeaders.set("x-cache-type", xCacheType);

    const allRows: Record<string, unknown>[] = [];
    let serverTotal = Number.POSITIVE_INFINITY;
    let offset = 0;

    while (offset < serverTotal && allRows.length < MAX_ROWS) {
        const search = new URLSearchParams({
            base,
            rev,
            offset: String(offset),
            limit: String(PAGE_SIZE),
        });

        const upstreamUrl = `http://${target.ip}:${target.port}/diff/config/${encodeURIComponent(type)}/table?${search.toString()}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);

        let data: TablePagePayload;
        try {
            const resp = await fetch(upstreamUrl, {
                headers: forwardHeaders,
                signal: controller.signal,
                cache: "no-store",
            });
            clearTimeout(timeoutId);
            if (!resp.ok) {
                return NextResponse.json({ error: `Upstream error: ${resp.status}` }, { status: 502 });
            }
            data = (await resp.json()) as TablePagePayload;
        } catch (e) {
            clearTimeout(timeoutId);
            return NextResponse.json(
                { error: e instanceof Error ? e.message : "Upstream fetch failed" },
                { status: 502 },
            );
        }

        if (data.decoding) {
            return NextResponse.json({ decoding: true, rows: [], total: 0 });
        }

        if (!Array.isArray(data.rows)) {
            return NextResponse.json({ error: "Unexpected upstream response" }, { status: 502 });
        }

        if (typeof data.total === "number") serverTotal = data.total;

        for (const row of data.rows) allRows.push(row as Record<string, unknown>);

        if (data.rows.length === 0 || data.rows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    return NextResponse.json(
        { rows: allRows, total: allRows.length },
        {
            headers: {
                "Cache-Control": "no-store",
            },
        },
    );
}
