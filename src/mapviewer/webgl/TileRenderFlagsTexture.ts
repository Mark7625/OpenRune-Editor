import PicoGL, { App as PicoApp, Texture } from "picogl";

import { Scene } from "../../rs/scene/Scene";

export function createTileRenderFlagsTexture(
    app: PicoApp,
    borderSize: number,
    tileRenderFlagsTextureData: Uint8Array,
): Texture {
    const size = Scene.MAP_SQUARE_SIZE + borderSize * 2;
    return app.createTextureArray(tileRenderFlagsTextureData, size, size, Scene.MAX_LEVELS, {
        internalFormat: PicoGL.R8UI,
        minFilter: PicoGL.NEAREST,
        magFilter: PicoGL.NEAREST,
        type: PicoGL.UNSIGNED_BYTE,
        wrapS: PicoGL.CLAMP_TO_EDGE,
        wrapT: PicoGL.CLAMP_TO_EDGE,
    });
}
