import { Assets, Rectangle, Texture } from 'pixi.js';

const cache = new Map<string, Promise<Texture | null>>();

/** Races and classes that have character art: `<race>_<class>` names are heroes. */
const HERO = /^(human|elf|dwarf|orc)_[a-z]+$/;

/**
 * Where the picture of a unit is. Heroes are in `sprites/characters/` as `<race>_<class>_se.png` (the
 * south-east view the battle scene uses; the west-facing view is the same picture flipped). Any other
 * name (monsters, summons) is `sprites/<name>.png`.
 */
export function spriteUrl(name: string): string {
  return HERO.test(name) ? `/sprites/characters/${name}_se.png` : `/sprites/${name}.png`;
}

/**
 * Loads a unit's sprite (see `spriteUrl`) if it exists (drop finished 32x32 sprites in apps/web/public/sprites).
 * Returns null when the file is missing so the scene can draw a placeholder instead.
 */
export function loadSprite(name: string): Promise<Texture | null> {
  let hit = cache.get(name);
  if (!hit) {
    hit = (async () => {
      try {
        const url = spriteUrl(name);
        const res = await fetch(url, { method: 'HEAD' });
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || !type.startsWith('image/')) return null;
        return (await Assets.load<Texture>(url)) ?? null;
      } catch {
        return null;
      }
    })();
    cache.set(name, hit);
  }
  return hit;
}

/**
 * The arena floor: a sheet of 4 by 4 isometric tiles (`sprites/battle_tiles/<name>.png`, each tile about
 * 30 pixels wide with a diamond top and a little thickness, 1 to 3 pixels apart). Returns the 16
 * tiles as textures, or null when the sheet is missing (the scene then draws its own floor).
 */
export interface TileSet {
  textures: Texture[];
  /** Height of the diamond top in each tile (the rest is the tile's thickness). */
  topHeight: number;
}

const SHEET_COLS = [1, 34, 67, 100];
const SHEET_ROWS = [5, 37, 70, 103];
const TILE_PX_W = 30;
const TILE_PX_H = [22, 23, 23, 23];
const tileSets = new Map<string, Promise<TileSet | null>>();

export function loadTileSet(name: string): Promise<TileSet | null> {
  let hit = tileSets.get(name);
  if (!hit) {
    hit = (async () => {
      try {
        const url = `/sprites/battle_tiles/${name}.png`;
        const res = await fetch(url, { method: 'HEAD' });
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || !type.startsWith('image/')) return null;
        const sheet = await Assets.load<Texture>(url);
        if (!sheet || sheet.width < 131 || sheet.height < 131) return null;
        const textures: Texture[] = [];
        SHEET_ROWS.forEach((y, r) => {
          for (const x of SHEET_COLS) {
            textures.push(
              new Texture({
                source: sheet.source,
                frame: new Rectangle(x, y, TILE_PX_W, TILE_PX_H[r]!),
              }),
            );
          }
        });
        return { textures, topHeight: 16 };
      } catch {
        return null;
      }
    })();
    tileSets.set(name, hit);
  }
  return hit;
}
