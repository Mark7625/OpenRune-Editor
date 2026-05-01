import { Archive } from "../../../cache/Archive";
import { CacheIndex } from "../../../cache/CacheIndex";
import { CacheInfo } from "../../../cache/CacheInfo";
import {
    ArchiveTypeLoader,
    DatTypeLoader,
    DummyTypeLoader,
    IndexTypeLoader,
    TypeLoader,
} from "../../TypeLoader";
import { VarBitType } from "./VarBitType";

export type VarBitTypeLoader = TypeLoader<VarBitType>;

export class DummyVarBitTypeLoader extends DummyTypeLoader<VarBitType> {
    constructor(cacheInfo: CacheInfo) {
        super(cacheInfo, VarBitType);
    }
}

export class DatVarBitTypeLoader {
    static load(cacheInfo: CacheInfo, configArchive: Archive): VarBitTypeLoader {
        return DatTypeLoader.load(VarBitType, cacheInfo, configArchive, "varbit");
    }
}

export class ArchiveVarBitTypeLoader
    extends ArchiveTypeLoader<VarBitType>
    implements VarBitTypeLoader
{
    constructor(cacheInfo: CacheInfo, archive: Archive) {
        super(VarBitType, cacheInfo, archive);
    }
}

export class IndexVarBitTypeLoader extends IndexTypeLoader<VarBitType> implements VarBitTypeLoader {
    constructor(cacheInfo: CacheInfo, index: CacheIndex) {
        super(VarBitType, cacheInfo, index, 10);
    }
}

/** Packed varbit → varp index + bit span (for CS1/CS2). */
export type VarbitDefinition = {
    baseVar: number;
    startBit: number;
    endBit: number;
};

export type VarbitDefinitionLookup = (varbitId: number) => VarbitDefinition | null;

function normalizeVarbitDefinition(def: VarbitDefinition): VarbitDefinition | null {
    let { baseVar, startBit, endBit } = def;
    if (baseVar < 0 || !Number.isFinite(baseVar)) return null;
    if (!Number.isFinite(startBit) || !Number.isFinite(endBit)) return null;
    if (startBit > endBit) {
        const t = startBit;
        startBit = endBit;
        endBit = t;
    }
    if (startBit < 0 || endBit > 31 || endBit - startBit >= 32) return null;
    return { baseVar: Math.trunc(baseVar), startBit: Math.trunc(startBit), endBit: Math.trunc(endBit) };
}

/** Pre-decode all varbits from a loader into a map (O(1) lookup; no per-frame `load`). */
export function preloadVarbitDefinitions(loader: VarBitTypeLoader): ReadonlyMap<number, VarbitDefinition> {
    const map = new Map<number, VarbitDefinition>();
    const count = loader.getCount();
    for (let i = 0; i < count; i++) {
        let loaded: VarBitType;
        try {
            const t = loader.load(i);
            if (!(t instanceof VarBitType)) continue;
            loaded = t;
        } catch {
            continue;
        }
        const { baseVar, startBit, endBit } = loaded;
        if (typeof baseVar !== "number" || typeof startBit !== "number" || typeof endBit !== "number") {
            continue;
        }
        const norm = normalizeVarbitDefinition({ baseVar, startBit, endBit });
        if (norm) map.set(i, norm);
    }
    return map;
}
