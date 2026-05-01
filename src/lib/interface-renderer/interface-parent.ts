export class InterfaceParent {
  group: number;
  type: number;
  field1047: boolean;

  constructor(group: number, type = 0, field1047 = false) {
    this.group = group;
    this.type = type;
    this.field1047 = field1047;
  }

  getId(): number {
    return this.group;
  }

  setId(id: number): void {
    this.group = id;
  }

  getModalMode(): number {
    return this.type;
  }

  setModalMode(modalMode: number): void {
    this.type = modalMode;
  }
}

export type InterfaceParentPayload =
  | number
  | InterfaceParent
  | {
      group: number;
      type?: number;
      field1047?: boolean;
    };

export function interfaceParentFromPayload(value: InterfaceParentPayload): InterfaceParent {
  if (typeof value === "number") {
    return new InterfaceParent(value, 0, false);
  }
  if (value instanceof InterfaceParent) {
    return value;
  }
  return new InterfaceParent(value.group, value.type ?? 0, value.field1047 ?? false);
}

export type InterfaceWithParents = {
  interfaceParents?: InterfaceParentsRaw;
};

export type InterfaceParentsRaw = Record<string, InterfaceParent> | null | undefined;

export function registerInterfaceParent(
  entry: InterfaceWithParents,
  packedRoot: number,
  group: number,
  type: number,
  field1047 = false,
): InterfaceParent {
  const parent = new InterfaceParent(group, type, field1047);
  const prev = entry.interfaceParents;
  const base =
    prev != null && typeof prev === "object" && !Array.isArray(prev) ? { ...prev } : {};
  entry.interfaceParents = { ...base, [String(packedRoot)]: parent };
  return parent;
}

export function isInterfaceParentPayload(v: unknown): v is InterfaceParentPayload {
  if (typeof v === "number" && Number.isFinite(v)) return true;
  if (v instanceof InterfaceParent) return true;
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    typeof (v as { group?: unknown }).group === "number"
  );
}

export function adaptInterfaceParentsFromApi(raw: unknown): InterfaceParentsRaw {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const out: Record<string, InterfaceParent> = {};
  for (const [keyStr, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isInterfaceParentPayload(value)) continue;
    out[keyStr] = interfaceParentFromPayload(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseInterfaceParentsLookup(raw: InterfaceParentsRaw): ReadonlyMap<number, InterfaceParent> | null {
  if (raw == null || typeof raw !== "object") return null;
  const out = new Map<number, InterfaceParent>();
  for (const [keyStr, value] of Object.entries(raw)) {
    const widgetPackedId = Number(keyStr);
    if (!Number.isFinite(widgetPackedId)) continue;
    if (value instanceof InterfaceParent) {
      out.set(widgetPackedId, value);
    }
  }
  return out.size > 0 ? out : null;
}
