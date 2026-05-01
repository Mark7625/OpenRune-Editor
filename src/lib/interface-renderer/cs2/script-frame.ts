import type { Script } from "./Script";

export class ScriptFrame {
  script!: Script;
  pc = 0;
  intLocals: number[] | null = null;
  stringLocals: unknown[] | null = null;
}
