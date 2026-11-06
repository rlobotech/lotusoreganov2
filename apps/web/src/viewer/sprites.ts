import { Assets, Texture } from 'pixi.js';

const cache = new Map<string, Promise<Texture | null>>();

/**
 * Loads `/sprites/<name>.png` if it exists (drop finished 32x32 sprites in apps/web/public/sprites).
 * Returns null when the file is missing so the scene can draw a placeholder instead.
 */
export function loadSprite(name: string): Promise<Texture | null> {
  let hit = cache.get(name);
  if (!hit) {
    hit = (async () => {
      try {
        const res = await fetch(`/sprites/${name}.png`, { method: 'HEAD' });
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || !type.startsWith('image/')) return null;
        return (await Assets.load<Texture>(`/sprites/${name}.png`)) ?? null;
      } catch {
        return null;
      }
    })();
    cache.set(name, hit);
  }
  return hit;
}
