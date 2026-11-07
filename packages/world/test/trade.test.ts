import { describe, expect, it } from 'vitest';
import { buyItem, sellItems, tradeCity, tradeItems } from '../src/actions.ts';
import { equipCaravan, petQuote, sendPet } from '../src/caravan.ts';
import { makeCaravanItem } from '../src/caravan-data.ts';
import { bagCapacity } from '../src/loot.ts';
import { advance, createParty, defaultConfig } from '../src/sim.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import { ACCESSORY_PRICE_FACTOR, cityStock, DAY_MS, dayOf, rotatingStock } from '../src/stock.ts';
import type { Item, PartyState } from '../src/types.ts';

const cfg = { ...defaultConfig(1000), maxSteps: 5000 };
const NOW = 20_000 * DAY_MS + 5_000;
const oakhaven = W.sites.oakhaven!;

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

describe('rotating stock', () => {
  it('is the same all day, changes from day to day, and keeps the fixed shop', () => {
    const a = cityStock(oakhaven, NOW, 1);
    expect(cityStock(oakhaven, NOW + 3_600_000, 1)).toEqual(a);
    const tomorrow = cityStock(oakhaven, NOW + DAY_MS, 1);
    expect(tomorrow.map((s) => s.id)).not.toEqual(a.map((s) => s.id));
    const fixed = oakhaven.shop!.map((s) => s.id);
    for (const id of fixed) {
      expect(a.find((s) => s.id === id)).toBeDefined();
      expect(tomorrow.find((s) => s.id === id)).toBeDefined();
    }
    // Without a time only the fixed shop is returned.
    expect(cityStock(oakhaven).map((s) => s.id)).toEqual(fixed);
    expect(dayOf(NOW)).toBe(20_000);
  });

  it('brings accessories of the city tiers at a price far above normal items', () => {
    for (const city of [oakhaven, W.sites.stonebridge!, W.sites.the_spire_city!]) {
      const [lo, hi] = city.stock!.tiers;
      for (let day = 1; day <= 40; day++) {
        const rotating = rotatingStock(city, day);
        const acc = rotating.filter((s) => s.caravan);
        expect(acc.length).toBeGreaterThan(0);
        for (const s of acc) {
          expect(s.caravan!.tier).toBeGreaterThanOrEqual(lo);
          expect(s.caravan!.tier).toBeLessThanOrEqual(hi);
          expect(s.slot).toBeUndefined();
          expect(s.price).toBe(s.value * ACCESSORY_PRICE_FACTOR);
          expect(s.price).toBeGreaterThan(s.value * 4);
        }
        // Gear is around the city's level.
        for (const g of rotating.filter((s) => !s.caravan)) {
          expect(Math.abs(g.itemLevel - city.stock!.level)).toBeLessThanOrEqual(2);
        }
        expect(new Set(rotating.map((s) => s.id)).size).toBe(rotating.length);
      }
    }
  });

  it('cities without a rotation keep a fixed stock', () => {
    const none = { ...oakhaven, stock: undefined };
    expect(cityStock(none, NOW)).toEqual(oakhaven.shop);
  });
});

describe('trading near a city', () => {
  it('works on the city and on the hexes right next to it, but not further away', () => {
    const p = party();
    expect(tradeCity(p, W)?.id).toBe('oakhaven');
    p.pos = { col: oakhaven.col + 1, row: oakhaven.row };
    expect(tradeCity(p, W)?.id).toBe('oakhaven');
    p.pos = { col: oakhaven.col + 3, row: oakhaven.row };
    expect(tradeCity(p, W)).toBeNull();
    p.bag.push(item('a'));
    expect(sellItems(p, W, ['a'])).toMatchObject({ code: 'not_in_city' });
    expect(tradeItems(p, W, ['a'], [], cfg, undefined, NOW)).toMatchObject({
      code: 'not_in_city',
    });
  });

  it('works while the party is out hunting next to the city', () => {
    const p = party();
    p.pos = { col: oakhaven.col + 1, row: oakhaven.row };
    p.activity = { kind: 'rest', startedAt: 0, ticks: 5, forced: false };
    p.bag.push(item('a', 100));
    expect(sellItems(p, W, ['a'])).toEqual({ ok: true });
    expect(p.members.reduce((s, m) => s + m.gold, 0)).toBe(100);
  });

  it('sells and buys in one step: the sale pays for the purchase first, the rest is shared', () => {
    const p = party();
    p.bag.push(item('a', 300), item('b', 300));
    const buy = cityStock(oakhaven, NOW, 1).find((s) => !s.caravan && s.price < 600)!;
    const r = tradeItems(p, W, ['a', 'b'], [buy.id], cfg, undefined, NOW);
    expect(r).toEqual({ ok: true });
    expect(p.bag.map((i) => i.name)).toEqual([buy.name]);
    expect(p.members.reduce((s, m) => s + m.gold, 0)).toBe(600 - buy.price);
  });

  it('is all or nothing: not enough gold, a full bag and unknown stock change nothing', () => {
    const p = party();
    p.bag.push(item('a', 10));
    const dear = cityStock(oakhaven, NOW, 1).find((s) => s.caravan)!;
    expect(tradeItems(p, W, ['a'], [dear.id], cfg, undefined, NOW)).toMatchObject({
      code: 'no_gold',
    });
    expect(p.bag).toHaveLength(1);
    expect(tradeItems(p, W, [], ['nope'], cfg, undefined, NOW)).toMatchObject({
      code: 'no_stock',
    });
    p.members[0]!.gold = 99_999;
    const cap = bagCapacity(p, cfg);
    while (p.bag.length < cap) p.bag.push(item(`f${p.bag.length}`, 1));
    expect(tradeItems(p, W, [], [dear.id], cfg, undefined, NOW)).toMatchObject({
      code: 'bag_full',
    });
    // Selling something makes room for the purchase in the same trade.
    expect(tradeItems(p, W, ['a'], [dear.id], cfg, undefined, NOW)).toEqual({ ok: true });
    expect(p.members[0]!.gold).toBeLessThan(99_999);
  });

  it('yesterday stock is gone, and nothing can be bought without a day', () => {
    const p = party();
    p.members[0]!.gold = 99_999;
    const yesterday = rotatingStock(oakhaven, dayOf(NOW) - 1, 1)[0]!;
    expect(buyItem(p, W, yesterday.id, cfg, undefined, NOW)).toMatchObject({ code: 'no_stock' });
    const today = rotatingStock(oakhaven, dayOf(NOW), 1)[0]!;
    expect(buyItem(p, W, today.id, cfg, undefined, NOW)).toEqual({ ok: true });
    expect(buyItem(p, W, today.id, cfg)).toMatchObject({ code: 'no_stock' });
  });

  it('a bought accessory can be equipped and does its job', () => {
    const p = party();
    p.members[0]!.gold = 99_999;
    const bag = rotatingStock(oakhaven, dayOf(NOW), 1).find((s) => s.caravan)!;
    expect(buyItem(p, W, bag.id, cfg, undefined, NOW)).toEqual({ ok: true });
    const got = p.bag.find((i) => i.caravan)!;
    expect(got.caravan).toEqual(bag.caravan);
    expect(got.slot).toBeUndefined();
    expect(equipCaravan(p, got.id, cfg)).toEqual({ ok: true });
    expect(p.caravan![got.caravan!.kind]!.id).toBe(got.id);
  });

  it('in multiplayer only the buyer gold and the buyer shares pay', () => {
    const p = party();
    p.members[0]!.ownerId = 'u1';
    p.members[1]!.ownerId = 'u2';
    p.members[1]!.gold = 5000;
    p.bag.push(item('a', 100), item('b', 100));
    const buy = cityStock(oakhaven, NOW, 1).find((s) => s.price >= 400)!;
    expect(tradeItems(p, W, ['a'], [buy.id], cfg, 'u1', NOW)).toMatchObject({ code: 'no_gold' });
    expect(tradeItems(p, W, ['a', 'b'], [buy.id], cfg, 'u2', NOW)).toEqual({ ok: true });
    // The 200 gold sale is 100 each; u2's 100 and 'buy.price - 100' of u2 gold paid.
    expect(p.members[0]!.gold).toBe(100);
    expect(p.members[1]!.gold).toBe(5000 - (buy.price - 100));
  });
});

describe('the carrier pet and the rotating stock', () => {
  it('shops in the same stock, and still delivers it after the stock rotated', () => {
    const p = party();
    p.caravan = { pet: makeCaravanItem('pet', 2, 'pet1') };
    p.members[0]!.gold = 50_000;
    p.pos = { col: oakhaven.col + 6, row: oakhaven.row };
    p.activity = { kind: 'town', startedAt: 0, ticks: 100000 };
    p.nextAt = 10 ** 15;
    const quote = petQuote(p, W, cfg, NOW)!;
    const acc = quote.stock.find((s) => s.caravan)!;
    expect(sendPet(p, W, cfg, [], [acc.id], NOW)).toEqual(expect.objectContaining({ ok: true }));
    // Two days later the stock is different, but what was bought on the trip arrives anyway.
    const back = advance(p, NOW + 2 * DAY_MS, W, cfg).party;
    expect(back.pet!.waiting.length + back.bag.length).toBeGreaterThanOrEqual(1);
    const all = [...back.bag, ...back.pet!.waiting];
    expect(all.some((i) => i.caravan?.kind === acc.caravan!.kind)).toBe(true);
    expect(petQuote(back, W, cfg, NOW + 2 * DAY_MS)!.stock.some((s) => s.id === acc.id)).toBe(
      false,
    );
  });
});

describe('rotation by party level', () => {
  it('the stock renews when the party gains a level, as well as every day', () => {
    const ids = (level: number) => cityStock(oakhaven, NOW, level).map((s) => s.id);
    expect(ids(5)).toEqual(ids(5));
    expect(ids(6)).not.toEqual(ids(5));
    // The fixed shop never changes.
    for (const fixed of oakhaven.shop!) expect(ids(6)).toContain(fixed.id);
    // A level up in the same day brings different goods than the day before did.
    const sameDay = new Set(ids(5));
    expect(ids(6).filter((id) => !sameDay.has(id)).length).toBeGreaterThan(3);
  });

  it('gear follows the party level inside a window around the city level', () => {
    const gearLevels = (level: number) =>
      rotatingStock(oakhaven, dayOf(NOW), level)
        .filter((s) => !s.caravan)
        .map((s) => s.itemLevel);
    const city = oakhaven.stock!.level;
    // A party at the city's own level is served around it.
    for (const l of gearLevels(city)) expect(Math.abs(l - city)).toBeLessThanOrEqual(2);
    // A far stronger party is still served from the city's own (capped) window.
    for (const l of gearLevels(80)) expect(l).toBeLessThanOrEqual(city + 5 + 2);
    // A weaker party gets weaker gear, but never below the window.
    expect(Math.max(...gearLevels(1))).toBeLessThanOrEqual(city);
    // The high regions follow the party up to their own window.
    const spire = W.sites.the_spire_city!;
    const high = rotatingStock(spire, dayOf(NOW), 95).filter((s) => !s.caravan);
    expect(Math.min(...high.map((s) => s.itemLevel))).toBeGreaterThanOrEqual(90 - 2);
  });

  it('what is bought is priced and built for the party level at that time', () => {
    const p = party();
    p.level = 7;
    p.members[0]!.gold = 99_999;
    const today = rotatingStock(oakhaven, dayOf(NOW), 7)[0]!;
    expect(buyItem(p, W, today.id, cfg, undefined, NOW)).toEqual({ ok: true });
    p.level = 8; // levelled up: the old offer is gone
    expect(buyItem(p, W, today.id, cfg, undefined, NOW)).toMatchObject({ code: 'no_stock' });
  });
});
