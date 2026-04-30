/** Max segments passed to highlight fragment shader (shared edges counted twice → interior dropped). */
export const OVERLAY_MESH_BOUNDARY_SEG_MAX = 48;

type Tri6 = readonly [number, number, number, number, number, number];

const Q = 1e6;

function q(n: number): number {
    return Math.round(n * Q);
}

function edgeKey(ax: number, ay: number, bx: number, by: number): string {
    const x0 = q(ax);
    const y0 = q(ay);
    const x1 = q(bx);
    const y1 = q(by);
    if (x0 < x1 || (x0 === x1 && y0 < y1)) {
        return `${x0},${y0}|${x1},${y1}`;
    }
    return `${x1},${y1}|${x0},${y0}`;
}

/**
 * Undirected boundary edges of a 2D triangle soup in overlay UV space (only edges incident to one triangle).
 */
export function overlayMeshBoundarySegments(tris: ReadonlyArray<Tri6>): [number, number, number, number][] {
    const counts = new Map<string, number>();
    const coords = new Map<string, [number, number, number, number]>();

    const addEdge = (ax: number, ay: number, bx: number, by: number) => {
        const k = edgeKey(ax, ay, bx, by);
        counts.set(k, (counts.get(k) ?? 0) + 1);
        if (!coords.has(k)) {
            coords.set(k, [ax, ay, bx, by]);
        }
    };

    for (const t of tris) {
        const x0 = t[0]!;
        const y0 = t[1]!;
        const x1 = t[2]!;
        const y1 = t[3]!;
        const x2 = t[4]!;
        const y2 = t[5]!;
        addEdge(x0, y0, x1, y1);
        addEdge(x1, y1, x2, y2);
        addEdge(x2, y2, x0, y0);
    }

    const out: [number, number, number, number][] = [];
    for (const [k, c] of counts) {
        if (c === 1) {
            const seg = coords.get(k);
            if (seg) {
                out.push(seg);
            }
        }
    }
    return out;
}

/**
 * Removes boundary segments whose two sides both lie in `paintedWorldKeys` (adjacent selected
 * world tiles), leaving only edges on the outer perimeter of the selection.
 */
export function filterBoundarySegmentsToSelectionOutline(
    segs: ReadonlyArray<readonly [number, number, number, number]>,
    worldTileOriginX: number,
    worldTileOriginY: number,
    paintedWorldKeys: Set<string>,
    worldTileKey: (wx: number, wy: number) => string,
): [number, number, number, number][] {
    const delta = 0.22;
    const out: [number, number, number, number][] = [];
    for (const seg of segs) {
        const ax = seg[0]!;
        const ay = seg[1]!;
        const bx = seg[2]!;
        const by = seg[3]!;
        const mx = (ax + bx) * 0.5;
        const my = (ay + by) * 0.5;
        let tx = bx - ax;
        let ty = by - ay;
        const len = Math.hypot(tx, ty);
        if (len < 1e-9) {
            continue;
        }
        tx /= len;
        ty /= len;
        const nx = -ty;
        const ny = tx;
        const wxp = Math.floor(worldTileOriginX + mx + nx * delta);
        const wyp = Math.floor(worldTileOriginY + my + ny * delta);
        const wxm = Math.floor(worldTileOriginX + mx - nx * delta);
        const wym = Math.floor(worldTileOriginY + my - ny * delta);
        const k1 = worldTileKey(wxp, wyp);
        const k2 = worldTileKey(wxm, wym);
        if (k1 !== k2 && paintedWorldKeys.has(k1) && paintedWorldKeys.has(k2)) {
            continue;
        }
        out.push([ax, ay, bx, by]);
    }
    return out;
}
