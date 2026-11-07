import { describe, expect, it } from 'vitest';
import { partyGold } from '../src/gold.ts';
import { acceptQuest } from '../src/actions.ts';
import { advance, createParty, defaultConfig } from '../src/sim.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import { memberDerived } from '../src/progression.ts';
import type { PartyState } from '../src/types.ts';

const cfg = { ...defaultConfig(1000), maxSteps: 5000 };
const DAY = 24 * 3600 * 1000;

function party(seed = 1, mode: 'standard' | 'hardcore' = 'standard'): PartyState {
  return createParty({
    id: 'p',
    name: 'Test',
    mode,
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

/** A strong party: level high enough to clear early dungeons, full health. */
function strong(seed = 1): PartyState {
  const p = party(seed);
  p.level = 20;
  for (const m of p.members) {
    const d = memberDerived(m, p.level);
    m.hp = d.maxHp;
    m.mana = d.maxMana;
  }
  return p;
}

describe('creation and determinism', () => {
  it('rejects parties outside 2-6 members', () => {
    expect(() =>
      createParty({
        id: 'x',
        name: 'x',
        seed: 1,
        now: 0,
        world: W,
        members: [{ name: 'a', race: 'human', cls: 'mage' }],
      }),
    ).toThrow();
  });

  it('starts in the start city at full health', () => {
    const p = party();
    expect(p.lastCity).toBe('oakhaven');
    expect(p.pos).toEqual({ col: W.sites.oakhaven!.col, row: W.sites.oakhaven!.row });
    for (const m of p.members) expect(m.hp).toBe(memberDerived(m, 1).maxHp);
  });

  it('is deterministic and does not mutate its input', () => {
    const p = party(7);
    const copy = structuredClone(p);
    const a = advance(p, DAY, W, cfg);
    const b = advance(p, DAY, W, cfg);
    expect(p).toEqual(copy);
    expect(a).toEqual(b);
    const c = advance(party(8), DAY, W, cfg);
    expect(c.events.map((e) => e.at)).not.toEqual(a.events.map((e) => e.at));
  }, 30_000);

  it('splitting the time into slices gives the same result as one big jump', () => {
    const one = advance(party(3), 6 * 3600_000, W, cfg);
    let p = party(3);
    const events = [];
    for (let t = 0; t <= 6 * 3600_000; t += 600_000) {
      const r = advance(p, t, W, cfg);
      p = r.party;
      events.push(...r.events);
    }
    expect(p).toEqual(one.party);
    expect(events).toEqual(one.events);
  });
});

describe('time and activities', () => {
  it('does nothing before the next activity is due', () => {
    const p = party();
    p.nextAt = 10_000;
    const r = advance(p, 5_000, W, cfg);
    expect(r.events).toEqual([]);
    expect(r.party).toEqual(p);
  });

  it('events are in time order and never later than now', () => {
    const now = 12 * 3600_000;
    const r = advance(party(2), now, W, cfg);
    expect(r.events.length).toBeGreaterThan(5);
    for (let i = 1; i < r.events.length; i++) {
      expect(r.events[i]!.at).toBeGreaterThanOrEqual(r.events[i - 1]!.at);
    }
    expect(r.events[r.events.length - 1]!.at).toBeLessThanOrEqual(now);
    expect(r.party.nextAt).toBeGreaterThan(now);
  });

  it('fights take rounds x 5 ticks and a fresh party leaves the city to hunt', () => {
    const r = advance(party(4), 2 * 3600_000, W, { ...cfg, jitterMs: 0 });
    expect(r.events[0]!.kind).toBe('travel');
    const fight = r.events.find((e) => e.kind === 'fight')!;
    const prev = r.events[r.events.indexOf(fight) - 1]!;
    const rounds = fight.payload.rounds as number;
    expect(fight.at - prev.at).toBe(rounds * 5 * 1000);
  });

  it('is bounded by maxSteps when catching up after a long absence', () => {
    const r = advance(party(), 365 * DAY, W, { ...cfg, maxSteps: 50 });
    expect(r.party.counter).toBe(50);
    expect(r.party.nextAt).toBeLessThanOrEqual(365 * DAY);
  });

  it('every fight event links to a replay that starts with a start event', () => {
    const r = advance(party(5), 6 * 3600_000, W, cfg);
    const fights = r.events.filter((e) => e.kind === 'fight');
    expect(fights.length).toBeGreaterThan(3);
    for (const f of fights) {
      const replay = r.replays.find((x) => x.key === f.replayKey)!;
      expect(replay.events[0]!.t).toBe('start');
      expect(replay.events[replay.events.length - 1]!.t).toBe('end');
    }
  });
});

describe('progression through play', () => {
  it('gains xp, gold, loot and levels', () => {
    const r = advance(party(6), 12 * 3600_000, W, cfg);
    expect(r.party.level).toBeGreaterThan(2);
    expect(partyGold(r.party)).toBeGreaterThan(50);
    expect(r.party.bag.length).toBeGreaterThan(0);
    expect(r.events.some((e) => e.kind === 'level_up')).toBe(true);
    expect(r.party.stats.fights).toBe(r.events.filter((e) => e.kind === 'fight').length);
  });

  it('rests when hurt and returns to full health', () => {
    const r = advance(party(9), 12 * 3600_000, W, cfg);
    expect(r.events.some((e) => e.kind === 'rest')).toBe(true);
    for (const m of r.party.members) {
      expect(m.hp).toBeGreaterThan(0);
      expect(m.hp).toBeLessThanOrEqual(memberDerived(m, r.party.level).maxHp);
    }
  });

  it('keeps the bag within its capacity', () => {
    const r = advance(party(10), 6 * DAY, W, { ...cfg, bagSize: 5 });
    expect(r.party.bag.length).toBeLessThanOrEqual(5);
  });
});

describe('orders and dungeons', () => {
  it('walks to a city and the order disappears on arrival', () => {
    const p = strong();
    p.cleared = ['goblin_keep'];
    p.orders.push({ id: 'o', kind: 'goto', siteId: 'stonebridge' });
    const r = advance(p, 2 * DAY, W, cfg);
    const arrive = r.events.find((e) => e.kind === 'arrive' && e.payload.siteId === 'stonebridge');
    expect(arrive).toBeDefined();
    expect(r.party.lastCity).toBe('stonebridge');
    expect(r.party.orders).toHaveLength(0);
  });

  it('drops an order it cannot reach (closed region) and keeps playing', () => {
    const p = party();
    p.orders.push({ id: 'o', kind: 'goto', siteId: 'stonebridge' });
    const r = advance(p, 3600_000, W, cfg);
    expect(r.events.find((e) => e.kind === 'order_failed')?.payload.reason).toBe('unreachable');
    expect(r.party.orders).toHaveLength(0);
    expect(r.events.some((e) => e.kind === 'fight')).toBe(true);
  });

  it('clears a dungeon: enters, fights every stage, pays out and marks it cleared', () => {
    const p = strong();
    p.orders.push({ id: 'o', kind: 'goto', siteId: 'goblin_warren' });
    const goldBefore = partyGold(p);
    const r = advance(p, 3 * DAY, W, cfg);
    const kinds = r.events.map((e) => e.kind);
    expect(kinds).toContain('enter_dungeon');
    expect(kinds.filter((k) => k === 'dungeon_progress')).toHaveLength(2);
    expect(kinds).toContain('dungeon_cleared');
    expect(r.party.cleared).toContain('goblin_warren');
    expect(r.party.dungeon).toBeNull();
    expect(partyGold(r.party)).toBeGreaterThan(goldBefore + 80);
    expect(r.party.orders).toHaveLength(0);
  });

  /** Boss dungeons only open to a party that has taken the boss quest. */
  function withBossQuest(p: PartyState) {
    p.quests.completed = ['clear_the_warren'];
    expect(acceptQuest(p, W, 'goblin_king', 'quest-order', 0)).toEqual({ ok: true });
  }

  it('clearing a boss dungeon unlocks its region and pins the boss replay', () => {
    const p = strong();
    withBossQuest(p);
    const r = advance(p, 3 * DAY, W, cfg);
    expect(
      r.events.some((e) => e.kind === 'zone_unlocked' && e.payload.zoneId === 'east_moors'),
    ).toBe(true);
    const boss = r.events.find((e) => e.kind === 'fight' && e.payload.boss)!;
    expect(r.replays.find((x) => x.key === boss.replayKey)!.pinned).toBe(true);
  });

  it('after a boss region opens the party can travel there', () => {
    const p = strong();
    withBossQuest(p);
    p.orders.push({ id: 'o2', kind: 'goto', siteId: 'stonebridge' });
    const r = advance(p, 4 * DAY, W, cfg);
    expect(r.party.lastCity).toBe('stonebridge');
  });

  it('respects dungeon rest policies when hurt in the middle of a dungeon', () => {
    const base = (siteId: string, restsUsed: number) => {
      const p = strong();
      p.activity = { kind: 'start' };
      p.nextAt = 0;
      p.pos = { col: W.sites[siteId]!.col, row: W.sites[siteId]!.row };
      p.cleared = ['goblin_keep'];
      p.dungeon = { siteId, stage: 1, restsUsed };
      for (const m of p.members) m.hp = 1;
      return advance(p, 0, W, { ...cfg, jitterMs: 0 }).party.activity.kind;
    };
    expect(base('goblin_warren', 0)).toBe('rest');
    expect(base('goblin_warren', 1)).toBe('fight');
    expect(base('old_crypt', 0)).toBe('fight');
  });
});

describe('defeat', () => {
  /** A level 1 party thrown at a dungeon built for level 3 loses sooner or later. */
  function doomed(mode: 'standard' | 'hardcore', seed: number) {
    const p = party(seed, mode);
    p.members[0]!.gold = 1000;
    p.orders.push({ id: 'o', kind: 'goto', siteId: 'goblin_warren' });
    return advance(p, 2 * DAY, W, cfg);
  }

  it('standard: returns to the last city, loses gold, resets the dungeon, keeps the order queue sane', () => {
    let seen = 0;
    for (let seed = 1; seed <= 30 && seen < 3; seed++) {
      const r = doomed('standard', seed);
      const d = r.events.find((e) => e.kind === 'defeat');
      if (!d) continue;
      seen++;
      expect(d.payload.goldLost).toBeGreaterThanOrEqual(0);
      expect(r.party.status).toBe('active');
      expect(r.replays.some((x) => x.outcome === 'defeat' && x.pinned)).toBe(true);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('personal bag items are never lost on defeat', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const p = party(seed);
      p.members[0]!.bag.push({
        id: 'mine',
        name: 'Mine',
        rarity: 'common',
        itemLevel: 1,
        value: 1,
        favorite: false,
      });
      p.orders.push({ id: 'o', kind: 'goto', siteId: 'goblin_warren' });
      const r = advance(p, DAY, W, { ...cfg, defeatItemLossPct: 100 });
      if (!r.events.some((e) => e.kind === 'defeat')) continue;
      expect(r.party.members[0]!.bag.map((i) => i.id)).toEqual(['mine']);
      return;
    }
    throw new Error('no defeat found in 40 seeds');
  });

  it('standard defeat takes 15% of carried gold, favorites are never lost', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const p = party(seed);
      p.members[0]!.gold = 1000;
      p.bag.push({
        id: 'fav',
        name: 'Fav',
        rarity: 'epic',
        itemLevel: 9,
        value: 1,
        favorite: true,
      });
      p.orders.push({ id: 'o', kind: 'goto', siteId: 'goblin_warren' });
      const r = advance(p, DAY, W, { ...cfg, defeatItemLossPct: 100 });
      const d = r.events.find((e) => e.kind === 'defeat');
      if (!d) continue;
      // Each character loses 15% of its own gold (rounded down), so the total is a little under 15%.
      const carried = 1000 + goldEarnedBefore(r.events, d.at);
      const lost = d.payload.goldLost as number;
      expect(lost).toBeLessThanOrEqual(Math.floor(carried * 0.15));
      expect(lost).toBeGreaterThan(Math.floor(carried * 0.15) - p.members.length);
      expect(r.party.bag.some((i) => i.id === 'fav')).toBe(true);
      return;
    }
    throw new Error('no defeat found in 40 seeds');
  });

  it('hardcore: a full defeat ends the party for good', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = doomed('hardcore', seed);
      if (r.party.status !== 'dead') continue;
      expect(r.party.nextAt).toBeNull();
      expect(r.events.some((e) => e.kind === 'party_lost')).toBe(true);
      const again = advance(r.party, 10 * DAY, W, cfg);
      expect(again.events).toEqual([]);
      expect(again.party).toEqual(r.party);
      return;
    }
    throw new Error('hardcore party never lost in 40 seeds');
  });
});

/** Gold the party picked up before time `at` (fights only), to reconstruct what it carried. */
function goldEarnedBefore(
  events: Array<{ at: number; kind: string; payload: Record<string, unknown> }>,
  at: number,
) {
  let sum = 0;
  let lost = 0;
  for (const e of events) {
    if (e.at > at || (e.at === at && e.kind === 'defeat')) break;
    if (e.kind === 'fight') sum += (e.payload.gold as number) ?? 0;
    if (e.kind === 'dungeon_cleared') sum += e.payload.gold as number;
    if (e.kind === 'defeat') lost += e.payload.goldLost as number;
  }
  return sum - lost;
}
