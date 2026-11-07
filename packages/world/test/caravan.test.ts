import { createRng } from '@game/engine';
import { describe, expect, it } from 'vitest';
import { buyItem, sellItems } from '../src/actions.ts';
import {
  equipCaravan,
  nearestShopCity,
  petIsOut,
  petQuote,
  sendPet,
  unequipCaravan,
} from '../src/caravan.ts';
import {
  BAG_SLOTS,
  caravanBagSlots,
  evenShares,
  makeCaravanItem,
  mountSpeed,
  PET_BAG,
  petAbilities,
  petSalePrice,
  tentHealing,
} from '../src/caravan-data.ts';
import { bagCapacity, rollDrop, shopItem } from '../src/loot.ts';
import { advance, createParty, defaultConfig } from '../src/sim.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import type { Item, PartyState } from '../src/types.ts';

const cfg = { ...defaultConfig(1000), maxSteps: 5000 };

function party(): PartyState {
  const p = createParty({
    id: 'p',
    name: 'T',
    seed: 1,
    now: 0,
    world: W,
    members: [
      { name: 'W', race: 'dwarf', cls: 'warrior' },
      { name: 'M', race: 'elf', cls: 'mage' },
    ],
  });
  for (const m of p.members) m.gold = 0;
  return p;
}

const item = (id: string, value = 100, over: Partial<Item> = {}): Item => ({
  id,
  name: `Thing ${id}`,
  rarity: 'common',
  itemLevel: 1,
  value,
  favorite: false,
  ...over,
});

const withPet = (tier = 1): PartyState => {
  const p = party();
  p.caravan = { pet: makeCaravanItem('pet', tier, 'pet1') };
  return p;
};

/** Keeps the party itself idle in town, so only the pet's trip runs. */
const parked = (p: PartyState): PartyState => {
  p.activity = { kind: 'town', startedAt: 0, ticks: 100000 };
  p.nextAt = 10 ** 12;
  return p;
};

describe('accessories', () => {
  it('have five tiers, better each time, with names and rarity', () => {
    for (const kind of ['mount', 'pet', 'bag', 'tent'] as const) {
      const names = new Set<string>();
      let lastValue = 0;
      for (let tier = 1; tier <= 5; tier++) {
        const it = makeCaravanItem(kind, tier, `x${tier}`);
        expect(it.caravan).toMatchObject({ kind, tier });
        expect(it.value).toBeGreaterThan(lastValue);
        lastValue = it.value;
        names.add(it.name);
      }
      expect(names.size).toBe(5);
    }
    expect(petAbilities(2)).toEqual([]);
    expect(petAbilities(3)).toEqual(['scavenger']);
    expect(petAbilities(5)).toEqual(['scavenger', 'swift']);
    expect(PET_BAG[4]).toBe(40);
  });

  it('drop rarely, and higher level monsters drop better ones', () => {
    const rng = createRng(11);
    const tiers = (level: number) => {
      const out: number[] = [];
      for (let i = 0; i < 6000; i++) {
        const d = rollDrop(rng, level, `d${i}`);
        if (d?.caravan) out.push(d.caravan.tier);
      }
      return out;
    };
    const low = tiers(5);
    const high = tiers(100);
    expect(low.length).toBeGreaterThan(5);
    expect(low.length).toBeLessThan(120);
    expect(Math.max(...low)).toBeLessThanOrEqual(1);
    expect(Math.max(...high)).toBeGreaterThanOrEqual(4);
  });

  it('are equipped from the shared bag, swap, and come back when unequipped', () => {
    const p = party();
    p.bag.push(makeCaravanItem('mount', 1, 'a'), makeCaravanItem('mount', 3, 'b'));
    expect(equipCaravan(p, 'a', cfg)).toEqual({ ok: true });
    expect(p.caravan!.mount!.id).toBe('a');
    expect(mountSpeed(p)).toBeCloseTo(0.1);
    expect(equipCaravan(p, 'b', cfg)).toEqual({ ok: true });
    expect(p.bag.map((i) => i.id)).toEqual(['a']);
    expect(mountSpeed(p)).toBeCloseTo(0.3);
    expect(unequipCaravan(p, 'mount', cfg)).toEqual({ ok: true });
    expect(mountSpeed(p)).toBe(0);
    expect(p.bag.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(unequipCaravan(p, 'mount', cfg)).toMatchObject({ code: 'empty_slot' });
  });

  it('refuse anything that is not an accessory, or not in the shared bag', () => {
    const p = party();
    p.bag.push(item('rock'));
    expect(equipCaravan(p, 'rock', cfg)).toMatchObject({ code: 'not_caravan' });
    expect(equipCaravan(p, 'nope', cfg)).toMatchObject({ code: 'no_item' });
  });
});

describe('bag item', () => {
  it('adds slots to the shared bag, and cannot be removed while those slots are in use', () => {
    const p = party();
    p.bag.push(makeCaravanItem('bag', 2, 'sack'));
    const base = bagCapacity(p, cfg);
    equipCaravan(p, 'sack', cfg);
    expect(caravanBagSlots(p)).toBe(BAG_SLOTS[1]);
    expect(bagCapacity(p, cfg)).toBe(base + BAG_SLOTS[1]);
    while (p.bag.length < base) p.bag.push(item(`f${p.bag.length}`));
    // One more item lives in the extra slots now.
    p.bag.push(item('extra'));
    expect(unequipCaravan(p, 'bag', cfg)).toMatchObject({ ok: false, code: 'bag_in_use' });
    p.bag.pop();
    p.bag.pop();
    expect(unequipCaravan(p, 'bag', cfg)).toEqual({ ok: true });
  });

  it('a smaller bag item cannot replace a bigger one while the bag holds too much', () => {
    const p = party();
    p.bag.push(makeCaravanItem('bag', 1, 'small'), makeCaravanItem('bag', 5, 'big'));
    equipCaravan(p, 'big', cfg);
    while (p.bag.length < bagCapacity(p, cfg)) p.bag.push(item(`f${p.bag.length}`));
    expect(p.bag.length).toBeGreaterThan(cfg.bagSize + BAG_SLOTS[0]);
    expect(equipCaravan(p, 'small', cfg)).toMatchObject({ code: 'bag_in_use' });
    expect(p.caravan!.bag!.id).toBe('big');
  });
});

describe('mount and tent', () => {
  it('a mount makes the walk shorter', () => {
    const walk = (mounted: boolean) => {
      const p = party();
      if (mounted) p.caravan = { mount: makeCaravanItem('mount', 5, 'm') };
      p.orders.push({ id: 'o', kind: 'goto', siteId: 'goblin_warren' });
      const r = advance(p, 5_000_000, W, { ...cfg, jitterMs: 0 });
      return r.events.find((e) => e.kind === 'arrive')?.at ?? Infinity;
    };
    const plain = walk(false);
    const mounted = walk(true);
    expect(plain).toBeLessThan(Infinity);
    expect(mounted).toBeLessThan(plain);
    expect(mounted).toBeGreaterThan(plain / 2);
    expect(tentHealing(party())).toBe(0);
  });

  it('a tent shortens resting', () => {
    const restTicks = (tent: boolean) => {
      const p = party();
      if (tent) p.caravan = { tent: makeCaravanItem('tent', 5, 't') };
      for (const m of p.members) m.hp = 1;
      p.forcedRest = true;
      const r = advance(p, 5_000_000, W, { ...cfg, jitterMs: 0 });
      return r.events.find((e) => e.kind === 'rest')?.payload.ticks as number;
    };
    const plain = restTicks(false);
    const tent = restTicks(true);
    expect(plain).toBeGreaterThan(0);
    expect(tent).toBeLessThan(plain);
  });
});

describe('selling and shares', () => {
  it('splits evenly with the remainder to the first', () => {
    expect(evenShares(3, 10)).toEqual([4, 3, 3]);
    expect(evenShares(2, 0)).toEqual([0, 0]);
    expect(evenShares(0, 5)).toEqual([]);
  });

  it('a better pet sells for more: 20% of the price at tier 1 up to 50% at tier 5', () => {
    const it = item('x', 100); // value is 25% of the price, so the price is 400
    expect(petSalePrice(it, 1)).toBe(80);
    expect(petSalePrice(it, 2)).toBe(100);
    expect(petSalePrice(it, 5)).toBe(200);
  });
});

/** The starter world with one expensive thing added to the Oakhaven shop. */
function bigWorld() {
  const world = structuredClone(W);
  const big = shopItem('Iron Mail', 20, 'rare');
  world.sites.oakhaven!.shop!.push(big);
  return { world, big };
}

describe('pet trips', () => {
  const quote = (p: PartyState) => petQuote(p, W, cfg)!;

  it('need a pet, a city with a shop and something to do', () => {
    const p = party();
    expect(nearestShopCity(W, p.pos)?.id).toBe('oakhaven');
    expect(sendPet(p, W, cfg, [], [], 0)).toMatchObject({ code: 'no_pet' });
    p.caravan = { pet: makeCaravanItem('pet', 1, 'pet1') };
    expect(sendPet(p, W, cfg, [], [], 0)).toMatchObject({ code: 'nothing' });
    expect(sendPet(p, W, cfg, ['nope'], [], 0)).toMatchObject({ code: 'no_item' });
    p.bag.push(item('fav', 100, { favorite: true }));
    expect(sendPet(p, W, cfg, ['fav'], [], 0)).toMatchObject({ code: 'favorite' });
    expect(sendPet(p, W, cfg, [], ['nothing'], 0)).toMatchObject({ code: 'no_stock' });
  });

  it('sells, pays everyone an even share, brings the shopping and delivers it', () => {
    const p = parked(withPet(2));
    p.bag.push(item('a', 100), item('b', 100), item('c', 100));
    const stock = quote(p).stock[0]!;
    expect(sendPet(p, W, cfg, ['a', 'b', 'c'], [stock.id], 0)).toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(p.bag.find((i) => i.id === 'a')).toBeUndefined();
    expect(p.pet!.trip).not.toBeNull();
    // Nothing is paid out before the pet reaches the city. A tier 2 pet sells at the item value.
    expect(p.members.reduce((s, m) => s + m.gold, 0)).toBe(0);

    const done = advance(p, 600_000, W, cfg);
    const q = done.party;
    expect(q.pet!.trip).toBeNull();
    // The 300 gold sale pays for the shopping first; what is left is shared by everyone.
    expect(q.members.reduce((s, m) => s + m.gold, 0)).toBe(300 - stock.price);
    expect(q.bag.some((i) => i.name === stock.name)).toBe(true);
    const kinds = done.events.map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['pet_arrived', 'pet_home', 'pet_delivered']));
    expect(kinds.indexOf('pet_arrived')).toBeLessThan(kinds.indexOf('pet_home'));
  });

  it('in multiplayer a player only spends their own gold and their own share of the sale', () => {
    const { world, big } = bigWorld();
    const p = parked(withPet(1));
    p.members[0]!.ownerId = 'u1';
    p.members[1]!.ownerId = 'u2';
    p.members[1]!.gold = 10_000;
    p.bag.push(item('a', 100), item('b', 100));
    // The sale is 2 x 80 = 160, so each share is 80, far below the price of the big item.
    expect(big.price).toBeGreaterThan(400);
    expect(sendPet(p, world, cfg, ['a', 'b'], [big.id], 0, 'u1')).toMatchObject({
      code: 'no_gold',
    });
    expect(p.bag.find((i) => i.id === 'a')).toBeDefined();
    expect(p.members[1]!.gold).toBe(10_000);
    // u2 can: their own share and their own gold pay; u1 still gets their half of the sale.
    expect(sendPet(p, world, cfg, ['a', 'b'], [big.id], 0, 'u2')).toEqual(
      expect.objectContaining({ ok: true }),
    );
    const out = advance(p, 600_000, world, cfg).party;
    expect(out.members[0]!.gold).toBe(80);
    expect(out.members[1]!.gold).toBe(10_000 - (big.price - 80));
  });

  it('blocks city selling and buying while the pet is out, and a second trip', () => {
    const p = parked(withPet(1));
    p.bag.push(item('a', 100), item('b', 100));
    expect(sendPet(p, W, cfg, ['a'], [], 0)).toEqual(expect.objectContaining({ ok: true }));
    expect(sellItems(p, W, ['b'])).toMatchObject({ code: 'pet_out' });
    p.members[0]!.gold = 99999;
    expect(buyItem(p, W, quote(p).stock[0]!.id, cfg)).toMatchObject({ code: 'pet_out' });
    expect(sendPet(p, W, cfg, ['b'], [], 0)).toMatchObject({ code: 'pet_out' });
    expect(unequipCaravan(p, 'pet', cfg)).toMatchObject({ code: 'pet_out' });
    expect(petIsOut(p)).toBe(true);
    const home = advance(p, 600_000, W, cfg).party;
    expect(petIsOut(home)).toBe(false);
    expect(sellItems(home, W, ['b'])).toEqual({ ok: true });
  });

  it('waits holding the goods when the shared bag is full, and delivers when room appears', () => {
    const p = parked(withPet(1));
    const stock = quote(p).stock[0]!;
    p.members[0]!.gold = 5000;
    p.bag.push(item('sell', 40));
    expect(sendPet(p, W, cfg, ['sell'], [stock.id, stock.id], 0)).toEqual(
      expect.objectContaining({ ok: true }),
    );
    // While it is away the bag fills up completely.
    const cap = bagCapacity(p, cfg);
    while (p.bag.length < cap) p.bag.push(item(`fill${p.bag.length}`, 1, { favorite: true }));
    const back = advance(p, 600_000, W, cfg);
    expect(back.party.pet!.waiting.length).toBe(2);
    expect(back.party.bag).toHaveLength(cap);
    expect(back.events.map((e) => e.kind)).toContain('pet_home');
    // Free two slots: the pet's goods move in at the next update.
    const q = back.party;
    q.bag.splice(0, 2);
    const later = advance(q, 700_000, W, cfg).party;
    expect(later.pet!.waiting).toHaveLength(0);
    expect(later.bag.filter((i) => i.name === stock.name)).toHaveLength(2);
  });

  it('a defeated party has its pet teleported to the respawn city to finish the trip', () => {
    const p = withPet(1);
    p.bag.push(item('a', 100));
    // Far from the city so the trip would take long.
    p.pos = { col: p.pos.col + 8, row: p.pos.row };
    expect(sendPet(p, W, cfg, ['a'], [], 0)).toEqual(expect.objectContaining({ ok: true }));
    expect(p.pet!.trip!.returnAt).toBeGreaterThan(20_000);
    for (const m of p.members) m.hp = 1;
    p.activity = {
      kind: 'fight',
      context: 'wild',
      title: 'x',
      boss: false,
      level: 1,
      startedAt: 0,
      result: {
        outcome: 'defeat',
        rounds: 1,
        survivors: p.members.map((m) => ({ id: m.id, hp: 0, mana: 0, alive: false })),
        xp: 0,
        gold: 0,
        loot: [],
        kills: {},
        events: [],
      },
    };
    p.nextAt = 1000;
    const q = advance(p, 1000, W, cfg).party;
    expect(q.stats.defeats).toBe(1);
    expect(q.pet!.trip).toBeNull();
    expect(q.members.reduce((s, m) => s + m.gold, 0)).toBeGreaterThan(0);
  });

  it('a swift pet is faster coming back, and a scavenger sometimes finds an item', () => {
    const times = (tier: number) => {
      const p = withPet(tier);
      p.bag.push(item('a', 100));
      p.pos = { col: p.pos.col + 5, row: p.pos.row };
      sendPet(p, W, cfg, ['a'], [], 0);
      const t = p.pet!.trip!;
      return { out: t.arriveAt, back: t.returnAt - t.arriveAt };
    };
    const slow = times(4);
    const swift = times(5);
    expect(swift.out).toBeLessThan(slow.out);
    expect(swift.back).toBeLessThan(swift.out);
    expect(slow.back).toBe(slow.out);

    let found = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const p = parked(withPet(5));
      p.seed = seed;
      p.bag.push(item('a', 100));
      sendPet(p, W, cfg, ['a'], [], 0);
      const r = advance(p, 600_000, W, cfg);
      if (r.events.some((e) => e.kind === 'pet_home' && (e.payload.found as string[]).length)) {
        found++;
      }
    }
    expect(found).toBeGreaterThan(0);
    expect(found).toBeLessThan(60);
  });
});
