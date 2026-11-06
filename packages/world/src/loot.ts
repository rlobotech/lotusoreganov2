import type { Rng } from '@game/engine';
import type { Item, Rarity } from './types.ts';

export const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3 };
const RARITY_VALUE: Record<Rarity, number> = { common: 1, uncommon: 2.5, rare: 6, epic: 15 };
const RARITY_PREFIX: Record<Rarity, string> = {
  common: '',
  uncommon: 'Fine ',
  rare: 'Superior ',
  epic: 'Ancient ',
};

const BASES = [
  'Rusty Sword',
  'Iron Dagger',
  'Wooden Shield',
  'Leather Cap',
  'Padded Vest',
  'Worn Boots',
  'Gnarled Staff',
  'Short Bow',
  'Cloth Robe',
  'Bone Charm',
  'Copper Ring',
  'Hide Gloves',
];

/** Chance (percent) that one defeated monster drops an item. */
export const DROP_CHANCE = 35;

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
    name: `${RARITY_PREFIX[rarity]}${base}`,
    rarity,
    itemLevel,
    value: Math.max(1, Math.round(itemLevel * 2 * RARITY_VALUE[rarity])),
    favorite: false,
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
