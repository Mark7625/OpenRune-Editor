import type { Sprite } from "./sprite";

export class Rasterizer2D {
  ctx: CanvasRenderingContext2D;

  xClipStart = 0;
  yClipStart = 0;
  xClipEnd = 0;
  yClipEnd = 0;

  private _saveDepth = 0;
  private static warnedFontIds = new Set<string>();

  private static snap(value: number): number {
    return Math.round(value);
  }

  private static snapSize(value: number): number {
    return Math.max(0, Math.round(value));
  }

  private static readonly FONT_BY_ID: Record<number, { family: string; sizePx: number }> = {
    494: { family: '"OSRS Plain 11", "OSRS Plain 12", sans-serif', sizePx: 16 },
    495: { family: '"OSRS Plain 12", "OSRS Plain 11", sans-serif', sizePx: 16 },
    496: { family: '"OSRS Bold 12", "OSRS Plain 12", sans-serif', sizePx: 16 },
    497: { family: '"OSRS Quill 8", "OSRS Plain 11", sans-serif', sizePx: 16 },
    645: { family: '"OSRS Quill", "OSRS Plain 11", serif', sizePx: 32 },
    646: { family: '"OSRS Quill Caps", "OSRS Plain 11", serif', sizePx: 64 },
    647: { family: '"OSRS Fairy", "OSRS Plain 11", serif', sizePx: 32 },
    648: { family: '"OSRS Fairy Large", "OSRS Plain 11", serif', sizePx: 64 },
    764: { family: '"OSRS Barbarian Assault", "OSRS Plain 11", sans-serif', sizePx: 32 },
    819: { family: '"OSRS Surok", "OSRS Plain 11", sans-serif', sizePx: 16 },
  };

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.filter = "none";
    const textCtx = this.ctx as CanvasRenderingContext2D & { textRendering?: string; fontKerning?: string };
    textCtx.textRendering = "optimizeSpeed";
    textCtx.fontKerning = "none";
  }

  setClip(x1: number, y1: number, x2: number, y2: number) {
    x1 = Rasterizer2D.snap(x1);
    y1 = Rasterizer2D.snap(y1);
    x2 = Rasterizer2D.snap(x2);
    y2 = Rasterizer2D.snap(y2);
    for (let i = 0; i < this._saveDepth; i++) this.ctx.restore();
    this._saveDepth = 0;

    this.xClipStart = x1;
    this.yClipStart = y1;
    this.xClipEnd = x2;
    this.yClipEnd = y2;

    this.ctx.save();
    this._saveDepth++;
    this.ctx.beginPath();
    this.ctx.rect(x1, y1, x2 - x1, y2 - y1);
    this.ctx.clip();
  }

  expandClip(x1: number, y1: number, x2: number, y2: number) {
    this.setClip(
        Math.min(this.xClipStart, x1),
        Math.min(this.yClipStart, y1),
        Math.max(this.xClipEnd, x2),
        Math.max(this.yClipEnd, y2),
    );
  }

  static toRgb(color: number): string {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return `rgb(${r},${g},${b})`;
  }

  static toRgba(color: number, alpha256: number): string {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const a = Math.min(alpha256, 255) / 255;
    return `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }

  drawHLine(x: number, y: number, len: number, color: number) {
    x = Rasterizer2D.snap(x);
    y = Rasterizer2D.snap(y);
    len = Rasterizer2D.snapSize(len);
    if (y < this.yClipStart || y >= this.yClipEnd) return;
    if (x < this.xClipStart) {
      len -= this.xClipStart - x;
      x = this.xClipStart;
    }
    if (x + len > this.xClipEnd) len = this.xClipEnd - x;
    if (len <= 0) return;
    this.ctx.fillStyle = Rasterizer2D.toRgb(color);
    this.ctx.fillRect(x, y, len, 1);
  }

  drawVLine(x: number, y: number, len: number, color: number) {
    x = Rasterizer2D.snap(x);
    y = Rasterizer2D.snap(y);
    len = Rasterizer2D.snapSize(len);
    if (x < this.xClipStart || x >= this.xClipEnd) return;
    if (y < this.yClipStart) {
      len -= this.yClipStart - y;
      y = this.yClipStart;
    }
    if (y + len > this.yClipEnd) len = this.yClipEnd - y;
    if (len <= 0) return;
    this.ctx.fillStyle = Rasterizer2D.toRgb(color);
    this.ctx.fillRect(x, y, 1, len);
  }

  drawHorizontalLine(x: number, y: number, len: number, color: number): void {
    this.drawHLine(x, y, len, color);
  }

  drawVerticalLine(x: number, y: number, len: number, color: number): void {
    this.drawVLine(x, y, len, color);
  }

  fillRect(x: number, y: number, w: number, h: number, color: number) {
    x = Rasterizer2D.snap(x);
    y = Rasterizer2D.snap(y);
    w = Rasterizer2D.snapSize(w);
    h = Rasterizer2D.snapSize(h);
    this.ctx.fillStyle = Rasterizer2D.toRgb(color);
    this.ctx.fillRect(x, y, w, h);
  }

  fillRectangle(x: number, y: number, w: number, h: number, color: number): void {
    this.fillRect(x, y, w, h, color);
  }

  fillRectAlpha(x: number, y: number, w: number, h: number, color: number, alpha256: number) {
    x = Rasterizer2D.snap(x);
    y = Rasterizer2D.snap(y);
    w = Rasterizer2D.snapSize(w);
    h = Rasterizer2D.snapSize(h);
    this.ctx.fillStyle = Rasterizer2D.toRgba(color, alpha256);
    this.ctx.fillRect(x, y, w, h);
  }

  fillRectGradient(
      x: number,
      y: number,
      w: number,
      h: number,
      colorTop: number,
      colorBottom: number,
  ) {
    x = Rasterizer2D.snap(x);
    y = Rasterizer2D.snap(y);
    w = Rasterizer2D.snapSize(w);
    h = Rasterizer2D.snapSize(h);
    const grad = this.ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, Rasterizer2D.toRgb(colorTop));
    grad.addColorStop(1, Rasterizer2D.toRgb(colorBottom));
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(x, y, w, h);
  }

  fillRectGradientAlpha(
      x: number,
      y: number,
      w: number,
      h: number,
      colorTop: number,
      colorBottom: number,
      alphaTop: number,
      alphaBot: number,
  ) {
    x = Rasterizer2D.snap(x);
    y = Rasterizer2D.snap(y);
    w = Rasterizer2D.snapSize(w);
    h = Rasterizer2D.snapSize(h);
    const grad = this.ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, Rasterizer2D.toRgba(colorTop, alphaTop));
    grad.addColorStop(1, Rasterizer2D.toRgba(colorBottom, alphaBot));
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(x, y, w, h);
  }

  drawRect(x: number, y: number, w: number, h: number, color: number) {
    this.drawHLine(x, y, w, color);
    this.drawHLine(x, y + h - 1, w, color);
    this.drawVLine(x, y, h, color);
    this.drawVLine(x + w - 1, y, h, color);
  }

  drawRectAlpha(x: number, y: number, w: number, h: number, color: number, alpha256: number) {
    x = Rasterizer2D.snap(x);
    y = Rasterizer2D.snap(y);
    w = Rasterizer2D.snapSize(w);
    h = Rasterizer2D.snapSize(h);
    const css = Rasterizer2D.toRgba(color, alpha256);
    this.ctx.fillStyle = css;
    if (y >= this.yClipStart && y < this.yClipEnd) this.ctx.fillRect(x, y, w, 1);
    if (y + h - 1 >= this.yClipStart && y + h - 1 < this.yClipEnd) this.ctx.fillRect(x, y + h - 1, w, 1);
    if (x >= this.xClipStart && x < this.xClipEnd) this.ctx.fillRect(x, y, 1, h);
    if (x + w - 1 >= this.xClipStart && x + w - 1 < this.xClipEnd) this.ctx.fillRect(x + w - 1, y, 1, h);
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, color: number) {
    x1 = Rasterizer2D.snap(x1);
    y1 = Rasterizer2D.snap(y1);
    x2 = Rasterizer2D.snap(x2);
    y2 = Rasterizer2D.snap(y2);
    this.ctx.strokeStyle = Rasterizer2D.toRgb(color);
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(x1 + 0.5, y1 + 0.5);
    this.ctx.lineTo(x2 + 0.5, y2 + 0.5);
    this.ctx.stroke();
  }

  drawThickLine(
      x1: number, y1: number,
      x2: number, y2: number,
      color: number,
      thickness: number,
  ) {
    x1 = Rasterizer2D.snap(x1);
    y1 = Rasterizer2D.snap(y1);
    x2 = Rasterizer2D.snap(x2);
    y2 = Rasterizer2D.snap(y2);
    thickness = Math.max(1, Rasterizer2D.snap(thickness));
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const px = (-dy / len) * (thickness / 2);
    const py = (dx / len) * (thickness / 2);
    this.ctx.fillStyle = Rasterizer2D.toRgb(color);
    this.ctx.beginPath();
    this.ctx.moveTo(x1 + px, y1 + py);
    this.ctx.lineTo(x2 + px, y2 + py);
    this.ctx.lineTo(x2 - px, y2 - py);
    this.ctx.lineTo(x1 - px, y1 - py);
    this.ctx.closePath();
    this.ctx.fill();
  }

  static readonly SCROLL_BAR_BG = 0x23201b;
  static readonly SCROLL_TRACK_MID = 0x4d4233;
  static readonly SCROLL_THUMB_FILL = 0x4D4233;
  static readonly SCROLL_FIELD568 = 0x766654;
  static readonly SCROLL_FIELD567 = 0x231f1a;

  drawScrollBar(
      x: number,
      y: number,
      scrollPos: number,
      viewHeight: number,
      scrollHeight: number,
      sprites: { up: Sprite | null; down: Sprite | null } | null = null,
  ) {
    const var0 = Math.trunc(x);
    const var1 = Math.trunc(y);
    const var2 = scrollPos;
    const var3 = viewHeight;
    const var4 = scrollHeight;

    if (var4 <= var3 || var3 < 33) return;

    const up = sprites?.up ?? null;
    const down = sprites?.down ?? null;
    const cell = 16;
    const trackLen = var3 - 32;

    this.fillRectangle(var0, var1, cell, var3, Rasterizer2D.SCROLL_BAR_BG);

    if (up?.loaded) {
      this._drawScrollBarArrowSprite(up, var0, var1, cell);
    } else {
      this._drawScrollBarArrowFallback(var0, var1, true);
    }

    if (down?.loaded) {
      this._drawScrollBarArrowSprite(down, var0, var3 + var1 - cell, cell);
    } else {
      this._drawScrollBarArrowFallback(var0, var3 + var1 - cell, false);
    }

    this.fillRectangle(var0, var1 + cell, cell, trackLen, Rasterizer2D.SCROLL_TRACK_MID);

    let var5 = Math.trunc((var3 * trackLen) / var4);
    if (var5 < 8) var5 = 8;
    if (var5 > trackLen) var5 = trackLen;
    const denom = var4 - var3;
    const var6 = denom !== 0 ? Math.trunc(((trackLen - var5) * var2) / denom) : 0;

    const thumbY = var6 + var1 + cell;
    this.fillRectangle(var0, thumbY, cell, var5, Rasterizer2D.SCROLL_THUMB_FILL);

    this.drawVerticalLine(var0, thumbY, var5, Rasterizer2D.SCROLL_FIELD568);
    this.drawVerticalLine(var0 + 1, thumbY, var5, Rasterizer2D.SCROLL_FIELD568);
    this.drawHorizontalLine(var0, thumbY, cell, Rasterizer2D.SCROLL_FIELD568);
    this.drawHorizontalLine(var0, thumbY + 1, cell, Rasterizer2D.SCROLL_FIELD568);
    this.drawVerticalLine(var0 + 15, thumbY, var5, Rasterizer2D.SCROLL_FIELD567);
    this.drawVerticalLine(var0 + 14, thumbY + 1, var5 - 1, Rasterizer2D.SCROLL_FIELD567);
    this.drawHorizontalLine(var0, var5 + var6 + var1 + 15, cell, Rasterizer2D.SCROLL_FIELD567);
    this.drawHorizontalLine(var0 + 1, var6 + var5 + var1 + 14, 15, Rasterizer2D.SCROLL_FIELD567);
  }

  private _drawScrollBarArrowSprite(spr: Sprite, cellX: number, cellY: number, cell: number): void {
    if (!spr.loaded || spr.subWidth <= 0 || spr.subHeight <= 0) return;
    const ax = cellX + Math.trunc((cell - spr.subWidth) / 2) - spr.offsetX;
    const ay = cellY + Math.trunc((cell - spr.subHeight) / 2) - spr.offsetY;
    spr.drawTransBgAt(this.ctx, ax, ay);
  }

  private _drawScrollBarArrowFallback(x: number, y: number, up: boolean) {
    this._drawArrow(x, y, 16, up);
  }

  private _drawArrow(x: number, y: number, size: number, up: boolean) {
    const mid = Math.floor(size / 2);
    this.ctx.fillStyle = Rasterizer2D.toRgb(Rasterizer2D.SCROLL_FIELD568);
    this.ctx.beginPath();
    if (up) {
      this.ctx.moveTo(x + mid, y + 4);
      this.ctx.lineTo(x + size - 4, y + size - 4);
      this.ctx.lineTo(x + 4, y + size - 4);
    } else {
      this.ctx.moveTo(x + mid, y + size - 4);
      this.ctx.lineTo(x + size - 4, y + 4);
      this.ctx.lineTo(x + 4, y + 4);
    }
    this.ctx.closePath();
    this.ctx.fill();
  }

  drawText(
      text: string,
      x: number,
      y: number,
      w: number,
      h: number,
      color: number,
      alignH: number,
      alignV: number,
      _shadow: boolean,
      _alpha = 255,
      textLineHeight = 0,
      fontId?: number,
  ) {
    if (!text) return;
    x = Rasterizer2D.snap(x);
    y = Rasterizer2D.snap(y);
    w = Rasterizer2D.snapSize(w);
    h = Rasterizer2D.snapSize(h);
    const base = this._resolveOsrsFont(fontId);
    const effectiveLineH = textLineHeight > 0 ? textLineHeight : base.sizePx;
    const lines = parseTaggedTextRuns(text, color);
    const totalTextHeight = Math.max(1, lines.length) * effectiveLineH;

    let topY = y;
    if (alignV === 1) {
      topY = y + Math.floor((h - totalTextHeight) / 2);
    } else if (alignV === 2) {
      topY = y + h - totalTextHeight;
    }

    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]!;
      const lineWidth = this._measureLineWidth(line, base);
      let tx = x;
      if (alignH === 1) {
        tx = x + Math.floor((w - lineWidth) / 2);
      } else if (alignH === 2) {
        tx = x + (w - lineWidth);
      }
      const baselineY = Rasterizer2D.snap(topY + li * effectiveLineH);

      for (const run of line) {
        if (!run.text) continue;
        this.ctx.font = `${run.italic ? "italic " : ""}${run.bold ? "700 " : ""}${base.sizePx}px ${base.family}`;
        this.ctx.fillStyle = Rasterizer2D.toRgb(run.color);
        const drawX = Rasterizer2D.snap(tx);
        this.ctx.fillText(run.text, drawX, baselineY);

        const runWidth = this.ctx.measureText(run.text).width;
        if (run.underlineColor !== null) {
          this.ctx.fillStyle = Rasterizer2D.toRgb(run.underlineColor);
          this.ctx.fillRect(drawX, baselineY + base.sizePx - 1, Math.max(1, Math.ceil(runWidth)), 1);
        }
        if (run.strikeColor !== null) {
          this.ctx.fillStyle = Rasterizer2D.toRgb(run.strikeColor);
          this.ctx.fillRect(drawX, baselineY + Math.floor(base.sizePx / 2), Math.max(1, Math.ceil(runWidth)), 1);
        }
        tx += runWidth;
      }
    }

    this.ctx.font = `${base.sizePx}px ${base.family}`;
  }

  private _resolveOsrsFont(fontId?: number): { family: string; sizePx: number } {
    const fallback = Rasterizer2D.FONT_BY_ID[494]!;
    if (fontId == null || !Number.isFinite(fontId)) {
      const key = "missing";
      if (!Rasterizer2D.warnedFontIds.has(key)) {
        Rasterizer2D.warnedFontIds.add(key);
        console.warn("[interface-renderer] Missing widget textFont id/size; defaulting to Plain 11 (id 494).");
      }
      return fallback;
    }
    const mapped = Rasterizer2D.FONT_BY_ID[fontId];
    if (mapped) return mapped;
    const key = `unknown-${fontId}`;
    if (!Rasterizer2D.warnedFontIds.has(key)) {
      Rasterizer2D.warnedFontIds.add(key);
      console.warn(`[interface-renderer] Unknown widget textFont id ${fontId}; defaulting to Plain 11 (id 494).`);
    }
    return fallback;
  }

  private _measureLineWidth(line: TextRun[], base: { family: string; sizePx: number }): number {
    let total = 0;
    for (const run of line) {
      this.ctx.font = `${run.italic ? "italic " : ""}${run.bold ? "700 " : ""}${base.sizePx}px ${base.family}`;
      total += this.ctx.measureText(run.text).width;
    }
    return total;
  }

  restoreAll() {
    for (let i = 0; i < this._saveDepth; i++) this.ctx.restore();

    this._saveDepth = 0;
  }
}

type TextRun = {
  text: string;
  color: number;
  underlineColor: number | null;
  strikeColor: number | null;
  bold: boolean;
  italic: boolean;
};

function parseTaggedTextRuns(input: string, defaultColor: number): TextRun[][] {
  const lines: TextRun[][] = [[]];
  let color = defaultColor;
  let underlineColor: number | null = null;
  let strikeColor: number | null = null;
  let bold = false;
  let italic = false;

  const pushText = (value: string) => {
    if (!value) return;
    lines[lines.length - 1]!.push({ text: value, color, underlineColor, strikeColor, bold, italic });
  };

  const parts = input.match(/<[^>]*>|[^<]+/g) ?? [];
  for (const part of parts) {
    if (!part.startsWith("<") || !part.endsWith(">")) {
      pushText(part);
      continue;
    }

    const tag = part.slice(1, -1).trim().toLowerCase();
    if (tag === "br") {
      lines.push([]);
      continue;
    }
    if (tag === "lt") {
      pushText("<");
      continue;
    }
    if (tag === "gt") {
      pushText(">");
      continue;
    }

    if (tag.startsWith("col=")) {
      const parsed = parseHexColor(tag.slice(4));
      if (parsed !== null) color = parsed;
      continue;
    }
    if (tag === "/col") {
      color = defaultColor;
      continue;
    }

    if (tag === "u") {
      underlineColor = color;
      continue;
    }
    if (tag.startsWith("u=")) {
      underlineColor = parseHexColor(tag.slice(2)) ?? color;
      continue;
    }
    if (tag === "/u") {
      underlineColor = null;
      continue;
    }

    if (tag === "str") {
      strikeColor = color;
      continue;
    }
    if (tag.startsWith("str=")) {
      strikeColor = parseHexColor(tag.slice(4)) ?? color;
      continue;
    }
    if (tag === "/str") {
      strikeColor = null;
      continue;
    }

    if (tag === "b") {
      bold = true;
      continue;
    }
    if (tag === "/b") {
      bold = false;
      continue;
    }
    if (tag === "i") {
      italic = true;
      continue;
    }
    if (tag === "/i") {
      italic = false;
      continue;
    }
  }

  return lines;
}

function parseHexColor(value: string): number | null {
  const clean = value.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  const parsed = Number.parseInt(clean, 16);
  return Number.isFinite(parsed) ? parsed : null;
}
