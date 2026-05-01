import type { CacheIndex } from "@/rs/cache/CacheIndex";
import { IndexType } from "@/rs/cache/IndexType";
import { Cs2Buffer } from "./buffer";
import { getCs2RuntimeContext } from "./runtime-context";
import { ScriptOpcodes } from "./ScriptOpcodes";

function int8ArrayToUint8Array(data: Int8Array): Uint8Array {
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** Read raw client script bytes from DAT2 index 12 (same layout as sprites: archive = id, file 0). */
function readClientScriptFromIndex(index: CacheIndex, scriptId: number): Uint8Array | null {
  const tryPair = (archiveId: number, fileId: number): Uint8Array | null => {
    try {
      const f = index.getFile(archiveId, fileId);
      if (f?.data?.length) return int8ArrayToUint8Array(f.data);
    } catch {
      /* missing archive */
    }
    return null;
  };

  const a = tryPair(scriptId, 0);
  if (a) return a;
  const b = tryPair(0, scriptId);
  if (b) return b;
  try {
    const f = index.getFileSmart(scriptId);
    if (f?.data?.length) return int8ArrayToUint8Array(f.data);
  } catch {
    /* getFileSmart throws if layout unknown */
  }
  return null;
}

export type ScriptSwitchTable = Map<number, number>;

export class Script {
  static cachedScripts = new Map<number, Script>();

  cacheKey = 0;
  field974 = "";
  opcodes: number[] = [];
  intOperands: number[] = [];
  stringOperands: (string | null)[] = [];
  longOperands: (bigint | null)[] = [];
  localIntCount = 0;
  localStringCount = 0;
  localLongCount = 0;
  intArgumentCount = 0;
  stringArgumentCount = 0;
  longArgumentCount = 0;
  switches: ScriptSwitchTable[] | null = null;

  private static evictOldestIfNeeded(forInsertId: number): void {
    if (Script.cachedScripts.size < 128 || Script.cachedScripts.has(forInsertId)) return;
    const first = Script.cachedScripts.keys().next().value;
    if (first !== undefined) Script.cachedScripts.delete(first);
  }

  static async getScript(var0: number): Promise<Script | null> {
    const hit = Script.cachedScripts.get(var0);
    if (hit) return hit;

    const { clientScriptIndex } = getCs2RuntimeContext();
    if (!clientScriptIndex) {
      console.warn(
        `[cs2] no client script cache index (DAT2 index ${IndexType.DAT2.clientScript}); cannot load script ${var0}`,
      );
      return null;
    }

    const bytes = readClientScriptFromIndex(clientScriptIndex, var0);
    if (!bytes?.length) {
      console.warn(`[cs2] missing script bytes in cache for id=${var0}`);
      return null;
    }

    try {
      const var1 = Script.newScript(bytes);
      var1.cacheKey = var0;
      Script.evictOldestIfNeeded(var0);
      Script.cachedScripts.set(var0, var1);
      return var1;
    } catch (err) {
      console.error(`[cs2] failed to decode script id=${var0}`, err);
      return null;
    }
  }

  static newScript(var0: Uint8Array): Script {
    const var1 = new Script();
    const var2 = new Cs2Buffer(var0);
    var2.pos = var2.payload.length - 2;
    const var3 = var2.readUnsignedShort();
    const headerSize = 12 + 2 + var3 + 4;
    const var4 = var2.payload.length - headerSize;
    var2.pos = var4;
    const var5 = var2.readInt();
    var1.localIntCount = var2.readUnsignedShort();
    var1.localStringCount = var2.readUnsignedShort();
    var1.localLongCount = var2.readUnsignedShort();
    var1.intArgumentCount = var2.readUnsignedShort();
    var1.stringArgumentCount = var2.readUnsignedShort();
    var1.longArgumentCount = var2.readUnsignedShort();
    const var6 = var2.readUnsignedByte();
    let var7: number;
    let var8: number;
    if (var6 > 0) {
      var1.switches = [];
      for (var7 = 0; var7 < var6; ++var7) {
        var8 = var2.readUnsignedShort();
        const bucket = var8 > 0 ? Cs2Buffer.method8302(var8) : 1;
        const var9 = new Map<number, number>() as ScriptSwitchTable;
        var1.switches.push(var9);
        let rem = var8;
        while (rem-- > 0) {
          const var10 = var2.readInt();
          const var11 = var2.readInt();
          var9.set(var10, var11);
        }
      }
    }

    var2.pos = 0;
    if (var2.payload[var2.pos] === 0) {
      var2.pos++;
      var1.field974 = "";
    } else {
      var1.field974 = var2.readStringCp1252NullTerminated();
    }
    var1.opcodes = new Array(var5);
    var1.intOperands = new Array(var5);
    var1.stringOperands = new Array(var5);
    var1.longOperands = new Array(var5);

    for (var7 = 0; var2.pos < var4; var1.opcodes[var7++] = var8) {
      var8 = var2.readUnsignedShort();
      switch (var8) {
        // PUSH_CONSTANT_STRING
        case ScriptOpcodes.SCONST:
          var1.stringOperands[var7] = var2.readStringCp1252NullTerminated();
          break;

        // PUSH_CONSTANT_LONG
        case ScriptOpcodes.PUSH_CONSTANT_LONG:
          var1.longOperands[var7] = var2.readLong();
          break;

        // 4-byte signed operands (Java decodeOperand style)
        case ScriptOpcodes.ICONST:
        case ScriptOpcodes.GET_VARP:
        case ScriptOpcodes.SET_VARP:
        case ScriptOpcodes.GET_VARBIT:
        case ScriptOpcodes.SET_VARBIT:
        case ScriptOpcodes.GET_VARC_INT:
        case ScriptOpcodes.SET_VARC_INT:
        case ScriptOpcodes.GET_VARC_STRING_OLD:
        case ScriptOpcodes.SET_VARC_STRING_OLD:
        case ScriptOpcodes.GET_VARC_STRING:
        case ScriptOpcodes.SET_VARC_STRING:
        case ScriptOpcodes.GET_VARC_LONG:
        case ScriptOpcodes.SET_VARC_LONG:
        case ScriptOpcodes.GET_VARCLANSETTING:
        case ScriptOpcodes.GET_VARCLAN:
        case ScriptOpcodes.JUMP:
        case ScriptOpcodes.IF_ICMPNE:
        case ScriptOpcodes.IF_ICMPEQ:
        case ScriptOpcodes.IF_ICMPLT:
        case ScriptOpcodes.IF_ICMPGT:
        case ScriptOpcodes.IF_ICMPLE:
        case ScriptOpcodes.IF_ICMPGE:
        case ScriptOpcodes.ILOAD:
        case ScriptOpcodes.ISTORE:
        case ScriptOpcodes.SLOAD:
        case ScriptOpcodes.SSTORE:
        case ScriptOpcodes.LLOAD:
        case ScriptOpcodes.LSTORE:
        case ScriptOpcodes.IF_LCMPNE:
        case ScriptOpcodes.IF_LCMPEQ:
        case ScriptOpcodes.IF_LCMPLT:
        case ScriptOpcodes.IF_LCMPGT:
        case ScriptOpcodes.IF_LCMPLE:
        case ScriptOpcodes.IF_LCMPGE:
        case ScriptOpcodes.JOIN_STRING:
        case ScriptOpcodes.INVOKE:
        case ScriptOpcodes.DEFINE_ARRAY:
        case ScriptOpcodes.GET_ARRAY_INT:
        case ScriptOpcodes.SET_ARRAY_INT:
        case ScriptOpcodes.SWITCH:
          var1.intOperands[var7] = var2.readInt();
          break;

        // Default tiny operand.
        default:
          var1.intOperands[var7] = var2.readUnsignedByte();
          break;
      }
    }

    return var1;
  }
}
