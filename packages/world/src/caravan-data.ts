import type { CaravanInfo, CaravanKind, Item, PartyState, PetAbility, Rarity } from './types.ts';

/**
 * Tier tables of the caravan accessories (see PLAN.md, "Draft tier tables"). Five tiers each; the
 * numbers are starting points to balance later.
 */
export const MAX_TIER = 5;

/** Share of its buying price the pet sells for. The city sells at 25%, a pet starts lower (20%). */
export const PET_SALE_RATE = [0.2, 0.25, 0.3, 0.4, 0.5] as const;
/** How many items the pet carries out to sell. */
export const PET_BAG = [10, 15, 20, 30, 40] as const;
/** Pet speed: how much shorter its trips are (1 = as fast as the party's own travel). */
export const PET_SPEED = [1, 1.1, 1.25, 1.5, 2] as const;
/** Extra world map speed of the mount. */
export const MOUNT_SPEED = [0.1, 0.2, 0.3, 0.4, 0.5] as const;
/** Extra shared bag slots of the bag item. */
export const BAG_SLOTS = [5, 10, 15, 20, 30] as const;
/** Faster recovery with the tent. */
export const TENT_HEAL = [0.25, 0.5, 0.75, 1, 1.5] as const;

export const TIER_RARITY: Rarity[] = ['uncommon', 'uncommon', 'rare', 'rare', 'epic'];

export const CARAVAN_NAMES: Record<CaravanKind, readonly string[]> = {
  mount: ['Old Nag', 'Riding Pony', 'Steady Horse', 'Warhorse', 'Dire Stag'],
  pet: ['Stray Dog', 'Pack Donkey', 'Trained Hound', 'War Mule', 'Dire Wolf'],
  bag: ['Canvas Satchel', 'Travel Pack', 'Deep Haversack', 'Wayfarer Pack', 'Bag of Holding'],
  tent: ['Patched Tent', 'Canvas Tent', 'Cozy Tent', 'Fine Pavilion', 'Royal Pavilion'],
};

/** Pets of tier 3 have one ability, tier 5 both. */
export function petAbilities(tier: number): PetAbility[] {
  return tier >= 5 ? ['scavenger', 'swift'] : tier >= 3 ? ['scavenger'] : [];
}

const clampTier = (tier: number) => Math.max(1, Math.min(MAX_TIER, Math.round(tier)));
const at = <T>(table: readonly T[], tier: number): T => table[clampTier(tier) - 1]!;

export function makeCaravanItem(kind: CaravanKind, tier: number, id: string): Item {
  const t = clampTier(tier);
  const info: CaravanInfo = { kind, tier: t };
  if (kind === 'pet') {
    const abilities = petAbilities(t);
    if (abilities.length) info.abilities = abilities;
  }
  return {
    id,
    name: CARAVAN_NAMES[kind][t - 1]!,
    rarity: at(TIER_RARITY, t),
    itemLevel: t * 10,
    value: 40 * t * t,
    favorite: false,
    caravan: info,
  };
}

const tierOf = (p: Pick<PartyState, 'caravan'>, kind: CaravanKind): number =>
  p.caravan?.[kind]?.caravan?.tier ?? 0;

/** Extra shared bag slots from the bag item. */
export const caravanBagSlots = (p: Pick<PartyState, 'caravan'>): number =>
  tierOf(p, 'bag') ? at(BAG_SLOTS, tierOf(p, 'bag')) : 0;
/** Extra world map speed from the mount, as a fraction (0.1 = 10% faster). */
export const mountSpeed = (p: Pick<PartyState, 'caravan'>): number =>
  tierOf(p, 'mount') ? at(MOUNT_SPEED, tierOf(p, 'mount')) : 0;
/** Faster recovery from the tent, as a fraction. */
export const tentHealing = (p: Pick<PartyState, 'caravan'>): number =>
  tierOf(p, 'tent') ? at(TENT_HEAL, tierOf(p, 'tent')) : 0;
export const petTier = (p: Pick<PartyState, 'caravan'>): number => tierOf(p, 'pet');
export const petBag = (tier: number): number => at(PET_BAG, tier);
export const petSaleRate = (tier: number): number => at(PET_SALE_RATE, tier);
export const petSpeed = (tier: number): number => at(PET_SPEED, tier);

/** What the pet sells an item for: the item's value is 25% of its price, the pet's rate is of the price. */
export const petSalePrice = (item: Pick<Item, 'value'>, tier: number): number =>
  Math.floor((item.value * petSaleRate(tier)) / 0.25);

/** Splits `amount` evenly over `count` shares, rounded down; the remainder goes to the first. */
export function evenShares(count: number, amount: number): number[] {
  if (count <= 0) return [];
  const each = Math.floor(Math.max(0, amount) / count);
  const out = Array.from({ length: count }, () => each);
  out[0]! += Math.max(0, amount) - each * count;
  return out;
}
