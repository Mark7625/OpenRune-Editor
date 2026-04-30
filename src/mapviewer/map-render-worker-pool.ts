import { isWallpaperEngine } from "../util/DeviceUtil";

import { RenderDataWorkerPool } from "./worker/RenderDataWorkerPool";

let pool: RenderDataWorkerPool | undefined;

/** Single pool for map viewer and map editor (only one route mounts at a time). */
export function getMapRenderWorkerPool(): RenderDataWorkerPool {
    if (!pool) {
        pool = RenderDataWorkerPool.create(isWallpaperEngine ? 1 : 4);
    }
    return pool;
}
