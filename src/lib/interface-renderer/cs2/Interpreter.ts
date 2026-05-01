import type { ComponentType } from "../component-types";
import type { ScriptFrame } from "./script-frame";

export class Interpreter {
  static Interpreter_intStackSize = 0;
  static Interpreter_stringStackSize = 0;
  static Interpreter_intLocals: number[] | null = null;
  static Interpreter_stringLocals: unknown[] | null = null;
  static Interpreter_arrayLengths: number[];
  static Interpreter_arrays: number[][];
  static Interpreter_intStack: number[];
  static Interpreter_stringStack: unknown[];
  static Interpreter_frameDepth = 0;
  static Interpreter_frames: ScriptFrame[];
  static Interpreter_calendar: Date;
  static Interpreter_MONTHS: readonly string[];
  static field846 = false;
  static field842 = false;
  static field847: unknown[] = [];
  static field849 = 0;
  static readonly field852 = Math.log(2.0);
  static mousedOverWidgetIf1: ComponentType | null = null;

  static {
    Interpreter.Interpreter_arrayLengths = new Array(5).fill(0);
    Interpreter.Interpreter_arrays = Array.from({ length: 5 }, () => new Array(5000).fill(0));
    Interpreter.Interpreter_intStack = new Array(1000).fill(0);
    Interpreter.Interpreter_stringStack = new Array(1000).fill(null);
    Interpreter.Interpreter_frameDepth = 0;
    Interpreter.Interpreter_frames = new Array(50);
    Interpreter.Interpreter_calendar = new Date();
    Interpreter.Interpreter_MONTHS = Object.freeze([
      "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]);
    Interpreter.field846 = false;
    Interpreter.field842 = false;
    Interpreter.field847 = [];
    Interpreter.field849 = 0;
  }
}
