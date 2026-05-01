/** Allowed characters while typing ID search: digits, `+` (two-end range), `-` (within-token range), `,` (union). */
const SPRITE_ID_INPUT_ALLOWED = /[^\d+\-,]/g;

export function sanitizeSpriteIdSearchInput(raw: string): string {
  return raw.replace(SPRITE_ID_INPUT_ALLOWED, "");
}

/** True when the box text is only sprite ID syntax (digits, `+`, `-`, commas, spaces). */
export function looksLikeSpriteIdQueryText(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  return /^[\d+\-,\s]+$/.test(q);
}

function addHyphenOrExactPart(out: Set<number>, part: string) {
  const p = part.trim();
  if (!p) return;
  if (p.includes("-")) {
    const [a, b] = p.split("-").map((s) => Number.parseInt(s.trim(), 10));
    if (!Number.isNaN(a) && !Number.isNaN(b)) {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let i = lo; i <= hi; i += 1) out.add(i);
    }
  } else {
    const n = Number.parseInt(p, 10);
    if (!Number.isNaN(n)) out.add(n);
  }
}

/**
 * Parse ID search into matching numeric ids.
 * - Comma separates **union** groups (`10,90` → ids 10 and 90).
 * - Inside a group, `a+b` with **exactly two** digit-only operands is an **inclusive range** (`10+90` → 10..90).
 * - `+` with three or more digit-only parts is a **union** of those ids (`1+2+3`).
 * - Hyphen inside a token is a range (`10-12`).
 */
export function parseSpriteIdSearchToIds(query: string): number[] {
  const out = new Set<number>();
  const segments = query
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return [];

  for (const segment of segments) {
    const plusParts = segment.split("+").map((s) => s.trim()).filter(Boolean);
    if (
      plusParts.length === 2 &&
      plusParts[0] != null &&
      plusParts[1] != null &&
      plusParts.every((p) => /^\d+$/.test(p))
    ) {
      const a = Number.parseInt(plusParts[0], 10);
      const b = Number.parseInt(plusParts[1], 10);
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        for (let i = lo; i <= hi; i += 1) out.add(i);
      }
      continue;
    }

    for (const part of plusParts) {
      addHyphenOrExactPart(out, part);
    }
  }
  return Array.from(out);
}

/**
 * Match a numeric id against the ID search box.
 * Digits-only query (e.g. `34`) matches any id whose decimal string contains it (`134`, `340`, …).
 * Otherwise uses {@link parseSpriteIdSearchToIds} (comma unions, `a+b` two-end range, `+` lists, `-` ranges).
 */
export function idQueryMatchesNumericId(id: number, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (/^\d+$/.test(q)) {
    return String(id).includes(q);
  }
  const parsed = parseSpriteIdSearchToIds(q);
  if (parsed.length === 0) return false;
  return new Set(parsed).has(id);
}

/** When to show gameval name suggestions under a search input (unified field + toolbar). */
export function isGamevalSuggestPanelOpen(opts: {
  enabled: boolean;
  open: boolean;
  value: string;
  loading: boolean;
  suggestionCount: number;
  loaded: boolean;
}): boolean {
  const { enabled, open, value, loading, suggestionCount, loaded } = opts;
  return (
    enabled &&
    open &&
    value.trim().length > 0 &&
    (loading || suggestionCount > 0 || (loaded && !loading))
  );
}
