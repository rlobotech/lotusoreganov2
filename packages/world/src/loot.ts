import {
  armorPoints,
  weaponRange,
  type Attributes,
  type DamageType,
  type Rng,
  type WeaponKind,
} from '@game/engine';
import { caravanBagSlots, makeCaravanItem } from './caravan-data.ts';
import { unlockLevel } from './skill-levels.ts';
import { SKILL_TREE } from './skill-tree.ts';
import { SKILLS } from './skills.ts';
import type { GearStats, Item, Rarity, ShopItem, Slot } from './types.ts';

export const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3 };
const RARITY_VALUE: Record<Rarity, number> = { common: 1, uncommon: 2.5, rare: 6, epic: 15 };
const RARITY_BONUS: Record<Rarity, number> = { common: 1, uncommon: 1.5, rare: 2.2, epic: 3.2 };
/** How much better the damage or resistances of an item are at each rarity. */
const RARITY_GEAR: Record<Rarity, number> = { common: 1, uncommon: 1.1, rare: 1.25, epic: 1.45 };
/** Extra elemental damage of a weapon as a share of its own damage (rare and epic drops). */
const EXTRA_SHARE: Partial<Record<Rarity, number>> = { rare: 0.2, epic: 0.35 };
const RARITY_PREFIX: Record<Rarity, string> = {
  common: '',
  uncommon: 'Fine ',
  rare: 'Superior ',
  epic: 'Ancient ',
};

export const ELEMENTS: readonly DamageType[] = [
  'fire',
  'water',
  'electric',
  'earth',
  'dark',
  'light',
];
const ELEMENT_PREFIX: Partial<Record<DamageType, string>> = {
  fire: 'Flaming ',
  water: 'Frozen ',
  electric: 'Shocking ',
  earth: 'Venomous ',
  dark: 'Cursed ',
  light: 'Radiant ',
};

const PHYSICAL3: DamageType[] = ['cut', 'piercing', 'smash'];
const MAGIC5: DamageType[] = ['fire', 'water', 'electric', 'dark', 'light'];

export interface ItemBase {
  name: string;
  slot: Slot;
  /** Gets most of the bonus; `second` gets the rest. */
  main: keyof Attributes;
  second: keyof Attributes;
  /** Weapons: kind, hands, damage type and damage quality (1 = an average one-handed weapon). */
  weapon?: { kind: WeaponKind; hands: 1 | 2; type: DamageType; quality: number };
  /** Armor: the types it resists, and its share of a full set (head + body + feet + off hand = 1). */
  armor?: { types: DamageType[]; share: number };
  /** The attribute the wearer needs, at 40% of the item level. */
  requires?: keyof Attributes;
}

export const BASES: readonly ItemBase[] = [
  {
    name: 'Rusty Sword',
    slot: 'weapon',
    main: 'str',
    second: 'dex',
    weapon: { kind: 'sword', hands: 1, type: 'cut', quality: 1 },
    requires: 'str',
  },
  {
    name: 'Iron Dagger',
    slot: 'weapon',
    main: 'dex',
    second: 'str',
    weapon: { kind: 'dagger', hands: 1, type: 'piercing', quality: 0.85 },
    requires: 'dex',
  },
  {
    name: 'Iron Axe',
    slot: 'weapon',
    main: 'str',
    second: 'vit',
    weapon: { kind: 'axe', hands: 1, type: 'cut', quality: 1.05 },
    requires: 'str',
  },
  {
    name: 'Oak Mace',
    slot: 'weapon',
    main: 'wis',
    second: 'str',
    weapon: { kind: 'mace', hands: 1, type: 'smash', quality: 0.95 },
    requires: 'wis',
  },
  {
    name: 'Gnarled Staff',
    slot: 'weapon',
    main: 'int',
    second: 'wis',
    weapon: { kind: 'staff', hands: 2, type: 'smash', quality: 0.9 },
    requires: 'int',
  },
  {
    name: 'Short Bow',
    slot: 'weapon',
    main: 'dex',
    second: 'str',
    weapon: { kind: 'bow', hands: 2, type: 'piercing', quality: 1.25 },
    requires: 'dex',
  },
  {
    name: 'War Hammer',
    slot: 'weapon',
    main: 'str',
    second: 'vit',
    weapon: { kind: 'hammer', hands: 2, type: 'smash', quality: 1.4 },
    requires: 'str',
  },
  {
    name: 'Wooden Shield',
    slot: 'offhand',
    main: 'vit',
    second: 'str',
    armor: { types: PHYSICAL3, share: 0.25 },
    requires: 'str',
  },
  {
    name: 'Spell Tome',
    slot: 'offhand',
    main: 'int',
    second: 'wis',
    armor: { types: MAGIC5, share: 0.25 },
  },
  {
    name: 'Leather Cap',
    slot: 'head',
    main: 'vit',
    second: 'dex',
    armor: { types: ['cut', 'piercing', 'earth'], share: 0.2 },
  },
  {
    name: 'Cloth Hood',
    slot: 'head',
    main: 'wis',
    second: 'int',
    armor: { types: MAGIC5, share: 0.2 },
  },
  {
    name: 'Padded Vest',
    slot: 'body',
    main: 'vit',
    second: 'str',
    armor: { types: ['cut', 'piercing', 'earth'], share: 0.4 },
  },
  {
    name: 'Iron Mail',
    slot: 'body',
    main: 'vit',
    second: 'str',
    armor: { types: [...PHYSICAL3, 'blood'], share: 0.4 },
    requires: 'str',
  },
  {
    name: 'Cloth Robe',
    slot: 'body',
    main: 'wis',
    second: 'int',
    armor: { types: MAGIC5, share: 0.4 },
  },
  {
    name: 'Worn Boots',
    slot: 'feet',
    main: 'dex',
    second: 'vit',
    armor: { types: ['cut', 'piercing', 'earth', 'water'], share: 0.15 },
  },
  { name: 'Copper Ring', slot: 'ring', main: 'str', second: 'dex' },
  { name: 'Bone Charm', slot: 'charm', main: 'int', second: 'wis' },
];

export const baseByName = (name: string): ItemBase => {
  const base = BASES.find((b) => b.name === name);
  if (!base) throw new Error(`Unknown item base ${name}`);
  return base;
};

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

/** Combat stats of an item: weapon damage, resistances, requirements, and rolled extra damage. */
export function makeGear(base: ItemBase, itemLevel: number, rarity: Rarity, rng?: Rng): GearStats {
  const gear: GearStats = {};
  if (base.requires) {
    const need = Math.floor(itemLevel * 0.4);
    if (need > 0) gear.requires = { [base.requires]: need };
  }
  if (base.weapon) {
    const w = base.weapon;
    gear.kind = w.kind;
    gear.hands = w.hands;
    gear.weapon = weaponRange(itemLevel, w.type, w.quality * RARITY_GEAR[rarity]);
    const share = EXTRA_SHARE[rarity];
    if (share && rng) {
      const type = ELEMENTS[rng.int(0, ELEMENTS.length - 1)]!;
      const avg = weaponRange(itemLevel, type, w.quality * share);
      gear.extra = [{ type, min: avg.min, max: avg.max }];
    }
  }
  if (base.armor) {
    const points = Math.round(armorPoints(itemLevel) * base.armor.share * RARITY_GEAR[rarity]);
    gear.resist = Object.fromEntries(base.armor.types.map((t) => [t, Math.max(1, points)]));
  }
  return gear;
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

const itemName = (base: ItemBase, rarity: Rarity, gear: GearStats): string =>
  `${RARITY_PREFIX[rarity]}${gear.extra ? (ELEMENT_PREFIX[gear.extra[0]!.type] ?? '') : ''}${base.name}`;

/** Share (percent) of drops that are skill books. */
export const BOOK_CHANCE = 10;

/** A skill book: basic skills are common, advanced ones rare, and book-only ones at least rare. */
export function bookItem(skillId: string, itemLevel: number, id: string): Item {
  const skill = SKILLS[skillId];
  if (!skill) throw new Error(`Unknown skill ${skillId}`);
  const node = SKILL_TREE[skillId];
  const level = node ? unlockLevel(node) : 0;
  const rarity: Rarity =
    node?.bookOnly || level >= 30 ? 'rare' : level >= 10 ? 'uncommon' : 'common';
  return {
    id,
    name: `Book of ${skill.name}`,
    rarity,
    itemLevel,
    value: itemValue(itemLevel, rarity),
    favorite: false,
    teaches: skillId,
  };
}

/** Skills a book dropped at `itemLevel` may teach: higher levels bring more advanced ones. */
function bookPool(itemLevel: number): string[] {
  const reach = 10 + itemLevel;
  return Object.values(SKILL_TREE)
    .filter((n) => SKILLS[n.id] && unlockLevel(n) <= reach)
    .map((n) => n.id);
}

/** Share (percent) of drops that are caravan accessories. Rare: they are mostly quest rewards. */
export const CARAVAN_CHANCE = 1.5;

/** Rolls at most one item for a defeated monster. */
export function rollDrop(rng: Rng, monsterLevel: number, id: string): Item | null {
  if (!rng.chance(DROP_CHANCE)) return null;
  if (rng.chance(CARAVAN_CHANCE)) {
    const kinds = ['mount', 'pet', 'bag', 'tent'] as const;
    // The tier follows the monster level (one per 25 levels), and is sometimes a step lower.
    const tier = Math.max(1, 1 + Math.floor(monsterLevel / 25) - (rng.chance(40) ? 1 : 0));
    return makeCaravanItem(kinds[rng.int(0, kinds.length - 1)]!, tier, id);
  }
  if (rng.chance(BOOK_CHANCE)) {
    const pool = bookPool(monsterLevel);
    return bookItem(pool[rng.int(0, pool.length - 1)]!, Math.max(1, monsterLevel), id);
  }
  const rarity = rollRarity(rng);
  const base = BASES[rng.int(0, BASES.length - 1)]!;
  const itemLevel = Math.max(1, monsterLevel + rng.int(-1, 1));
  const gear = makeGear(base, itemLevel, rarity, rng);
  return {
    id,
    name: itemName(base, rarity, gear),
    rarity,
    itemLevel,
    value: itemValue(itemLevel, rarity),
    favorite: false,
    slot: base.slot,
    bonuses: makeBonuses(base, itemLevel, rarity),
    ...gear,
  };
}

/** Shop stock is not random: the same base, level and rarity always make the same item. */
export function shopItem(baseName: string, itemLevel: number, rarity: Rarity): ShopItem {
  const base = baseByName(baseName);
  const value = itemValue(itemLevel, rarity);
  const gear = makeGear(base, itemLevel, rarity);
  return {
    id: `${base.name.toLowerCase().replace(/\s+/g, '_')}_${itemLevel}_${rarity}`,
    name: itemName(base, rarity, gear),
    slot: base.slot,
    rarity,
    itemLevel,
    bonuses: makeBonuses(base, itemLevel, rarity),
    value,
    price: value * 4,
    ...gear,
  };
}

/** What a new character of a class wears: its kit at common quality and the given level. */
export function starterGear(
  kit: string[],
  memberId: string,
  level: number,
  rarity: Rarity = 'common',
): Partial<Record<Slot, Item>> {
  const worn: Partial<Record<Slot, Item>> = {};
  for (const name of kit) {
    const base = baseByName(name);
    worn[base.slot] = {
      id: `${memberId}_${base.slot}`,
      name: base.name,
      rarity,
      itemLevel: level,
      value: itemValue(level, rarity),
      favorite: false,
      slot: base.slot,
      bonuses: makeBonuses(base, level, rarity),
      ...makeGear(base, level, rarity),
    };
  }
  return worn;
}

/** Higher is more worth keeping: rarity first, then item level. */
export const itemScore = (i: Item): number => RARITY_RANK[i.rarity] * 1000 + i.itemLevel;

/** The party's shared bag capacity: its own size when it has one, else the config default. */
export function bagCapacity(
  p: { bagSize?: number; caravan?: Parameters<typeof caravanBagSlots>[0]['caravan'] },
  cfg: { bagSize: number },
): number {
  return (p.bagSize ?? cfg.bagSize) + caravanBagSlots(p);
}

/** The item a shop entry turns into when bought (or brought by the pet). */
export function itemFromStock(stock: ShopItem, id: string): Item {
  return {
    id,
    name: stock.name,
    rarity: stock.rarity,
    itemLevel: stock.itemLevel,
    value: stock.value,
    favorite: false,
    ...(stock.slot ? { slot: stock.slot } : {}),
    bonuses: { ...stock.bonuses },
    ...gearOf(stock),
    ...(stock.caravan ? { caravan: structuredClone(stock.caravan) } : {}),
  };
}

/**
 * Puts an item in the bag if there is room. Nothing is ever thrown away to make space: a full
 * bag simply does not receive the item, and the caller decides what that means.
 */
export function addToBag(bag: Item[], item: Item, capacity: number): boolean {
  if (bag.length >= capacity) return false;
  bag.push(item);
  return true;
}

/** The combat stats of an item or shop entry, copied so the new item shares nothing with it. */
export function gearOf(s: GearStats): GearStats {
  const { requires, kind, hands, weapon, extra, resist } = s;
  return structuredClone(
    Object.fromEntries(
      Object.entries({ requires, kind, hands, weapon, extra, resist }).filter(
        ([, v]) => v !== undefined,
      ),
    ),
  );
}
