import { describe, expect, it } from 'vitest';
import {
  acceptQuest,
  allocatePoints,
  buyItem,
  discardItem,
  equipItem,
  moveItem,
  sellItems,
  sendGold,
  setFavorite,
  unequipItem,
} from '../src/actions.ts';
import {
  canControl,
  controlled,
  partyGold,
  spendableGold,
  spendGold,
  splitGold,
} from '../src/gold.ts';
import { advance, createParty, defaultConfig, normalizeParty } from '../src/sim.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import type { Item, PartyState } from '../src/types.ts';

const cfg = { ...defaultConfig(1000), maxSteps: 5000 };

function party(seed = 1, ownerId?: string): PartyState {
  return createParty({
    id: 'p',
    name: 'T',
    seed,
    now: 0,
    world: W,
    ...(ownerId ? { ownerId } : {}),
    members: [
      { name: 'W', race: 'dwarf', cls: 'warrior' },
      { name: 'M', race: 'elf', cls: 'mage' },
      { name: 'P', race: 'human', cls: 'priest' },
      { name: 'R', race: 'orc', cls: 'ranger' },
    ],
  });
}

const gold = (p: PartyState) => p.members.map((m) => m.gold);
const item = (id: string, value = 10): Item => ({
  id,
  name: id,
  rarity: 'common',
  itemLevel: 1,
  value,
  favorite: false,
  slot: 'weapon',
});

describe('gold belongs to characters', () => {
  it('starts at zero for everyone', () => {
    expect(gold(party())).toEqual([0, 0, 0, 0]);
  });

  it('splits evenly, rounding down, with the remainder to the first', () => {
    const p = party();
    splitGold(p.members, 10);
    expect(gold(p)).toEqual([4, 2, 2, 2]);
    splitGold(p.members.slice(1), 7);
    expect(gold(p)).toEqual([4, 5, 4, 4]);
    splitGold(p.members, 0);
    expect(partyGold(p)).toBe(17);
  });

  it('migrates a party that still has one pool of gold', () => {
    const old = party();
    for (const m of old.members) delete (m as Partial<typeof m>).gold;
    (old as unknown as { gold: number }).gold = 103;
    const fixed = normalizeParty(old, W);
    expect(gold(fixed)).toEqual([28, 25, 25, 25]);
    expect('gold' in fixed).toBe(false);
    expect(partyGold(normalizeParty(fixed, W))).toBe(103);
  });
});

describe('who controls what', () => {
  it('solo (no owners set): everyone is controlled', () => {
    const p = party();
    expect(controlled(p, 'anyone')).toHaveLength(4);
    expect(canControl(p.members[0]!)).toBe(true);
  });

  it('new parties give every character to their creator', () => {
    const p = party(1, 'u1');
    expect(p.members.every((m) => m.ownerId === 'u1')).toBe(true);
    expect(controlled(p, 'u1')).toHaveLength(4);
    expect(controlled(p, 'u2')).toHaveLength(0);
    expect(controlled(p)).toHaveLength(4);
  });
});

describe('spending gold', () => {
  it('solo: draws from every character, richest first', () => {
    const p = party();
    [30, 10, 50, 5].forEach((g, i) => (p.members[i]!.gold = g));
    expect(spendableGold(p)).toBe(95);
    expect(spendGold(p, undefined, 60)).toBe(true);
    expect(gold(p)).toEqual([20, 10, 0, 5]);
    expect(spendGold(p, undefined, 1000)).toBe(false);
    expect(partyGold(p)).toBe(35);
  });

  it('multiplayer: only the viewer characters pay', () => {
    const p = party();
    p.members[0]!.ownerId = 'a';
    p.members[1]!.ownerId = 'b';
    p.members[2]!.ownerId = 'a';
    p.members[3]!.ownerId = 'b';
    [30, 100, 20, 100].forEach((g, i) => (p.members[i]!.gold = g));
    expect(spendableGold(p, 'a')).toBe(50);
    expect(spendGold(p, 'a', 60)).toBe(false);
    expect(spendGold(p, 'a', 45)).toBe(true);
    expect(gold(p)).toEqual([0, 100, 5, 100]);
  });

  it('buying and selling in the city use these rules', () => {
    const p = party();
    const stock = W.sites.oakhaven!.shop![0]!;
    p.members[0]!.ownerId = 'a';
    p.members[1]!.ownerId = 'b';
    p.members[2]!.ownerId = 'b';
    p.members[3]!.ownerId = 'b';
    p.members[1]!.gold = stock.price * 5;
    expect(buyItem(p, W, stock.id, cfg, 'a')).toMatchObject({ code: 'no_gold' });
    expect(buyItem(p, W, stock.id, cfg, 'b')).toEqual({ ok: true });
    expect(p.members[1]!.gold).toBe(stock.price * 4);

    // Sale money is shared by everyone, rounded down.
    p.bag.push(item('a', 5), item('b', 6));
    const before = partyGold(p);
    expect(sellItems(p, W, ['a', 'b'])).toEqual({ ok: true });
    expect(partyGold(p)).toBe(before + 11);
    expect(p.members[2]!.gold).toBe(2);
    expect(p.members[0]!.gold).toBe(5);
  });
});

describe('sending gold', () => {
  it('moves gold between characters', () => {
    const p = party();
    p.members[0]!.gold = 50;
    expect(sendGold(p, 'm1', 'm3', 20)).toEqual({ ok: true });
    expect(gold(p)).toEqual([30, 0, 20, 0]);
  });

  it('rejects bad requests and other players characters', () => {
    const p = party(1, 'a');
    p.members[1]!.ownerId = 'b';
    p.members[0]!.gold = 50;
    p.members[1]!.gold = 50;
    expect(sendGold(p, 'm1', 'zz', 5)).toMatchObject({ code: 'no_member' });
    expect(sendGold(p, 'm1', 'm1', 5)).toMatchObject({ code: 'bad_target' });
    expect(sendGold(p, 'm1', 'm3', 0)).toMatchObject({ code: 'bad_amount' });
    expect(sendGold(p, 'm1', 'm3', 1.5)).toMatchObject({ code: 'bad_amount' });
    expect(sendGold(p, 'm1', 'm3', 51)).toMatchObject({ code: 'no_gold' });
    // Another player's character cannot be drained, but you can give to it.
    expect(sendGold(p, 'm2', 'm1', 10, 'a')).toMatchObject({ code: 'not_yours' });
    expect(sendGold(p, 'm1', 'm2', 10, 'a')).toEqual({ ok: true });
    expect(gold(p)).toEqual([40, 60, 0, 0]);
  });
});

describe('play: gold and full bags', () => {
  it('victories give gold to living characters, spread over the party', () => {
    const r = advance(party(6), 12 * 3600_000, W, cfg);
    const total = partyGold(r.party);
    expect(total).toBeGreaterThan(50);
    expect(r.party.members.filter((m) => m.gold > 0).length).toBeGreaterThan(1);
    expect(Math.max(...gold(r.party)) - Math.min(...gold(r.party))).toBeLessThan(total / 2);
  });

  it('a full bag takes no loot and nothing is thrown away', () => {
    const p = party(6);
    p.bagSize = 3;
    // Favorites, so a defeat never takes them either.
    p.bag.push({ ...item('keep1'), favorite: true }, { ...item('keep2'), favorite: true });
    const r = advance(p, 12 * 3600_000, W, cfg);
    expect(r.party.bag).toHaveLength(3);
    expect(r.party.bag.slice(0, 2).map((i) => i.id)).toEqual(['keep1', 'keep2']);
    const full = r.events.filter((e) => e.kind === 'bag_full');
    expect(full.length).toBeGreaterThan(0);
    const fights = r.events.filter((e) => e.kind === 'fight' && e.payload.missed);
    expect(fights.length).toBe(full.length);
    for (const f of fights) {
      expect((f.payload.missed as string[]).length).toBeGreaterThan(0);
    }
    expect(r.events.every((e) => !('discarded' in e.payload))).toBe(true);
  });

  it('personal bags receive nothing from loot', () => {
    const p = party(6);
    p.bagSize = 0;
    const r = advance(p, 12 * 3600_000, W, cfg);
    expect(r.party.bag).toHaveLength(0);
    for (const m of r.party.members) expect(m.bag).toHaveLength(0);
  });

  it('a quest item reward waits for a free slot, the rest is paid at once', () => {
    const p = party(3);
    p.bagSize = 0;
    acceptQuest(p, W, 'wolves_at_the_door', 'o1', 0);
    const first = advance(p, 24 * 3600_000, W, cfg);
    const done = first.events.find((e) => e.kind === 'quest_completed');
    expect(done?.payload).toMatchObject({ waiting: true, gold: 70 });
    expect(first.party.bag).toHaveLength(0);
    expect(first.party.pendingItems?.map((i) => i.name)).toEqual(['Fine Leather Cap']);

    // Still full: it keeps waiting. Once there is room it arrives on its own.
    first.party.bagSize = 5;
    const second = advance(first.party, 24 * 3600_000, W, cfg);
    expect(second.events.some((e) => e.kind === 'items_delivered')).toBe(true);
    expect(second.party.pendingItems).toBeUndefined();
    expect(second.party.bag.some((i) => i.name === 'Fine Leather Cap')).toBe(true);
  });
});

describe('owner checks on characters and items', () => {
  /** Player a owns m1, player b owns m2; the shared bag is open to both. */
  function shared(): PartyState {
    const p = party();
    p.members[0]!.ownerId = 'a';
    p.members[1]!.ownerId = 'b';
    p.members[2]!.ownerId = 'a';
    p.members[3]!.ownerId = 'b';
    p.bag.push(item('s1'));
    p.members[0]!.bag.push(item('mine'));
    p.members[1]!.bag.push(item('hers'));
    p.members[1]!.equipment.weapon = item('worn');
    p.members[0]!.points = 2;
    p.members[1]!.points = 2;
    return p;
  }
  const noRoom = { bagSize: 40 };

  it('moves only between the viewer own places and the shared bag', () => {
    const p = shared();
    expect(moveItem(p, 'hers', { kind: 'bag' }, noRoom, 'a')).toMatchObject({ code: 'not_yours' });
    expect(moveItem(p, 'worn', { kind: 'bag' }, noRoom, 'a')).toMatchObject({ code: 'not_yours' });
    expect(moveItem(p, 's1', { kind: 'personal', memberId: 'm2' }, noRoom, 'a')).toMatchObject({
      code: 'not_yours',
    });
    expect(equipItem(p, 'm2', 's1', 'a')).toMatchObject({ code: 'not_yours' });
    expect(unequipItem(p, 'm2', 'weapon', noRoom, 'a')).toMatchObject({ code: 'not_yours' });
    expect(moveItem(p, 'mine', { kind: 'bag' }, noRoom, 'a')).toEqual({ ok: true });
    expect(equipItem(p, 'm1', 's1', 'a')).toEqual({ ok: true });
    expect(moveItem(p, 'hers', { kind: 'bag' }, noRoom, 'b')).toEqual({ ok: true });
  });

  it('protects favorites, discards, points and selling too', () => {
    const p = shared();
    expect(setFavorite(p, 'hers', true, 'a')).toMatchObject({ code: 'not_yours' });
    expect(discardItem(p, 'hers', 'a')).toMatchObject({ code: 'not_yours' });
    expect(allocatePoints(p, 'm2', { str: 1 }, 'a')).toMatchObject({ code: 'not_yours' });
    expect(allocatePoints(p, 'm1', { str: 1 }, 'a')).toEqual({ ok: true });
    expect(setFavorite(p, 's1', true, 'a')).toEqual({ ok: true });
    expect(discardItem(p, 'hers', 'b')).toEqual({ ok: true });
    // The sale check comes first on ownership, so another player's bag cannot be emptied.
    p.members[1]!.bag.push(item('hers2'));
    expect(sellItems(p, W, ['hers2'], 'a')).toMatchObject({ code: 'not_yours' });
    expect(sellItems(p, W, ['hers2'], 'b')).toEqual({ ok: true });
  });
});
