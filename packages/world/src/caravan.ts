import { createRng } from '@game/engine';
import type { ActionResult } from './actions.ts';
import {
  caravanBagSlots,
  evenShares,
  petBag,
  petSalePrice,
  petSpeed,
  petTier,
} from './caravan-data.ts';
import { payWithShares } from './gold.ts';
import { cityStock } from './stock.ts';
import { hexDistance } from './hex.ts';
import { addToBag, bagCapacity, itemFromStock, rollDrop } from './loot.ts';
import type {
  CaravanKind,
  Item,
  PartyState,
  PetTrip,
  ShopItem,
  SimConfig,
  SiteDef,
  WorldDef,
} from './types.ts';
import { CARAVAN_KINDS } from './types.ts';

/**
 * The caravan: accessories the whole party shares (mount, carrier pet, bag item, tent) and the
 * pet's trips to the nearest city. Effects of the other three are applied where they matter:
 * `bagCapacity` (bag item), travel time in the sim (mount) and rest time (tent).
 */

const fail = (code: string, error: string): ActionResult => ({ ok: false, code, error });
const OK: ActionResult = { ok: true };

/** Most things the pet can be asked to buy in one trip. */
export const MAX_SHOPPING = 20;

export const petIsOut = (p: Pick<PartyState, 'pet'>): boolean => !!p.pet?.trip;

// ---------- equipping ----------

/** Equips an accessory from the shared bag, swapping with the one worn. */
export function equipCaravan(
  p: PartyState,
  itemId: string,
  cfg: Pick<SimConfig, 'bagSize'>,
): ActionResult {
  const item = p.bag.find((i) => i.id === itemId);
  if (!item) return fail('no_item', 'That item is not in the shared bag');
  if (!item.caravan) return fail('not_caravan', 'That is not a caravan accessory');
  const kind = item.caravan.kind;
  if (kind === 'pet' && (petIsOut(p) || p.pet?.waiting.length)) {
    return fail('pet_out', 'The pet is busy');
  }
  const old = p.caravan?.[kind];
  const remaining = p.bag.filter((i) => i !== item);
  const after = old ? [...remaining, old] : remaining;
  if (kind === 'bag') {
    const cap = (p.bagSize ?? cfg.bagSize) + caravanBagSlots({ caravan: { bag: item } });
    if (after.length > cap) return fail('bag_in_use', 'Free some bag slots first');
  }
  p.bag = after;
  (p.caravan ??= {})[kind] = item;
  return OK;
}

/** Takes an accessory off and puts it in the shared bag. */
export function unequipCaravan(
  p: PartyState,
  kind: CaravanKind,
  cfg: Pick<SimConfig, 'bagSize'>,
): ActionResult {
  if (!CARAVAN_KINDS.includes(kind)) return fail('bad_slot', 'Unknown accessory slot');
  const item = p.caravan?.[kind];
  if (!item) return fail('empty_slot', 'Nothing is equipped there');
  if (kind === 'pet' && (petIsOut(p) || p.pet?.waiting.length)) {
    return fail('pet_out', 'The pet is busy');
  }
  if (p.bag.length + 1 > bagCapacity(p, cfg)) return fail('bag_full', 'The bag is full');
  if (kind === 'bag' && p.bag.length + 1 > (p.bagSize ?? cfg.bagSize)) {
    return fail('bag_in_use', 'Free some bag slots first');
  }
  delete p.caravan![kind];
  p.bag.push(item);
  return OK;
}

// ---------- the pet's trips ----------

/** The nearest city that has a shop. */
export function nearestShopCity(world: WorldDef, from: PartyState['pos']): SiteDef | null {
  let best: SiteDef | null = null;
  let bestDist = Infinity;
  for (const site of Object.values(world.sites)) {
    if (site.kind !== 'city' || !(site.shop?.length || site.stock)) continue;
    const d = hexDistance(from, site);
    if (d < bestDist) {
      best = site;
      bestDist = d;
    }
  }
  return best;
}

export interface PetQuote {
  cityId: string;
  /** The shop the pet shops in: the same as the city's. */
  stock: ShopItem[];
  /** One way, in ticks. */
  ticks: number;
}

export function petQuote(
  p: PartyState,
  world: WorldDef,
  cfg: SimConfig,
  now?: number,
): PetQuote | null {
  const city = nearestShopCity(world, p.pos);
  const tier = petTier(p);
  if (!city || !tier) return null;
  const ticks = Math.max(
    3,
    Math.ceil((hexDistance(p.pos, city) * cfg.travelTicksPerHex) / petSpeed(tier)),
  );
  return { cityId: city.id, stock: cityStock(city, now, p.level), ticks };
}

/**
 * Sends the pet to the nearest city with items to sell and a shopping list (shop stock ids). The
 * sale is shared evenly among all characters, and each player's share can pay for what that player
 * asked for; the rest of the cost comes from the gold the player could spend in the city. Everything
 * is settled now, the goods arrive with the pet.
 */
export function sendPet(
  p: PartyState,
  world: WorldDef,
  cfg: SimConfig,
  itemIds: string[],
  stockIds: string[],
  now: number,
  viewer?: string,
): ActionResult {
  const tier = petTier(p);
  if (!tier) return fail('no_pet', 'The party has no carrier pet');
  if (petIsOut(p)) return fail('pet_out', 'The pet is already out on a trip');
  const quote = petQuote(p, world, cfg, now);
  if (!quote) return fail('no_city', 'There is no city with a shop to send the pet to');

  const ids = new Set(itemIds);
  if (ids.size !== itemIds.length) return fail('no_item', 'An item was chosen twice');
  const items = p.bag.filter((i) => ids.has(i.id));
  if (items.length !== ids.size) return fail('no_item', 'Some items are not in the shared bag');
  if (items.some((i) => i.favorite)) return fail('favorite', 'Favorites cannot be sent');
  if (items.length > petBag(tier))
    return fail('pet_bag_full', `The pet carries ${petBag(tier)} items`);
  if (stockIds.length > MAX_SHOPPING)
    return fail('too_many', `At most ${MAX_SHOPPING} things to buy`);
  const wanted: ShopItem[] = [];
  for (const id of stockIds) {
    const stock = quote.stock.find((s) => s.id === id);
    if (!stock) return fail('no_stock', 'The shop does not sell that');
    wanted.push(stock);
  }
  if (items.length === 0 && wanted.length === 0) return fail('nothing', 'Nothing to sell or buy');

  const sold = items.reduce((s, i) => s + petSalePrice(i, tier), 0);
  const cost = wanted.reduce((s, w) => s + w.price, 0);
  const shares = evenShares(p.members.length, sold);
  // The shares of the characters this player controls pay for the shopping first.
  if (!payWithShares(p, shares, cost, viewer)) return fail('no_gold', 'Not enough gold');

  const there = Math.max(1, quote.ticks);
  p.bag = p.bag.filter((i) => !ids.has(i.id));
  const trip: PetTrip = {
    cityId: quote.cityId,
    items,
    shopping: wanted.map((w) => structuredClone(w)),
    arriveAt: now + there * cfg.tickMs,
    returnAt: 0,
    phase: 'out',
    shares: Object.fromEntries(p.members.map((m, i) => [m.id, shares[i]!])),
    sold,
    spent: cost,
  };
  trip.returnAt = trip.arriveAt + returnTicks(p, quote.ticks) * cfg.tickMs;
  p.pet = { trip, waiting: p.pet?.waiting ?? [] };
  return {
    ok: true,
    events: [
      {
        at: now,
        kind: 'pet_sent',
        payload: { city: quote.cityId, items: items.length, buying: wanted.length },
      },
    ],
  };
}

/** The way back: a swift pet is faster, as if it had a burst of speed after reaching the city. */
function returnTicks(p: PartyState, oneWay: number): number {
  const swift = p.caravan?.pet?.caravan?.abilities?.includes('swift');
  return Math.max(1, Math.ceil(swift ? oneWay * 0.6 : oneWay));
}

// ---------- running trips (called by the sim) ----------

export type PetEmit = (at: number, kind: string, payload: Record<string, unknown>) => void;

/** Moves the goods the pet holds into the shared bag, as far as there is room. */
export function deliverPetGoods(
  p: PartyState,
  cfg: Pick<SimConfig, 'bagSize'>,
  at: number,
  emit: PetEmit,
): void {
  const pet = p.pet;
  if (!pet || pet.waiting.length === 0) return;
  const delivered: string[] = [];
  while (pet.waiting.length && addToBag(p.bag, pet.waiting[0]!, bagCapacity(p, cfg))) {
    delivered.push(pet.waiting.shift()!.name);
  }
  if (delivered.length)
    emit(at, 'pet_delivered', { items: delivered, waiting: pet.waiting.length });
}

/**
 * Advances the pet's trip up to `now`: reaching the city (the sale is paid out and the shopping
 * bought) and getting back (goods wait for room in the shared bag).
 */
export function settlePet(
  p: PartyState,
  world: WorldDef,
  cfg: SimConfig,
  now: number,
  emit: PetEmit,
): void {
  const trip = p.pet?.trip;
  if (!trip) return;
  if (trip.phase === 'out' && now >= trip.arriveAt) {
    for (const m of p.members) m.gold += trip.shares[m.id] ?? 0;
    const city = world.sites[trip.cityId];
    const bought: Item[] = [];
    for (const stock of trip.shopping) {
      p.counter += 1;
      bought.push(itemFromStock(stock, `pet${p.counter}_${stock.id}`));
    }
    emit(trip.arriveAt, 'pet_arrived', {
      city: city?.name ?? trip.cityId,
      sold: trip.sold,
      items: trip.items.length,
      spent: trip.spent,
      bought: bought.map((i) => i.name),
    });
    trip.items = bought;
    trip.phase = 'back';
  }
  if (trip.phase === 'back' && now >= trip.returnAt) {
    const pet = p.pet!;
    pet.waiting.push(...trip.items);
    const found: string[] = [];
    if (p.caravan?.pet?.caravan?.abilities?.includes('scavenger')) {
      p.counter += 1;
      const rng = createRng((p.seed ^ Math.imul(p.counter + 7, 0x85ebca6b)) >>> 0);
      if (rng.chance(30)) {
        for (let tries = 0; tries < 4; tries++) {
          const drop = rollDrop(rng, p.level, `pf${p.counter}_${tries}`);
          if (drop) {
            pet.waiting.push(drop);
            found.push(drop.name);
            break;
          }
        }
      }
    }
    pet.trip = null;
    emit(trip.returnAt, 'pet_home', { found, holding: pet.waiting.length });
    deliverPetGoods(p, cfg, trip.returnAt, emit);
  }
}

/** The party was defeated: the pet is teleported to the respawn city and finishes its trip at once. */
export function recallPet(
  p: PartyState,
  world: WorldDef,
  cfg: SimConfig,
  now: number,
  emit: PetEmit,
): void {
  const trip = p.pet?.trip;
  if (!trip) return;
  trip.arriveAt = Math.min(trip.arriveAt, now);
  trip.returnAt = Math.min(trip.returnAt, now);
  settlePet(p, world, cfg, now, emit);
}
