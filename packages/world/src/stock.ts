import { createRng } from '@game/engine';
import { makeCaravanItem } from './caravan-data.ts';
import { BASES, shopItem } from './loot.ts';
import type { CaravanKind, ShopItem, SiteDef } from './types.ts';

/**
 * What a city sells: its fixed shop plus a rotating selection that changes every day (UTC) and is
 * the same for everyone on that day, so the shop can be rebuilt from the city and the day alone.
 * The rotation brings a few pieces of gear around the city's level and some caravan accessories,
 * which are priced far above normal items.
 */

export const DAY_MS = 86_400_000;
export const dayOf = (now: number): number => Math.floor(now / DAY_MS);

/** Accessories cost this many times their value (normal gear costs 4 times its value). */
export const ACCESSORY_PRICE_FACTOR = 8;
const GEAR_PIECES = 4;
const ACCESSORIES = 3;
const KINDS: readonly CaravanKind[] = ['mount', 'pet', 'bag', 'tent'];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A caravan accessory as a shop entry (its id says kind, tier and day). */
export function accessoryEntry(kind: CaravanKind, tier: number, day: number): ShopItem {
  const it = makeCaravanItem(kind, tier, `acc_${kind}_${tier}_d${day}`);
  return {
    id: it.id,
    name: it.name,
    rarity: it.rarity,
    itemLevel: it.itemLevel,
    bonuses: {},
    value: it.value,
    price: it.value * ACCESSORY_PRICE_FACTOR,
    caravan: it.caravan!,
  };
}

/** The rotating part of a city's stock for one day. */
export function rotatingStock(city: SiteDef, day: number): ShopItem[] {
  const cfg = city.stock;
  if (!cfg) return [];
  const rng = createRng(hash(`${city.id}:${day}`));
  const out: ShopItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < GEAR_PIECES * 3 && out.length < GEAR_PIECES; i++) {
    const base = BASES[rng.int(0, BASES.length - 1)]!;
    // Gear around the city's level, a little above or below, sometimes of better quality.
    const level = Math.max(1, cfg.level + rng.int(-1, 2));
    const roll = rng.int(0, 99);
    const entry = shopItem(
      base.name,
      level,
      roll < 12 ? 'rare' : roll < 55 ? 'uncommon' : 'common',
    );
    const id = `${entry.id}_d${day}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...entry, id });
  }
  for (let i = 0; i < ACCESSORIES; i++) {
    const kind = KINDS[rng.int(0, KINDS.length - 1)]!;
    const tier = rng.int(cfg.tiers[0], cfg.tiers[1]);
    const entry = accessoryEntry(kind, tier, day);
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

/**
 * Everything a city sells on the day of `now`. Without a time only the fixed shop is returned,
 * which is what older callers and tests rely on.
 */
export function cityStock(city: SiteDef, now?: number): ShopItem[] {
  const fixed = city.shop ?? [];
  return now === undefined ? fixed : [...fixed, ...rotatingStock(city, dayOf(now))];
}
