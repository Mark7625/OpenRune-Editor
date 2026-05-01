import type { IndexedSprite } from "./IndexedSprite";

/** Canvas-backed sprite for interface rendering (palette + index buffer). */
export class Sprite {
  offsetX = 0;
  offsetY = 0;
  width = 0;
  height = 0;
  subWidth = 0;
  subHeight = 0;
  averageColor = -1;

  raster: Uint8Array = new Uint8Array(0);
  palette: number[] = [];
  alpha: Uint8Array | null = null;

  loaded = false;

  private _canvas: HTMLCanvasElement | null = null;

  private constructor() {}

  /** Build from cache {@link IndexedSprite} (see {@link preloadInterfaceSprites}). */
  static fromIndexedSprite(indexed: IndexedSprite | null | undefined): Sprite {
    const s = new Sprite();
    if (!indexed || indexed.subWidth <= 0 || indexed.subHeight <= 0 || !indexed.pixels?.length) {
      return s;
    }
    s.offsetX = indexed.xOffset;
    s.offsetY = indexed.yOffset;
    s.subWidth = indexed.subWidth;
    s.subHeight = indexed.subHeight;
    s.width = indexed.width;
    s.height = indexed.height;
    s.averageColor = -1;
    s.raster = indexed.pixels;
    s.palette = Array.from(indexed.palette);
    s.alpha = null;
    s.loaded = true;
    return s;
  }

  toRgba(): Uint8ClampedArray {
    const { subWidth, subHeight, raster, palette, alpha } = this;
    const count = subWidth * subHeight;
    const out = new Uint8ClampedArray(count * 4);
    for (let i = 0; i < count; i++) {
      const color = palette[raster[i]! & 0xff] ?? 0;
      const di = i * 4;
      out[di] = (color >> 16) & 0xff;
      out[di + 1] = (color >> 8) & 0xff;
      out[di + 2] = color & 0xff;
      out[di + 3] = alpha != null ? (alpha[i]! & 0xff) : color === 0 ? 0 : 255;
    }
    return out;
  }

  private getCanvas(): HTMLCanvasElement | null {
    if (this._canvas) return this._canvas;
    if (!this.loaded || this.subWidth <= 0 || this.subHeight <= 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = this.subWidth;
    canvas.height = this.subHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const rgba = new Uint8ClampedArray(this.toRgba());
    ctx.putImageData(new ImageData(rgba, this.subWidth, this.subHeight), 0, 0);
    this._canvas = canvas;
    return canvas;
  }

  drawTransBgAt(ctx: CanvasRenderingContext2D, x: number, y: number, hFlip = false, vFlip = false) {
    const canvas = this.getCanvas();
    if (!canvas) return;
    ctx.imageSmoothingEnabled = false;
    const dx = Math.trunc(x + this.offsetX);
    const dy = Math.trunc(y + this.offsetY);
    const dw = this.subWidth;
    const dh = this.subHeight;

    if (!hFlip && !vFlip) {
      ctx.drawImage(canvas, dx, dy, dw, dh);
      return;
    }
    ctx.save();
    ctx.translate(dx + (hFlip ? dw : 0), dy + (vFlip ? dh : 0));
    ctx.scale(hFlip ? -1 : 1, vFlip ? -1 : 1);
    ctx.drawImage(canvas, 0, 0, dw, dh);
    ctx.restore();
  }

  drawScaledAt(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    hFlip = false,
    vFlip = false,
  ) {
    const canvas = this.getCanvas();
    if (!canvas) return;
    ctx.imageSmoothingEnabled = false;
    let dx = Math.trunc(x);
    let dy = Math.trunc(y);
    let dw = Math.trunc(w);
    let dh = Math.trunc(h);
    if (dw <= 0 || dh <= 0) return;

    const sourceW = this.subWidth;
    const sourceH = this.subHeight;
    const fullW = this.width;
    const fullH = this.height;
    let var7 = 0;
    let var8 = 0;
    const stepX = Math.trunc((fullW << 16) / dw);
    const stepY = Math.trunc((fullH << 16) / dh);
    if (stepX <= 0 || stepY <= 0) return;

    if (this.offsetX > 0) {
      const shift = Math.trunc((stepX + (this.offsetX << 16) - 1) / stepX);
      dx += shift;
      var7 += shift * stepX - (this.offsetX << 16);
    }
    if (this.offsetY > 0) {
      const shift = Math.trunc((stepY + (this.offsetY << 16) - 1) / stepY);
      dy += shift;
      var8 += shift * stepY - (this.offsetY << 16);
    }
    if (sourceW < fullW) {
      dw = Math.trunc((stepX + ((sourceW << 16) - var7) - 1) / stepX);
    }
    if (sourceH < fullH) {
      dh = Math.trunc((stepY + ((sourceH << 16) - var8) - 1) / stepY);
    }
    if (dw <= 0 || dh <= 0) return;

    if (!hFlip && !vFlip) {
      ctx.drawImage(canvas, dx, dy, dw, dh);
      return;
    }
    ctx.save();
    ctx.translate(dx + (hFlip ? dw : 0), dy + (vFlip ? dh : 0));
    ctx.scale(hFlip ? -1 : 1, vFlip ? -1 : 1);
    ctx.drawImage(canvas, 0, 0, dw, dh);
    ctx.restore();
  }

  drawTransAt(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    alpha256: number,
    hFlip = false,
    vFlip = false,
  ) {
    const canvas = this.getCanvas();
    if (!canvas) return;
    ctx.imageSmoothingEnabled = false;
    const prev = ctx.globalAlpha;
    const dx = Math.trunc(x + this.offsetX);
    const dy = Math.trunc(y + this.offsetY);
    const dw = this.subWidth;
    const dh = this.subHeight;
    if (!hFlip && !vFlip) {
      ctx.globalAlpha = Math.min(alpha256, 255) / 255;
      ctx.drawImage(canvas, dx, dy, dw, dh);
      ctx.globalAlpha = prev;
      return;
    }
    ctx.save();
    ctx.globalAlpha = Math.min(alpha256, 255) / 255;
    ctx.translate(dx + (hFlip ? dw : 0), dy + (vFlip ? dh : 0));
    ctx.scale(hFlip ? -1 : 1, vFlip ? -1 : 1);
    ctx.drawImage(canvas, 0, 0, dw, dh);
    ctx.restore();
    ctx.globalAlpha = prev;
  }

  drawTransScaledAt(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    alpha256: number,
    hFlip = false,
    vFlip = false,
  ) {
    const canvas = this.getCanvas();
    if (!canvas) return;
    ctx.imageSmoothingEnabled = false;
    const prev = ctx.globalAlpha;
    let dx = Math.trunc(x);
    let dy = Math.trunc(y);
    let dw = Math.trunc(w);
    let dh = Math.trunc(h);
    if (dw <= 0 || dh <= 0) return;

    const sourceW = this.subWidth;
    const sourceH = this.subHeight;
    const fullW = this.width;
    const fullH = this.height;
    let var8 = 0;
    let var9 = 0;
    const stepX = Math.trunc((fullW << 16) / dw);
    const stepY = Math.trunc((fullH << 16) / dh);
    if (stepX <= 0 || stepY <= 0) return;

    if (this.offsetX > 0) {
      const shift = Math.trunc((stepX + (this.offsetX << 16) - 1) / stepX);
      dx += shift;
      var8 += shift * stepX - (this.offsetX << 16);
    }
    if (this.offsetY > 0) {
      const shift = Math.trunc((stepY + (this.offsetY << 16) - 1) / stepY);
      dy += shift;
      var9 += shift * stepY - (this.offsetY << 16);
    }
    if (sourceW < fullW) {
      dw = Math.trunc((stepX + ((sourceW << 16) - var8) - 1) / stepX);
    }
    if (sourceH < fullH) {
      dh = Math.trunc((stepY + ((sourceH << 16) - var9) - 1) / stepY);
    }
    if (dw <= 0 || dh <= 0) return;

    if (!hFlip && !vFlip) {
      ctx.globalAlpha = Math.min(alpha256, 255) / 255;
      ctx.drawImage(canvas, dx, dy, dw, dh);
      ctx.globalAlpha = prev;
      return;
    }
    ctx.save();
    ctx.globalAlpha = Math.min(alpha256, 255) / 255;
    ctx.translate(dx + (hFlip ? dw : 0), dy + (vFlip ? dh : 0));
    ctx.scale(hFlip ? -1 : 1, vFlip ? -1 : 1);
    ctx.drawImage(canvas, 0, 0, dw, dh);
    ctx.restore();
    ctx.globalAlpha = prev;
  }

  drawRotatedLikeClient(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    angle2d: number,
    scale4096: number,
    hFlip = false,
    vFlip = false,
  ) {
    if (scale4096 === 0) return;
    const units = ((Math.trunc(angle2d) % 65536) + 65536) % 65536;
    const theta = (units * 2 * Math.PI) / 65536;
    const drawW = (this.width * scale4096) / 4096;
    const drawH = (this.height * scale4096) / 4096;
    const x = centerX - drawW / 2;
    const y = centerY - drawH / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(theta);
    ctx.translate(-centerX, -centerY);
    this.drawScaledAt(ctx, x, y, drawW, drawH, hFlip, vFlip);
    ctx.restore();
  }
}
