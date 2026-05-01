import {
  adaptInterfaceParentsFromApi,
  interfaceParentFromPayload,
  isInterfaceParentPayload,
  registerInterfaceParent,
  type InterfaceParentPayload,
  type InterfaceParentsRaw,
} from "./interface-parent";

export type { InterfaceParentPayload, InterfaceParentsRaw } from "./interface-parent";
export {
  InterfaceParent,
  adaptInterfaceParentsFromApi,
  interfaceParentFromPayload,
  isInterfaceParentPayload,
  parseInterfaceParentsLookup,
  registerInterfaceParent,
} from "./interface-parent";

export type ComponentScriptArg =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | ComponentScriptArg[];

export interface ComponentType {
  v3: boolean;
  type: number;
  buttonType: number;
  clientCode: number;
  x: number;
  y: number;
  width: number;
  height: number;
  tempWidth: number;
  tempHeight: number;
  x1?: number;
  y1?: number;
  field3770?: number;
  field3677?: number;
  trans1: number;
  layer: number;
  mouseOverRedirect: number;
  cs1Comparisons: number[] | null;
  cs1ComparisonValues: number[] | null;
  cs1Instructions: number[][] | null;
  scrollHeight: number;
  hide: boolean;
  fill: boolean;
  textAlignH: number;
  textAlignV: number;
  textLineHeight: number;
  textFont: number;
  textShadow: boolean;
  secondaryText: string;
  colour1: number;
  colour2: number;
  mouseOverColour1: number;
  mouseOverColour2: number;
  graphic: number;
  secondaryGraphic: number;
  modelKind: number;
  model: number;
  secondaryModelKind: number;
  secondaryModel: number;
  modelAnim: number;
  secondaryModelAnim: number;
  modelZoom: number;
  modelAngleX: number;
  modelAngleY: number;
  text: string;
  targetVerb: string;
  targetBase: string;
  events: number;
  buttonText: string;
  widthMode: number;
  heightMode: number;
  xMode: number;
  yMode: number;
  scrollWidth: number;
  noClickThrough: boolean;
  angle2d: number;
  tiling: boolean;
  outline: number;
  graphicShadow: number;
  vFlip: boolean;
  hFlip: boolean;
  modelX: number;
  modelY: number;
  modelAngleZ: number;
  modelOrthog: boolean;
  modelObjWidth: number;
  lineWid: number;
  lineDirection: boolean;
  opBase: string;
  op: string[];
  dragDeadZone: number;
  dragDeadTime: number;
  draggableBehavior: boolean;
  onLoad?: ComponentScriptArg[] | null;
  onMouseOver?: ComponentScriptArg[] | null;
  onMouseLeave?: ComponentScriptArg[] | null;
  onTargetLeave?: ComponentScriptArg[] | null;
  onTargetEnter?: ComponentScriptArg[] | null;
  onVarTransmit?: ComponentScriptArg[] | null;
  onInvTransmit?: ComponentScriptArg[] | null;
  onStatTransmit?: ComponentScriptArg[] | null;
  onTimer?: ComponentScriptArg[] | null;
  onOp?: ComponentScriptArg[] | null;
  onMouseRepeat?: ComponentScriptArg[] | null;
  onClick?: ComponentScriptArg[] | null;
  onClickRepeat?: ComponentScriptArg[] | null;
  onRelease?: ComponentScriptArg[] | null;
  onHold?: ComponentScriptArg[] | null;
  onDrag?: ComponentScriptArg[] | null;
  onDragComplete?: ComponentScriptArg[] | null;
  onScrollWheel?: ComponentScriptArg[] | null;
  onVarTransmitList?: number[] | null;
  onInvTransmitList?: number[] | null;
  onStatTransmitList?: number[] | null;
  packedId: number | null;
  internalName: string | null;
  id: number;
  itemIds?: number[] | null;
  itemQuantities?: number[] | null;
  children?: ComponentType[] | null;
}

export interface InterfaceEntry {
  name: string | null;
  componentCount: number;
  hash: number;
  components: Record<string, ComponentType>;
  interfaceParents?: InterfaceParentsRaw;
}

export function adaptInterfaceEntryFromApi(payload: unknown): InterfaceEntry {
  const entry = payload as InterfaceEntry;
  const { interfaceParents: _rawParents, ...entryWithoutParents } = entry as InterfaceEntry & {
    interfaceParents?: unknown;
  };
  const out: Record<string, ComponentType> = {};
  for (const [key, comp] of Object.entries(entry.components ?? {})) {
    out[key] = adaptComponentPackedIdFromApi(comp);
  }
  const result = { ...entryWithoutParents, components: out } as InterfaceEntry;

  const rawParents = (payload as { interfaceParents?: unknown }).interfaceParents;
  if (rawParents != null && typeof rawParents === "object" && !Array.isArray(rawParents)) {
    for (const [keyStr, val] of Object.entries(rawParents as Record<string, unknown>)) {
      const packed = Number(keyStr);
      if (!Number.isFinite(packed)) continue;
      if (!isInterfaceParentPayload(val)) continue;
      const p = interfaceParentFromPayload(val);
      registerInterfaceParent(result, packed, p.group, p.type, p.field1047);
    }
  }

  return result;
}

function adaptComponentPackedIdFromApi(comp: ComponentType): ComponentType {
  const r = comp as ComponentType & { internalId?: number | null };
  const packedId =
    typeof r.packedId === "number"
      ? r.packedId
      : typeof r.internalId === "number"
        ? r.internalId
        : null;
  const children = Array.isArray(r.children)
    ? r.children.map((ch) => adaptComponentPackedIdFromApi(ch))
    : r.children;
  const next = { ...r, packedId, children } as ComponentType & { internalId?: number | null };
  delete (next as { internalId?: unknown }).internalId;
  return next as ComponentType;
}
