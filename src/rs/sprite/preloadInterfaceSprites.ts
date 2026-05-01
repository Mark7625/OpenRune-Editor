import type { CacheIndex } from "../cache/CacheIndex";
import { SpriteLoader } from "./SpriteLoader";
import { Sprite } from "./InterfaceCanvasSprite";

/** Decode every sprite archive id in the index into {@link Sprite} instances (interface viewer startup). */
export function preloadInterfaceSprites(spriteIndex: CacheIndex): ReadonlyMap<number, Sprite> {
  const map = new Map<number, Sprite>();
  for (const id of spriteIndex.getArchiveIds()) {
    const indexed = SpriteLoader.loadIntoIndexedSprite(spriteIndex, id);
    const s = Sprite.fromIndexedSprite(indexed);
    if (s.loaded) map.set(id, s);
  }
  return map;
}
