import { describe, expect, it } from 'vitest';
import { abandonQuest, acceptQuest, addGotoOrder, MAX_ORDERS } from '../src/actions.ts';
import { MONSTERS } from '../src/monsters.ts';
import { memberDerived } from '../src/progression.ts';
import {
  activeQuest,
  currentObjectiveIndex,
  MAX_ACTIVE_QUESTS,
  questAvailability,
  zonesWithMonster,
} from '../src/quests.ts';
import { advance, createParty, defaultConfig, normalizeParty } from '../src/sim.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import type { PartyState } from '../src/types.ts';

const cfg = { ...defaultConfig(1000), maxSteps: 5000 };
const DAY = 24 * 3600 * 1000;

function party(seed = 1, level = 1): PartyState {
  const p = createParty({
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
  p.level = level;
  for (const m of p.members) {
    const d = memberDerived(m, level);
    m.hp = d.maxHp;
    m.mana = d.maxMana;
  }
  return p;
}

const accept = (p: PartyState, id: string) => acceptQuest(p, W, id, `o-${id}`, 0);

describe('quest data', () => {
  const quests = Object.values(W.quests);

  it('only refers to monsters, places and quests that exist', () => {
    for (const q of quests) {
      expect(q.objectives.length).toBeGreaterThan(0);
      for (const o of q.objectives) {
        if (o.type === 'kill') {
          expect(MONSTERS[o.template], `${q.id}: ${o.template}`).toBeDefined();
          expect(o.count).toBeGreaterThan(0);
        } else {
          expect(W.sites[o.siteId], `${q.id}: ${o.siteId}`).toBeDefined();
        }
      }
      for (const r of q.requires ?? []) expect(W.quests[r], `${q.id} requires ${r}`).toBeDefined();
      expect(q.reward.gold).toBeGreaterThan(0);
      expect(q.reward.xp).toBeGreaterThan(0);
    }
  });

  it('has no circular prerequisites', () => {
    const visiting = new Set<string>();
    const visit = (id: string) => {
      expect(visiting.has(id), `cycle at ${id}`).toBe(false);
      visiting.add(id);
      for (const r of W.quests[id]!.requires ?? []) visit(r);
      visiting.delete(id);
    };
    for (const q of quests) visit(q.id);
  });

  it('every quest-gated boss dungeon is cleared by that quest', () => {
    for (const s of Object.values(W.sites)) {
      if (!s.requiresQuest) continue;
      const q = W.quests[s.requiresQuest]!;
      expect(q.objectives.some((o) => o.type === 'clear' && o.siteId === s.id)).toBe(true);
    }
  });

  it('every monster a kill quest asks for can be met somewhere', () => {
    for (const q of quests) {
      for (const o of q.objectives) {
        if (o.type === 'kill') {
          expect(zonesWithMonster(W, o.template, Object.keys(W.sites)).length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('availability, accepting and abandoning', () => {
  it('locks quests by level, by prerequisite and by closed regions', () => {
    const p = party(1, 1);
    expect(questAvailability(p, W, W.quests.pest_control!)).toEqual({ status: 'available' });
    expect(questAvailability(p, W, W.quests.clear_the_warren!)).toMatchObject({ status: 'locked' });
    p.level = 5;
    expect(questAvailability(p, W, W.quests.clear_the_warren!).reason).toMatch(/Scout the warren/);
    p.quests.completed = ['goblin_king'];
    // The prerequisite is done but the keep was never cleared, so the Ashen Hills are still shut.
    p.level = 8;
    expect(questAvailability(p, W, W.quests.orc_menace!).reason).toMatch(/closed/);
    p.cleared = ['goblin_keep'];
    expect(questAvailability(p, W, W.quests.orc_menace!)).toEqual({ status: 'available' });
  });

  it('accepting adds progress and a quest order; the same quest cannot be taken twice', () => {
    const p = party();
    expect(accept(p, 'pest_control')).toEqual({ ok: true });
    expect(p.quests.active).toEqual([{ id: 'pest_control', progress: [0] }]);
    expect(p.orders).toEqual([{ id: 'o-pest_control', kind: 'quest', questId: 'pest_control' }]);
    expect(accept(p, 'pest_control')).toMatchObject({ code: 'already_active' });
    expect(accept(p, 'nonsense')).toMatchObject({ code: 'no_quest' });
    expect(accept(p, 'clear_the_warren')).toMatchObject({ code: 'quest_locked' });
  });

  it('limits the number of active quests and of orders', () => {
    const p = party(1, 10);
    const ids = [
      'pest_control',
      'wolves_at_the_door',
      'scout_the_warren',
      'archers_toll',
      'goblin_bounty',
    ];
    for (const id of ids) expect(accept(p, id)).toEqual({ ok: true });
    expect(p.quests.active).toHaveLength(MAX_ACTIVE_QUESTS);
    // A sixth quest that is otherwise available is refused because the log is full.
    p.quests.completed = ['scout_the_warren'];
    expect(accept(p, 'clear_the_warren')).toMatchObject({ code: 'too_many_quests' });

    const q = party();
    for (let i = 0; i < MAX_ORDERS; i++)
      q.orders.push({ id: `x${i}`, kind: 'goto', siteId: 'oakhaven' });
    expect(accept(q, 'pest_control')).toMatchObject({ code: 'too_many_orders' });
  });

  it('abandoning removes the quest and its order and loses the progress', () => {
    const p = party();
    accept(p, 'pest_control');
    p.quests.active[0]!.progress[0] = 5;
    expect(abandonQuest(p, 'pest_control')).toEqual({ ok: true });
    expect(p.quests.active).toEqual([]);
    expect(p.orders).toEqual([]);
    expect(abandonQuest(p, 'pest_control')).toMatchObject({ code: 'no_quest' });
    accept(p, 'pest_control');
    expect(activeQuest(p, 'pest_control')!.progress).toEqual([0]);
  });

  it('a waiting party starts moving as soon as it takes a quest', () => {
    const p = party();
    p.activity = { kind: 'town', startedAt: 0, ticks: 60 };
    p.nextAt = 3_600_000;
    acceptQuest(p, W, 'pest_control', 'o', 5000);
    expect(p.nextAt).toBe(5000);
  });

  it('boss dungeons refuse a plain go-to order until their quest is taken', () => {
    const p = party(1, 6);
    p.quests.completed = ['clear_the_warren'];
    expect(addGotoOrder(p, W, 'goblin_keep', 'a', 0)).toMatchObject({ code: 'quest_required' });
    expect(addGotoOrder(p, W, 'goblin_warren', 'b', 0)).toEqual({ ok: true });
    expect(addGotoOrder(p, W, 'goblin_warren', 'c', 0)).toMatchObject({ code: 'duplicate_order' });
    expect(addGotoOrder(p, W, 'nowhere', 'd', 0)).toMatchObject({ code: 'no_site' });
    accept(p, 'goblin_king');
    expect(addGotoOrder(p, W, 'goblin_keep', 'e', 0)).toEqual({ ok: true });
  });

  it('the simulation also drops a gated order that slipped in without the quest', () => {
    const p = party(1, 10);
    p.orders.push({ id: 'o', kind: 'goto', siteId: 'goblin_keep' });
    const r = advance(p, 3600_000, W, cfg);
    expect(r.events.find((e) => e.kind === 'order_failed')?.payload.reason).toBe('quest_required');
    expect(r.events.some((e) => e.kind === 'enter_dungeon')).toBe(false);
  });
});

describe('playing quests', () => {
  it('a kill quest sends the party after that monster, pays out and finishes the order', () => {
    const p = party(3);
    accept(p, 'pest_control');
    const r = advance(p, 12 * 3600_000, W, cfg);
    const done = r.events.findIndex((e) => e.kind === 'quest_completed');
    expect(done).toBeGreaterThan(-1);
    expect(r.events[done]!.payload).toMatchObject({ questId: 'pest_control', gold: 60, xp: 160 });
    expect(r.party.quests.completed).toContain('pest_control');
    expect(r.party.quests.active).toEqual([]);
    expect(r.party.orders).toEqual([]);

    // While the quest was open, every wild fight was against goblins.
    const fights = r.events.slice(0, done).filter((e) => e.kind === 'fight');
    expect(fights.length).toBeGreaterThan(2);
    for (const f of fights) expect(String(f.payload.title)).toContain('Goblin pack');
  });

  it('kills count for every active quest that wants them', () => {
    const p = party(4);
    accept(p, 'pest_control');
    accept(p, 'goblin_bounty');
    const r = advance(p, DAY, W, cfg);
    const done = r.events.filter((e) => e.kind === 'quest_completed').map((e) => e.payload.questId);
    expect(done).toContain('pest_control');
    expect(done).toContain('goblin_bounty');
  });

  it('a repeatable quest can be taken again; a normal one cannot', () => {
    const p = party(5);
    accept(p, 'goblin_bounty');
    accept(p, 'pest_control');
    const r = advance(p, DAY, W, cfg);
    expect(questAvailability(r.party, W, W.quests.pest_control!).status).toBe('completed');
    expect(questAvailability(r.party, W, W.quests.goblin_bounty!).status).toBe('available');
  });

  it('a visit quest is done on arrival, without going into the dungeon', () => {
    const p = party(6, 2);
    accept(p, 'scout_the_warren');
    const r = advance(p, 6 * 3600_000, W, cfg);
    const kinds = r.events.map((e) => e.kind);
    expect(kinds).toContain('arrive');
    expect(r.events.find((e) => e.kind === 'quest_completed')?.payload.questId).toBe(
      'scout_the_warren',
    );
    expect(kinds).not.toContain('enter_dungeon');
  });

  it('a clear quest goes through the dungeon and rewards the item', () => {
    const p = party(7, 20);
    p.quests.completed = ['scout_the_warren'];
    accept(p, 'clear_the_warren');
    const r = advance(p, 3 * DAY, W, cfg);
    const kinds = r.events.map((e) => e.kind);
    expect(kinds).toContain('dungeon_cleared');
    expect(kinds).toContain('quest_completed');
    const reward = r.party.bag.find((i) => i.name === 'Fine Iron Dagger');
    expect(reward).toMatchObject({ slot: 'weapon', favorite: true });
    expect(r.party.orders).toEqual([]);
  });

  it('a clear objective is met at once if the dungeon was already cleared', () => {
    const p = party(8, 20);
    p.quests.completed = ['scout_the_warren'];
    p.cleared = ['goblin_warren'];
    accept(p, 'clear_the_warren');
    const r = advance(p, 3600_000, W, cfg);
    expect(r.events.some((e) => e.kind === 'quest_completed')).toBe(true);
    expect(r.events.some((e) => e.kind === 'enter_dungeon')).toBe(false);
  });

  it('the boss quest opens the boss dungeon, completes on the kill and unlocks the region', () => {
    const p = party(9, 20);
    p.quests.completed = ['clear_the_warren'];
    accept(p, 'goblin_king');
    const r = advance(p, 3 * DAY, W, cfg);
    const kinds = r.events.map((e) => e.kind);
    expect(kinds).toContain('enter_dungeon');
    expect(kinds).toContain('zone_unlocked');
    expect(r.party.quests.completed).toContain('goblin_king');
    expect(r.party.cleared).toContain('goblin_keep');
    expect(r.events.find((e) => e.kind === 'quest_completed')?.payload.item).toBe(
      'Superior Bone Charm',
    );
  });

  it('hunts in another region when the monster only lives there', () => {
    const p = party(10, 9);
    p.cleared = ['goblin_keep'];
    p.quests.completed = ['goblin_king'];
    accept(p, 'orc_menace');
    const r = advance(p, 8 * 3600_000, W, cfg);
    const firstFight = r.events.find((e) => e.kind === 'fight')!;
    expect(String(firstFight.payload.title)).toMatch(/^Ashen Hills/);
    expect(r.events.some((e) => e.kind === 'travel')).toBe(true);
    const prog = r.party.quests.active[0];
    expect(prog === undefined || prog.progress[0]! > 0).toBe(true);
  });

  it('quest rewards that level the party grant attribute points and a level-up event', () => {
    const p = party(11, 5);
    p.quests.completed = ['clear_the_warren'];
    p.cleared = ['goblin_warren'];
    p.xp = 0;
    const before = p.level;
    accept(p, 'goblin_king');
    const r = advance(p, 3 * DAY, W, cfg);
    expect(r.party.level).toBeGreaterThan(before);
    expect(r.events.some((e) => e.kind === 'level_up')).toBe(true);
  });

  it('is deterministic and splitting time does not change the outcome', () => {
    const make = () => {
      const p = party(12);
      accept(p, 'wolves_at_the_door');
      return p;
    };
    const one = advance(make(), 8 * 3600_000, W, cfg);
    let p = make();
    for (let t = 0; t <= 8 * 3600_000; t += 600_000) p = advance(p, t, W, cfg).party;
    expect(p).toEqual(one.party);
  });
});

describe('older saves', () => {
  it('get an empty quest log', () => {
    const p = party() as unknown as Record<string, unknown>;
    delete p.quests;
    const fixed = normalizeParty(p as unknown as PartyState, W);
    expect(fixed.quests).toEqual({ active: [], completed: [] });
  });

  it('progress helpers point at the first unfinished objective', () => {
    const def = W.quests.pest_control!;
    expect(currentObjectiveIndex(def, { id: def.id, progress: [3] })).toBe(0);
    expect(currentObjectiveIndex(def, { id: def.id, progress: [8] })).toBe(-1);
  });
});
