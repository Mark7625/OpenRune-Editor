const CP1252_EXT = String.fromCharCode(
  0x20ac, 0, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0, 0x17d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0, 0x17e, 0x178,
);

export class Cs2Buffer {
  payload: Uint8Array;
  pos = 0;

  constructor(payload: Uint8Array) {
    this.payload = payload;
  }

  readUnsignedByte(): number {
    return this.payload[this.pos++]! & 0xff;
  }

  readUnsignedShort(): number {
    this.pos += 2;
    return (this.payload[this.pos - 1]! & 255) + ((this.payload[this.pos - 2]! & 255) << 8);
  }

  readInt(): number {
    this.pos += 4;
    return (
      ((this.payload[this.pos - 3]! & 255) << 16)
      + (this.payload[this.pos - 1]! & 255)
      + ((this.payload[this.pos - 2]! & 255) << 8)
      + ((this.payload[this.pos - 4]! & 255) << 24)
    );
  }

  readLong(): bigint {
    const hi = BigInt(this.readInt() >>> 0);
    const lo = BigInt(this.readInt() >>> 0);
    const u64 = (hi << 32n) | lo;
    return BigInt.asIntN(64, u64);
  }

  readStringCp1252NullTerminated(): string {
    const start = this.pos;
    while (this.payload[this.pos++]! !== 0) {
    }
    const len = this.pos - start - 1;
    if (len === 0) return "";
    return decodeStringCp1252(this.payload, start, len);
  }

  static method8302(var0: number): number {
    let v = var0 - 1;
    v |= v >>> 1;
    v |= v >>> 2;
    v |= v >>> 4;
    v |= v >>> 8;
    v |= v >>> 16;
    return v + 1;
  }
}

function decodeStringCp1252(bytes: Uint8Array, offset: number, len: number): string {
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    let c = bytes[offset + i]! & 255;
    if (c === 0) continue;
    if (c >= 128 && c < 160) {
      let ch = CP1252_EXT.charCodeAt(c - 128);
      if (ch === 0) ch = 0x3f;
      c = ch;
    }
    out.push(String.fromCharCode(c));
  }
  return out.join("");
}
