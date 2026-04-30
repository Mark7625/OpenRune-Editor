import type { TextureLoader } from "../rs/texture/TextureLoader";
import type { OverlayFloorType } from "../rs/config/floortype/OverlayFloorType";

function argbInt32ToRgbaImageData(pixels: Int32Array, size: number): ImageData {
    const imageData = new ImageData(size, size);
    const d = imageData.data;
    for (let i = 0; i < pixels.length; i++) {
        const p = pixels[i] | 0;
        const o = i * 4;
        d[o] = (p >> 16) & 0xff;
        d[o + 1] = (p >> 8) & 0xff;
        d[o + 2] = p & 0xff;
        d[o + 3] = (p >>> 24) & 0xff;
    }
    return imageData;
}

/**
 * Rasterize an overlay floor texture for UI swatches. Returns a data URL or null if missing / unsupported.
 */
export function getOverlayTexturePreviewDataUrl(
    textureLoader: TextureLoader,
    overlay: OverlayFloorType,
): string | null {
    if (overlay.textureId < 0) {
        return null;
    }

    const preferred = overlay.textureSize >= 96 ? 128 : 64;
    const sizes = [preferred, preferred === 128 ? 64 : 128, 64];

    for (const size of sizes) {
        try {
            // Match WebGLMapEditorRenderer.initTextureArray: raw texels use brightness **1.0** (linear).
            // OverlayFloorType.textureBrightness is a separate cache field — it is **not** this gamma parameter
            // (passing e.g. 8 here applies pow(rgb, 8) and ruins colors).
            const pixels = textureLoader.getPixelsRgb(overlay.textureId, size, true, 1.0);
            if (pixels.length !== size * size) {
                continue;
            }
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                return null;
            }
            ctx.putImageData(argbInt32ToRgbaImageData(pixels, size), 0, 0);
            return canvas.toDataURL("image/png");
        } catch {
            continue;
        }
    }
    return null;
}

/**
 * Average RGB for an overlay texture raster (0xRRGGBB), or `undefined` when unavailable.
 * Useful when palette matching should follow the texture appearance instead of floor RGB metadata.
 */
export function getOverlayTextureAverageRgb(
    textureLoader: TextureLoader,
    overlay: OverlayFloorType,
): number | undefined {
    if (overlay.textureId < 0) {
        return undefined;
    }
    const preferred = overlay.textureSize >= 96 ? 128 : 64;
    const sizes = [preferred, preferred === 128 ? 64 : 128, 64];
    for (const size of sizes) {
        try {
            const pixels = textureLoader.getPixelsRgb(overlay.textureId, size, true, 1.0);
            if (pixels.length !== size * size) {
                continue;
            }
            let sumR = 0;
            let sumG = 0;
            let sumB = 0;
            let count = 0;
            for (let i = 0; i < pixels.length; i++) {
                const p = pixels[i] | 0;
                const a = (p >>> 24) & 0xff;
                if (a === 0) {
                    continue;
                }
                sumR += (p >> 16) & 0xff;
                sumG += (p >> 8) & 0xff;
                sumB += p & 0xff;
                count++;
            }
            if (count === 0) {
                continue;
            }
            const r = Math.round(sumR / count) & 0xff;
            const g = Math.round(sumG / count) & 0xff;
            const b = Math.round(sumB / count) & 0xff;
            return (r << 16) | (g << 8) | b;
        } catch {
            continue;
        }
    }
    return undefined;
}

/** When true, prefer showing the texture swatch over flat RGB (grey / zero primary color). */
export function overlayRgbShouldDeferToTexture(overlay: OverlayFloorType): boolean {
    const rgb = overlay.getRgb();
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    if (rgb === 0) {
        return true;
    }
    return r === g && g === b;
}
