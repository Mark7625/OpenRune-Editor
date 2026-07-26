import type { CacheInfo } from "../cache/CacheInfo";
import { MAP_XTEA_OBSOLETE_FROM_REVISION } from "../cache/map-xtea";
import type { ByteBuffer } from "../io/ByteBuffer";

/** Matches OpenRune-FileStore `EntityOpsLoader.EXTENDED_ENTITY_OPS_REVISION`. */
export const EXTENDED_ENTITY_OPS_REVISION = MAP_XTEA_OBSOLETE_FROM_REVISION;

export function cacheSupportsExtendedEntityOps(info: CacheInfo): boolean {
    return info.game === "oldschool" && info.revision >= EXTENDED_ENTITY_OPS_REVISION;
}

/** Skip opcode 100 — entity sub-ops block (revision 237+ objects). */
export function skipEntitySubOps(buffer: ByteBuffer): void {
    buffer.readUnsignedByte();
    while (true) {
        const subId = buffer.readUnsignedByte() - 1;
        if (subId === -1) {
            break;
        }
        buffer.readString();
    }
}

/** Skip opcode 101 — conditional menu op. */
export function skipEntityConditionalOp(buffer: ByteBuffer): void {
    buffer.readUnsignedByte();
    buffer.readUnsignedShort();
    buffer.readUnsignedShort();
    buffer.readInt();
    buffer.readInt();
    buffer.readString();
}

/** Skip opcode 102 — conditional sub-op. */
export function skipEntityConditionalSubOp(buffer: ByteBuffer): void {
    buffer.readUnsignedByte();
    buffer.readUnsignedShort();
    buffer.readUnsignedShort();
    buffer.readUnsignedShort();
    buffer.readInt();
    buffer.readInt();
    buffer.readString();
}
