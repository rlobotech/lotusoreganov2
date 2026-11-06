import type { Attributes, Rng } from '@game/engine';
import type { Item, Rarity, ShopItem, Slot } from './types.ts';

export const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3 };
const RARITY_VALUE: Record<Rarity, number> = { common: 1, uncommon: 2.5, rare: 6, epic: 15 };
const RARITY_BONUS: Record<Rarity, number> = { common: 1, uncommon: 1.5, rare: 2.2, epic: 3.2 };
const RARITY_PREFIX: Record<Rarity, string> = {
  common: '',
  uncommon: 'Fine ',
  rare: 'Superior ',
  epic: 'Ancient ',
};

export interface ItemBase {
  name: string;
  slot: Slot;
  /** Gets most of the bonus; `second` gets the rest. */
  main: keyof Attributes;
  second: keyof Attributes;
}

export const BASES: readonly ItemBase[] = [
  { name: 'Rusty Sword', slot: 'weapon', main: 'str', second: 'dex' },
  { name: 'Iron Dagger', slot: 'weapon', main: 'dex', second: 'str' },
  { name: 'Gnarled Staff', slot: 'weapon', main: 'int', second: 'wis' },
  { name: 'Short Bow', slot: 'weapon', main: 'dex', second: 'str' },
  { name: 'Wooden Shield', slot: 'offhand', main: 'vit', second: 'str' },
  { name: 'Spell Tome', slot: 'offhand', main: 'int', second: 'wis' },
  { name: 'Leather Cap', slot: 'head', main: 'vit', second: 'dex' },
  { name: 'Padded Vest', slot: 'body', main: 'vit', second: 'str' },
  { name: 'Cloth Robe', slot: 'body', main: 'wis', second: 'int' },
  { name: 'Worn Boots', slot: 'feet', main: 'dex', second: 'vit' },
  { name: 'Copper Ring', slot: 'ring', main: 'str', second: 'dex' },
  { name: 'Bone Charm', slot: 'charm', main: 'int', second: 'wis' },
];

/** Chance (percent) that one defeated monster drops an item. */
export const DROP_CHANCE = 35;

/** Attribute points an item grants: 70% to its main attribute, the rest to its second. */
export function makeBonuses(
  base: ItemBase,
  itemLevel: number,
  rarity: Rarity,
): Partial<Attributes> {
  const total = Math.max(2, Math.round((itemLevel / 4 + 1) * RARITY_BONUS[rarity]));
  const main = Math.max(1, Math.round(total * 0.7));
  return { [base.main]: main, [base.second]: Math.max(1, total - main) };
}

function itemValue(itemLevel: number, rarity: Rarity): number {
  return Math.max(1, Math.round(itemLevel * 2 * RARITY_VALUE[rarity]));
}

function rollRarity(rng: Rng): Rarity {
  const r = rng.next() * 100;
  if (r < 1) return 'epic';
  if (r < 8) return 'rare';
  if (r < 30) return 'uncommon';
  return 'common';
}

/** Rolls at most one item for a defeated monster. */
export function rollDrop(rng: Rng, monsterLevel: number, id: string): Item | null {
  if (!rng.chance(DROP_CHANCE)) return null;
  const rarity = rollRarity(rng);
  const base = BASES[rng.int(0, BASES.length - 1)]!;
  const itemLevel = Math.max(1, monsterLevel + rng.int(-1, 1));
  return {
    id,
    name: `${RARITY_PREFIX[rarity]}${base.name}`,
    rarity,
    itemLevel,
    value: itemValue(itemLevel, rarity),
    favorite: false,
    slot: base.slot,
    bonuses: makeBonuses(base, itemLevel, rarity),
  };
}

/** Shop stock is not random: the same base, level and rarity always make the same item. */
export function shopItem(baseName: string, itemLevel: number, rarity: Rarity): ShopItem {
  const base = BASES.find((b) => b.name === baseName);
  if (!base) throw new Error(`Unknown item base ${baseName}`);
  const value = itemValue(itemLevel, rarity);
  return {
    id: `${base.name.toLowerCase().replace(/\s+/g, '_')}_${itemLevel}_${rarity}`,
    name: `${RARITY_PREFIX[rarity]}${base.name}`,
    slot: base.slot,
    rarity,
    itemLevel,
    bonuses: makeBonuses(base, itemLevel, rarity),
    value,
    price: value * 4,
  };
}

/** Higher is more worth keeping: rarity first, then item level. */
export const itemScore = (i: Item): number => RARITY_RANK[i.rarity] * 1000 + i.itemLevel;

/**
 * Puts an item in the bag. When the bag is full the lowest-scoring unfavorited item is dropped
 * (or the new item, if it is the worst). Returns what was thrown away, if anything.
 */
export function addToBag(bag: Item[], item: Item, capacity: number): { discarded: Item | null } {
  if (bag.length < capacity) {
    bag.push(item);
    return { discarded: null };
  }
  let worst = -1;
  for (let i = 0; i < bag.length; i++) {
    const it = bag[i]!;
    if (it.favorite) continue;
    if (worst === -1 || itemScore(it) < itemScore(bag[worst]!)) worst = i;
  }
  if (worst === -1 || itemScore(bag[worst]!) >= itemScore(item)) return { discarded: item };
  const [out] = bag.splice(worst, 1, item);
  return { discarded: out! };
}
