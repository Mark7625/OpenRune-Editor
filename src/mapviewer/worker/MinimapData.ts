import { CacheInfo } from "../../rs/cache/CacheInfo";
import { MapImageRenderer } from "../../rs/map/MapImageRenderer";
import { Scene } from "../../rs/scene/Scene";

export type MinimapData = {
    mapX: number;
    mapY: number;
    level: number;
    cacheInfo: CacheInfo;

    minimapBlob: Blob;
};

/** Encode HD minimap Int32 pixels and crop the editor border to a PNG/WebP blob. */
export async function minimapHdPixelsToBlob(
    minimapPixels: Int32Array,
    sceneSizeX: number,
    sceneSizeY: number,
    borderSize: number,
): Promise<Blob> {
    const scratch = new Int32Array(minimapPixels);
    const minimapView = new DataView(scratch.buffer);
    for (let i = 0; i < scratch.length; i++) {
        minimapView.setUint32(i * 4, (scratch[i] << 8) | 0xff);
    }

    const widthExclBorder = (sceneSizeX - borderSize * 2) * 4;
    const heightExclBorder = (sceneSizeY - borderSize * 2) * 4;
    const canvas = new OffscreenCanvas(widthExclBorder, heightExclBorder);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Could not get canvas context");
    }

    const pixelWidth = sceneSizeX * 4;
    const pixelHeight = sceneSizeY * 4;
    const imageData = new ImageData(pixelWidth, pixelHeight);
    imageData.data.set(new Uint8ClampedArray(scratch.buffer));

    ctx.putImageData(imageData, -borderSize * 4, -borderSize * 4);

    return canvas.convertToBlob();
}

export async function loadMinimapBlob(
    mapImageRenderer: MapImageRenderer,
    scene: Scene,
    level: number,
    borderSize: number,
    drawMapFunctions: boolean,
    renderSd: boolean = false,
): Promise<Blob> {
    const minimapPixels = renderSd
        ? mapImageRenderer.renderMinimap(scene, level)
        : mapImageRenderer.renderMinimapHd(scene, level, drawMapFunctions);
    return minimapHdPixelsToBlob(minimapPixels, scene.sizeX, scene.sizeY, borderSize);
}
