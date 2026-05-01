import { LoadedCache } from "../../mapviewer/Caches";
import { CacheSystem } from "../../rs/cache/CacheSystem";
import { ComponentDecoder } from "../../rs/config/components/ComponentDecoder";
import { InterfaceType } from "../../rs/config/components/InterfaceType";
import { GameVals } from "../../rs/config/gameval/GameVals";

export class InterfaceViewer {
    loadedCache!: LoadedCache;
    cacheSystem!: CacheSystem;
    gamevals!: GameVals;

    interfaces!: Record<number, InterfaceType>;
    legacy!: Record<number, boolean>;

    constructor(cache: LoadedCache) {
        this.initCache(cache);
        this.load();
    }

    initCache(cache: LoadedCache): void {
        this.loadedCache = cache;
        this.cacheSystem = CacheSystem.fromFiles(cache.type, cache.files);
        this.gamevals = new GameVals(this.cacheSystem);
    }

    load(): void {
        const decoder = new ComponentDecoder(this.cacheSystem, this.gamevals);
        this.interfaces = decoder.load();
        this.legacy = decoder.loadLegacyMap();
    }
}
