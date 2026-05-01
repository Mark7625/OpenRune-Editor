const COMPONENT_TYPE_NAMES: Record<number, string> = {
  0: "Container",
  1: "Inventory",
  2: "Item Grid",
  3: "Rectangle",
  4: "Text",
  5: "Sprite",
  6: "Model",
  7: "Item Text",
  8: "Tooltip",
  9: "Line",
  10: "Unknown10",
  11: "Advanced Container",
  12: "Input",
};

export function componentTypeName(type: number): string {
  return COMPONENT_TYPE_NAMES[type] ?? `Type ${type}`;
}
