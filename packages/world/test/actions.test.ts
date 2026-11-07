import { createRng } from '@game/engine';
import { partyGold } from '../src/gold.ts';
import { describe, expect, it } from 'vitest';
import {
  allocatePoints,
  buyItem,
  discardItem,
  equipItem,
  leaveTown,
  moveItem,
  moveOrder,
  resetMemberAi,
  resetPoints,
  sellItems,
  setAutoAlloc,
  setFavorite,
  setMemberAi,
  sortBag,
  teleport,
  teleportOptions,
  unequipItem,
  usableCity,
  validateAiRules,
  wakeFromTown,
} from '../src/actions.ts';
import { BASES, rollDrop, shopItem } from '../src/loot.ts';
import { CLASSES, memberAttributes, memberDerived } from '../src/progression.ts';
import { advance, createParty, defaultConfig, normalizeParty } from '../src/sim.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import { PERSONAL_BAG_SIZE, type Item, type PartyState } from '../src/types.ts';

const cfg = { ...defaultConfig(1000), maxSteps: 5000 };
const DAY = 24 * 3600 * 1000;

function party(seed = 1): PartyState {
  return createParty({
    id: 'p',
    name: 'T',
    seed,
    now: 0,
    world: W,
    members: [
      { name: 'W', race: 'dwarf', cls: 'warrior' },
      { name: 'M', race: 'elf', cls: 'mage' },
      { name: 'P', race: 'human', cls: 'priest' },
      { name: 'R', race: 'orc', cls: 'ranger' },
    ],
  });
}

/** A party whose members start with empty gear slots, so tests control exactly what is worn. */
function naked(seed = 1): PartyState {
  const p = party(seed);
  for (const m of p.members) m.equipment = {};
  return p;
}

const sword = (id = 's1', over: Partial<Item> = {}): Item => ({
  id,
  name: 'Rusty Sword',
  rarity: 'common',
  itemLevel: 4,
  value: 16,
  favorite: false,
  slot: 'weapon',
  bonuses: { str: 3, dex: 1 },
  ...over,
});

describe('gear', () => {
  it('equipping moves the item from the bag and adds its bonuses', () => {
    const p = naked();
    const before = memberAttributes(p.members[0]!, p.level);
    p.bag.push(sword());
    expect(equipItem(p, 'm1', 's1')).toEqual({ ok: true });
    expect(p.bag).toHaveLength(0);
    expect(p.members[0]!.equipment.weapon?.id).toBe('s1');
    const after = memberAttributes(p.members[0]!, p.level);
    expect(after.str).toBe(before.str + 3);
    expect(after.dex).toBe(before.dex + 1);
  });

  it('swaps with what is already worn and returns the old item to the bag', () => {
    const p = naked();
    p.bag.push(sword('a'), sword('b', { bonuses: { str: 5 } }));
    equipItem(p, 'm1', 'a');
    equipItem(p, 'm1', 'b');
    expect(p.members[0]!.equipment.weapon?.id).toBe('b');
    expect(p.bag.map((i) => i.id)).toEqual(['a']);
  });

  it('rejects unknown members, missing items and items without a slot', () => {
    const p = party();
    p.bag.push(sword('x', { slot: undefined }));
    expect(equipItem(p, 'nobody', 'x')).toMatchObject({ ok: false, code: 'no_member' });
    expect(equipItem(p, 'm1', 'nope')).toMatchObject({ ok: false, code: 'no_item' });
    expect(equipItem(p, 'm1', 'x')).toMatchObject({ ok: false, code: 'not_equippable' });
    expect(p.bag).toHaveLength(1);
  });

  it('unequip puts the item back, refuses when the bag is full or the slot is empty', () => {
    const p = naked();
    p.bag.push(sword());
    equipItem(p, 'm1', 's1');
    expect(unequipItem(p, 'm1', 'head', cfg)).toMatchObject({ code: 'empty_slot' });
    expect(unequipItem(p, 'm1', 'weapon', { bagSize: 0 })).toMatchObject({ code: 'bag_full' });
    expect(p.members[0]!.equipment.weapon).toBeDefined();
    expect(unequipItem(p, 'm1', 'weapon', cfg)).toEqual({ ok: true });
    expect(p.bag[0]!.id).toBe('s1');
    expect(p.members[0]!.equipment.weapon).toBeUndefined();
  });

  it('losing max health from gear never leaves current health above the new maximum', () => {
    const p = party();
    const hp = {
      id: 'h',
      name: 'Helm',
      rarity: 'rare',
      itemLevel: 8,
      value: 1,
      favorite: false,
      slot: 'head',
      bonuses: { vit: 12 },
    } as Item;
    p.bag.push(hp);
    equipItem(p, 'm1', 'h');
    p.members[0]!.hp = memberDerived(p.members[0]!, p.level).maxHp;
    unequipItem(p, 'm1', 'head', cfg);
    expect(p.members[0]!.hp).toBe(memberDerived(p.members[0]!, p.level).maxHp);
  });

  it('favorites cannot be discarded until unmarked', () => {
    const p = party();
    p.bag.push(sword());
    setFavorite(p, 's1', true);
    expect(discardItem(p, 's1')).toMatchObject({ code: 'favorite' });
    setFavorite(p, 's1', false);
    expect(discardItem(p, 's1')).toEqual({ ok: true });
    expect(p.bag).toHaveLength(0);
    expect(discardItem(p, 's1')).toMatchObject({ code: 'no_item' });
  });

  it('every dropped and shop item has a slot and positive bonuses', () => {
    const rng = createRng(5);
    let seen = 0;
    for (let i = 0; i < 400; i++) {
      const it = rollDrop(rng, 6, `i${i}`);
      if (!it) continue;
      seen++;
      expect(it.slot).toBeDefined();
      expect(Object.values(it.bonuses ?? {}).every((v) => v! > 0)).toBe(true);
    }
    expect(seen).toBeGreaterThan(50);
    for (const b of BASES) {
      const s = shopItem(b.name, 5, 'uncommon');
      expect(s.slot).toBe(b.slot);
      expect(s.price).toBe(s.value * 4);
      expect(shopItem(b.name, 5, 'uncommon')).toEqual(s);
    }
  });
});

describe('attribute points', () => {
  it('spends points, rejects bad requests and leaves state alone on failure', () => {
    const p = party();
    const m = p.members[0]!;
    m.points = 3;
    const str = memberAttributes(m, p.level).str;
    expect(allocatePoints(p, 'm1', { str: 2, vit: 1 })).toEqual({ ok: true });
    expect(m.points).toBe(0);
    expect(memberAttributes(m, p.level).str).toBe(str + 2);

    m.points = 2;
    for (const bad of [{ str: 3 }, { str: -1 }, { str: 1.5 }, {}, { luck: 1 } as never]) {
      expect(allocatePoints(p, 'm1', bad).ok).toBe(false);
    }
    expect(m.points).toBe(2);
  });

  it('reset returns every spent point', () => {
    const p = party();
    const m = p.members[0]!;
    m.points = 4;
    allocatePoints(p, 'm1', { str: 4 });
    resetPoints(p, 'm1');
    expect(m.points).toBe(4);
    expect(Object.values(m.alloc).every((v) => v === 0)).toBe(true);
  });

  it('level ups give points; they are auto-spent in the class pattern unless turned off', () => {
    const auto = advance(party(3), 12 * 3600_000, W, cfg).party;
    expect(auto.level).toBeGreaterThan(2);
    for (const m of auto.members) {
      const spent = Object.values(m.alloc).reduce((a, b) => a + b, 0);
      expect(spent).toBe((auto.level - 1) * cfg.pointsPerLevel);
      expect(m.points).toBe(0);
    }
    const warrior = auto.members[0]!;
    expect(warrior.alloc.str).toBeGreaterThan(warrior.alloc.int);

    const p = party(3);
    for (const m of p.members) setAutoAlloc(p, m.id, false);
    const manual = advance(p, 12 * 3600_000, W, cfg).party;
    // Unspent points make the party weaker, so it need not have reached the same level.
    expect(manual.level).toBeGreaterThan(2);
    expect(manual.level).toBeLessThanOrEqual(auto.level);
    for (const m of manual.members) {
      expect(m.points).toBe((manual.level - 1) * cfg.pointsPerLevel);
      expect(Object.values(m.alloc).every((v) => v === 0)).toBe(true);
    }
  });
});

describe('combat AI', () => {
  const known = CLASSES.warrior.skills;

  it('accepts sensible rules and rejects broken ones', () => {
    expect(
      validateAiRules(
        [{ skill: 'attack' }, { skill: 'power_strike', when: { selfManaAbovePct: 30 } }],
        known,
      ),
    ).toBeNull();
    expect(validateAiRules([], known)).toBeNull();
    expect(validateAiRules('nope', known)).not.toBeNull();
    expect(validateAiRules([{ skill: 'fireball' }], known)).toMatch(/does not know/);
    expect(validateAiRules([{ skill: 'made_up' }], known)).toMatch(/unknown skill/);
    expect(validateAiRules([{ skill: 'attack', order: 'random' }], known)).toMatch(/order/);
    expect(validateAiRules([{ skill: 'attack', filter: { hpBelowPct: 150 } }], known)).toMatch(
      /percent/,
    );
    expect(validateAiRules([{ skill: 'attack', when: { selfHpBelowPct: -1 } }], known)).toMatch(
      /percent/,
    );
    expect(
      validateAiRules(
        Array.from({ length: 17 }, () => ({ skill: 'attack' })),
        known,
      ),
    ).toMatch(/At most/);
    expect(validateAiRules([null], known)).not.toBeNull();
  });

  it('stores only the fields the engine understands', () => {
    const p = party();
    const rules = [
      { skill: 'attack', order: 'lowest_hp', evil: 'x', filter: { hpBelowPct: 50, junk: 1 } },
    ];
    expect(setMemberAi(p, 'm1', rules)).toEqual({ ok: true });
    expect(p.members[0]!.ai).toEqual([
      { skill: 'attack', order: 'lowest_hp', filter: { hpBelowPct: 50 } },
    ]);
  });

  it('refuses a rule set without touching the old one, and can reset to the class default', () => {
    const p = party();
    const before = structuredClone(p.members[0]!.ai);
    expect(setMemberAi(p, 'm1', [{ skill: 'fireball' }])).toMatchObject({
      ok: false,
      code: 'bad_rules',
    });
    expect(p.members[0]!.ai).toEqual(before);
    setMemberAi(p, 'm1', [{ skill: 'attack' }]);
    resetMemberAi(p, 'm1');
    expect(p.members[0]!.ai).toEqual(CLASSES.warrior.ai);
  });

  it('fights actually use the edited rules', () => {
    const p = party(2);
    setMemberAi(p, 'm1', [{ skill: 'attack' }]);
    const r = advance(p, 3 * 3600_000, W, cfg);
    const used = new Set<string>();
    for (const rep of r.replays) {
      for (const e of rep.events) if (e.t === 'skill' && e.unit === 'm1') used.add(e.skill);
    }
    expect(used.size).toBeGreaterThan(0);
    expect([...used]).toEqual(['attack']);
  });
});

describe('town, city and teleport', () => {
  /** Strong party that has already opened Stonebridge and stands in Oakhaven. */
  function strong() {
    const p = party(4);
    p.level = 20;
    for (const m of p.members) {
      const d = memberDerived(m, p.level);
      m.hp = d.maxHp;
      m.mana = d.maxMana;
    }
    p.cleared = ['goblin_keep'];
    return p;
  }

  it('waits in town after arriving on purpose, then goes back to hunting', () => {
    const p = strong();
    p.orders.push({ id: 'o', kind: 'goto', siteId: 'stonebridge' });
    const arrived = advance(p, DAY, W, { ...cfg, jitterMs: 0, townStayTicks: 60 });
    const arrive = arrived.events.find(
      (e) => e.kind === 'arrive' && e.payload.siteId === 'stonebridge',
    )!;
    expect(arrive).toBeDefined();
    const next = arrived.events.find((e) => e.at > arrive.at)!;
    expect(next.at - arrive.at).toBeGreaterThanOrEqual(60 * 1000);

    // Stop right after arrival: the party is in town and the city is usable.
    const stop = advance(p, arrive.at + 1000, W, { ...cfg, jitterMs: 0, townStayTicks: 60 });
    expect(stop.party.activity.kind).toBe('town');
    expect(usableCity(stop.party, W)?.id).toBe('stonebridge');
    expect(stop.party.visited).toContain('stonebridge');
  });

  it('the city is not usable while fighting or travelling', () => {
    const p = strong();
    const busy = advance(p, 20 * 60_000, W, cfg).party;
    if (busy.activity.kind === 'travel' || busy.activity.kind === 'fight') {
      expect(usableCity(busy, W)).toBeNull();
    }
    const fighting = { ...p, activity: { ...p.activity, kind: 'fight' } } as unknown as PartyState;
    expect(usableCity(fighting, W)).toBeNull();
  });

  it('leaving town or getting a new order ends the stay immediately', () => {
    const p = party();
    p.activity = { kind: 'town', startedAt: 0, ticks: 60 };
    p.nextAt = 3_600_000;
    wakeFromTown(p, 5000);
    expect(p.nextAt).toBe(5000);
    p.nextAt = 3_600_000;
    expect(leaveTown(p, 7000)).toEqual({ ok: true });
    expect(p.nextAt).toBe(7000);
    p.activity = { kind: 'rest', startedAt: 0, ticks: 5, forced: false };
    expect(leaveTown(p, 1)).toMatchObject({ code: 'not_in_town' });
  });

  it('sells unfavorited items for their value and refuses elsewhere', () => {
    const p = party();
    p.bag.push(
      sword('a', { value: 20 }),
      sword('b', { value: 30 }),
      sword('c', { favorite: true }),
    );
    expect(sellItems(p, W, ['c'])).toMatchObject({ code: 'favorite' });
    expect(sellItems(p, W, ['a', 'nope'])).toMatchObject({ code: 'no_item' });
    expect(sellItems(p, W, ['a', 'b'])).toEqual({ ok: true });
    expect(partyGold(p)).toBe(50);
    expect(p.bag.map((i) => i.id)).toEqual(['c']);

    p.pos = { col: 0, row: 0 };
    expect(sellItems(p, W, ['c'])).toMatchObject({ code: 'not_in_city' });
  });

  it('buys from the shop for the listed price when there is gold and room', () => {
    const p = party();
    const stock = W.sites.oakhaven!.shop![0]!;
    expect(buyItem(p, W, stock.id, cfg)).toMatchObject({ code: 'no_gold' });
    p.members[0]!.gold = stock.price + 5;
    expect(buyItem(p, W, 'nothing', cfg)).toMatchObject({ code: 'no_stock' });
    expect(buyItem(p, W, stock.id, { bagSize: 0 })).toMatchObject({ code: 'bag_full' });
    expect(partyGold(p)).toBe(stock.price + 5);
    expect(buyItem(p, W, stock.id, cfg)).toEqual({ ok: true });
    expect(partyGold(p)).toBe(5);
    expect(p.bag[0]).toMatchObject({ name: stock.name, slot: stock.slot, bonuses: stock.bonuses });
    buyItem(p, W, stock.id, { bagSize: 40 });
    p.members[0]!.gold = stock.price;
    buyItem(p, W, stock.id, cfg);
    expect(new Set(p.bag.map((i) => i.id)).size).toBe(p.bag.length);
  });

  it('teleports only to visited cities, for gold, and only from a city', () => {
    const p = party();
    expect(teleportOptions(p, W, cfg)).toEqual([]);
    p.visited.push('stonebridge');
    const options = teleportOptions(p, W, cfg);
    expect(options).toHaveLength(1);
    expect(options[0]!.cost).toBeGreaterThan(cfg.teleportBaseCost);

    expect(teleport(p, W, cfg, 'stonebridge', 1000)).toMatchObject({ code: 'no_gold' });
    p.members[0]!.gold = 1000;
    expect(teleport(p, W, cfg, 'goblin_warren', 1000)).toMatchObject({ code: 'no_destination' });
    expect(teleport(p, W, cfg, 'oakhaven', 1000)).toMatchObject({ code: 'no_destination' });

    const r = teleport(p, W, cfg, 'stonebridge', 1000);
    expect(r.ok).toBe(true);
    expect(p.pos).toEqual({ col: W.sites.stonebridge!.col, row: W.sites.stonebridge!.row });
    expect(p.lastCity).toBe('stonebridge');
    expect(partyGold(p)).toBe(1000 - options[0]!.cost);
    expect(p.activity.kind).toBe('town');
    expect(r.ok && r.events?.[0]?.kind).toBe('teleport');

    p.pos = { col: 0, row: 0 };
    expect(teleport(p, W, cfg, 'oakhaven', 2000)).toMatchObject({ code: 'not_in_city' });
  });
});

describe('orders and old saves', () => {
  it('moves orders up and down and stops at the ends', () => {
    const p = party();
    p.orders = [
      { id: 'a', kind: 'goto', siteId: 'goblin_warren' },
      { id: 'b', kind: 'goto', siteId: 'goblin_keep' },
    ];
    moveOrder(p, 'b', -1);
    expect(p.orders.map((o) => o.id)).toEqual(['b', 'a']);
    moveOrder(p, 'b', -1);
    expect(p.orders.map((o) => o.id)).toEqual(['b', 'a']);
    expect(moveOrder(p, 'zzz', 1)).toMatchObject({ code: 'no_order' });
  });

  it('fills in fields that older saved parties are missing', () => {
    const p = party() as unknown as Record<string, unknown>;
    delete p.visited;
    for (const m of p.members as Array<Record<string, unknown>>) {
      delete m.equipment;
      delete m.alloc;
      delete m.points;
      delete m.autoAlloc;
      delete m.skills;
      delete m.ai;
    }
    const fixed = normalizeParty(p as unknown as PartyState, W);
    expect(fixed.visited).toEqual(['oakhaven']);
    for (const m of fixed.members) {
      expect(m.equipment).toEqual({});
      expect(m.autoAlloc).toBe(true);
      expect(m.ai.length).toBeGreaterThan(0);
      expect(m.skills).toEqual(CLASSES[m.cls].skills);
    }
    expect(() => advance(fixed, 3600_000, W, cfg)).not.toThrow();
  });
});

describe('personal bags and moving items', () => {
  const cfg40 = { bagSize: 40 };

  it('new members start with an empty personal bag and old saves get one', () => {
    const p = party();
    expect(p.members.every((m) => Array.isArray(m.bag) && m.bag.length === 0)).toBe(true);
    delete (p.members[0] as { bag?: Item[] }).bag;
    normalizeParty(p, W);
    expect(p.members[0]!.bag).toEqual([]);
  });

  it('moves items between the shared bag and a personal bag', () => {
    const p = party();
    p.bag.push(sword());
    expect(moveItem(p, 's1', { kind: 'personal', memberId: 'm1' }, cfg40)).toEqual({ ok: true });
    expect(p.bag).toHaveLength(0);
    expect(p.members[0]!.bag.map((i) => i.id)).toEqual(['s1']);
    expect(moveItem(p, 's1', { kind: 'bag' }, cfg40)).toEqual({ ok: true });
    expect(p.bag.map((i) => i.id)).toEqual(['s1']);
    expect(p.members[0]!.bag).toHaveLength(0);
  });

  it('moves an item from one personal bag to another', () => {
    const p = party();
    p.members[0]!.bag.push(sword());
    moveItem(p, 's1', { kind: 'personal', memberId: 'm2' }, cfg40);
    expect(p.members[0]!.bag).toHaveLength(0);
    expect(p.members[1]!.bag.map((i) => i.id)).toEqual(['s1']);
  });

  it('a personal bag holds at most PERSONAL_BAG_SIZE items', () => {
    const p = party();
    for (let i = 0; i < PERSONAL_BAG_SIZE; i++) p.members[0]!.bag.push(sword(`x${i}`));
    p.bag.push(sword('extra'));
    expect(moveItem(p, 'extra', { kind: 'personal', memberId: 'm1' }, cfg40)).toMatchObject({
      code: 'personal_full',
    });
    expect(p.bag).toHaveLength(1);
  });

  it('refuses to move into a full shared bag, and unknown items or members', () => {
    const p = party();
    p.members[0]!.bag.push(sword());
    expect(moveItem(p, 's1', { kind: 'bag' }, { bagSize: 0 })).toMatchObject({ code: 'bag_full' });
    expect(p.members[0]!.bag).toHaveLength(1);
    expect(moveItem(p, 'nope', { kind: 'bag' }, cfg40)).toMatchObject({ code: 'no_item' });
    expect(moveItem(p, 's1', { kind: 'personal', memberId: 'zz' }, cfg40)).toMatchObject({
      code: 'no_member',
    });
  });

  it('equips from a personal bag and swaps the old item back into it', () => {
    const p = party();
    const m = p.members[0]!;
    m.equipment.weapon = sword('old');
    m.bag.push(sword('new', { bonuses: { str: 9 } }));
    expect(moveItem(p, 'new', { kind: 'equip', memberId: 'm1' }, cfg40)).toEqual({ ok: true });
    expect(m.equipment.weapon!.id).toBe('new');
    expect(m.bag.map((i) => i.id)).toEqual(['old']);
    expect(p.bag).toHaveLength(0);
  });

  it('refuses the wrong slot and items that cannot be worn', () => {
    const p = party();
    p.bag.push(sword(), sword('junk', { slot: undefined }));
    expect(moveItem(p, 's1', { kind: 'equip', memberId: 'm1', slot: 'head' }, cfg40)).toMatchObject(
      { code: 'wrong_slot' },
    );
    expect(moveItem(p, 'junk', { kind: 'equip', memberId: 'm1' }, cfg40)).toMatchObject({
      code: 'not_equippable',
    });
    expect(p.bag).toHaveLength(2);
  });

  it('wearing an item another member wears swaps the two', () => {
    const p = party();
    p.members[0]!.equipment.weapon = sword('a');
    p.members[1]!.equipment.weapon = sword('b', { bonuses: { int: 5 } });
    moveItem(p, 'a', { kind: 'equip', memberId: 'm2' }, cfg40);
    expect(p.members[1]!.equipment.weapon!.id).toBe('a');
    expect(p.members[0]!.equipment.weapon!.id).toBe('b');
  });

  it('unequips into a personal bag and clamps health to the new maximum', () => {
    const p = party();
    const m = p.members[0]!;
    m.equipment.body = sword('plate', { slot: 'body', bonuses: { vit: 20 } });
    m.hp = memberDerived(m, p.level).maxHp;
    moveItem(p, 'plate', { kind: 'personal', memberId: 'm1' }, cfg40);
    expect(m.equipment.body).toBeUndefined();
    expect(m.bag.map((i) => i.id)).toEqual(['plate']);
    expect(m.hp).toBeLessThanOrEqual(memberDerived(m, p.level).maxHp);
  });

  it('favorite, discard and sell work on personal items', () => {
    const p = party();
    p.members[1]!.bag.push(sword('a'), sword('b'));
    expect(setFavorite(p, 'a', true)).toEqual({ ok: true });
    expect(discardItem(p, 'a')).toMatchObject({ code: 'favorite' });
    expect(discardItem(p, 'b')).toEqual({ ok: true });
    expect(p.members[1]!.bag.map((i) => i.id)).toEqual(['a']);
    p.members[1]!.equipment.weapon = sword('w');
    expect(discardItem(p, 'w')).toMatchObject({ code: 'no_item' });
  });

  it('a party bag size overrides the default capacity', () => {
    const p = party();
    p.bagSize = 1;
    p.bag.push(sword('a'));
    p.members[0]!.bag.push(sword('b'));
    expect(moveItem(p, 'b', { kind: 'bag' }, cfg40)).toMatchObject({ code: 'bag_full' });
    p.bagSize = 2;
    expect(moveItem(p, 'b', { kind: 'bag' }, cfg40)).toEqual({ ok: true });
  });

  it('sorts the shared bag: favorites, then rarity, then level', () => {
    const p = party();
    p.bag.push(
      sword('c', { rarity: 'common' }),
      sword('e', { rarity: 'epic', itemLevel: 2 }),
      sword('f', { rarity: 'common', favorite: true }),
      sword('r', { rarity: 'rare' }),
    );
    sortBag(p);
    expect(p.bag.map((i) => i.id)).toEqual(['f', 'e', 'r', 'c']);
  });
});
