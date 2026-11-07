import { createRng } from '@game/engine';
import { makeCaravanItem } from './caravan-data.ts';
import { BASES, shopItem } from './loot.ts';
import type { CaravanKind, ShopItem, SiteDef } from './types.ts';

/**
 * What a city sells: its fixed shop plus a rotating selection that changes every day (UTC) and
 * every time the party gains a level. Levels get slow to earn later on, so a level-up is also a
 * reason for the shop to renew. The selection depends only on the city, the day and the party level,
 * so it can be rebuilt from those three alone.
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
export function accessoryEntry(kind: CaravanKind, tier: number, day: number, level = 0): ShopItem {
  const it = makeCaravanItem(kind, tier, `acc_${kind}_${tier}_d${day}_l${level}`);
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

/** How far the gear a city sells may stray from its own level, to follow the party's level. */
const LEVEL_BELOW = 5;
const LEVEL_ABOVE = 5;

/**
 * The rotating part of a city's stock for one day and one party level. Gear follows the party's
 * level, within a window around the city's own level (a starting town never sells endgame gear).
 */
export function rotatingStock(city: SiteDef, day: number, partyLevel?: number): ShopItem[] {
  const cfg = city.stock;
  if (!cfg) return [];
  const around = Math.max(
    cfg.level - LEVEL_BELOW,
    Math.min(cfg.level + LEVEL_ABOVE, partyLevel ?? cfg.level),
  );
  const tag = `_l${partyLevel ?? 0}`;
  const rng = createRng(hash(`${city.id}:${day}:${partyLevel ?? 0}`));
  const out: ShopItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < GEAR_PIECES * 3 && out.length < GEAR_PIECES; i++) {
    const base = BASES[rng.int(0, BASES.length - 1)]!;
    // Gear around the city's level, a little above or below, sometimes of better quality.
    const level = Math.max(1, around + rng.int(-1, 2));
    const roll = rng.int(0, 99);
    const entry = shopItem(
      base.name,
      level,
      roll < 12 ? 'rare' : roll < 55 ? 'uncommon' : 'common',
    );
    const id = `${entry.id}_d${day}${tag}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...entry, id });
  }
  for (let i = 0; i < ACCESSORIES; i++) {
    const kind = KINDS[rng.int(0, KINDS.length - 1)]!;
    const tier = rng.int(cfg.tiers[0], cfg.tiers[1]);
    const entry = accessoryEntry(kind, tier, day, partyLevel ?? 0);
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

/**
 * Everything a city sells on the day of `now` to a party of `partyLevel`. Without a time only the
 * fixed shop is returned, which is what older callers and tests rely on.
 */
export function cityStock(city: SiteDef, now?: number, partyLevel?: number): ShopItem[] {
  const fixed = city.shop ?? [];
  return now === undefined ? fixed : [...fixed, ...rotatingStock(city, dayOf(now), partyLevel)];
}
