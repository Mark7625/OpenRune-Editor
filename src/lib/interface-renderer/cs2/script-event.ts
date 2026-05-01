import type { ComponentType } from "../component-types";

export class ScriptEvent {
  args: unknown[] = [];
  field1054 = false;
  widget: ComponentType | null = null;
  mouseX = 0;
  mouseY = 0;
  opIndex = 0;
  dragTarget: ComponentType | null = null;
  keyTyped = 0;
  keyPressed = 0;
  targetName: string | null = null;
  field1063 = 0;
  type = 76;

  constructor() {
    this.type = 76;
  }

  setArgs(var1: unknown[]): void {
    this.args = var1;
  }

  setType(var1: number): void {
    this.type = var1;
  }

  method2357(var1: ComponentType | null): void {
    this.widget = var1;
  }

  static method2367(_var0: number, _var1: unknown, _var2: boolean): number {
    return 2;
  }
}
