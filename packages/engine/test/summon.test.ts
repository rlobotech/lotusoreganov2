import { describe, expect, it } from 'vitest';
import { runCombat } from '../src/combat.ts';
import { formatLog } from '../src/format.ts';
import { LOG_FORMAT_VERSION, MAX_ROUNDS, type CombatEvent, type SkillDef } from '../src/types.ts';
import { bolt, melee, openArena, unitDef } from './helpers.ts';

const imp: SkillDef = {
  id: 'call_imp',
  name: 'Call Imp',
  kind: 'summon',
  source: 'spell',
  attr: 'int',
  power: 0,
  range: 0,
  manaCost: 0,
  cooldown: 0,
  side: 'self',
  summon: {
    group: 'demon',
    name: 'Imp',
    shares: { str: 0.3, dex: 0.7, int: 0.8, vit: 0.5, wis: 0.3 },
    move: 3,
    skills: ['imp_bolt'],
    ai: [{ skill: 'imp_bolt' }],
  },
};
const impBolt: SkillDef = { ...bolt, id: 'imp_bolt', name: 'Imp Bolt', range: 4 };
const skeleton: SkillDef = {
  ...imp,
  id: 'call_skeleton',
  name: 'Call Skeleton',
  summon: {
    group: 'skeleton',
    name: 'Skeleton',
    shares: { str: 0.6, dex: 0.5, int: 0.1, vit: 0.8, wis: 0.1 },
    move: 3,
    skills: ['attack'],
    ai: [{ skill: 'attack' }],
    weapon: { type: 'cut', quality: 0.7 },
  },
};
const skills = { call_imp: imp, imp_bolt: impBolt, call_skeleton: skeleton, attack: melee, bolt };

/** An enemy that cannot hurt anyone, so a fight runs long and nothing dies. */
const dummy = () =>
  unitDef('dummy', 'enemy', [], [], { attributes: { str: 1, dex: 1, int: 1, vit: 900, wis: 1 } });

const summons = (events: CombatEvent[]) =>
  events.filter((e): e is Extract<CombatEvent, { t: 'summon' }> => e.t === 'summon');

function fight(
  caster: Parameters<typeof unitDef>[4],
  extra: Parameters<typeof unitDef>[3] = [{ skill: 'call_imp' }],
  spells: string[] = ['call_imp'],
) {
  return runCombat({
    seed: 3,
    arena: openArena(9, 5),
    units: [
      unitDef('c', 'party', [...spells, 'bolt'], [...extra, { skill: 'bolt' }], caster),
      dummy(),
    ],
    skills,
  });
}

describe('summons', () => {
  it('appear beside the caster, on its team, with a log event', () => {
    const r = fight({});
    expect(LOG_FORMAT_VERSION).toBe(3);
    const [s] = summons(r.events);
    expect(s).toBeDefined();
    expect(s!.caster).toBe('c');
    expect(s!.team).toBe('party');
    expect(s!.name).toBe('Imp');
    expect(s!.unit).toBe('c~demon1');
    // The first caster stands on the left edge; the summon is on a neighbouring tile.
    const start = r.events[0] as Extract<CombatEvent, { t: 'start' }>;
    const c = start.units.find((u) => u.id === 'c')!;
    expect(Math.max(Math.abs(s!.x - c.x), Math.abs(s!.y - c.y))).toBe(1);
    // It arrives right after the skill that called it.
    const i = r.events.indexOf(s!);
    expect(r.events[i - 1]).toMatchObject({ t: 'skill', unit: 'c', skill: 'call_imp' });
    expect(r.units.find((u) => u.id === s!.unit)).toMatchObject({ team: 'party', summon: true });
    expect(formatLog(r.events).join('\n')).toMatch(/Imp/);
  });

  it('act in the turn they are called, last in line, and fight', () => {
    const r = fight({});
    const [s] = summons(r.events);
    const at = r.events.indexOf(s!);
    // The turns of the round it came in: the summon takes the last one, after everyone else.
    let start = at;
    while (r.events[start]!.t !== 'round') start -= 1;
    let end = at;
    while (end < r.events.length && r.events[end]!.t !== 'round' && r.events[end]!.t !== 'end')
      end += 1;
    const turns = r.events.slice(start, end).flatMap((e) => (e.t === 'turn' ? [e.unit] : []));
    expect(turns[turns.length - 1]).toBe(s!.unit);
    expect(turns.filter((u) => u === s!.unit)).toHaveLength(1);
    // The round listed only the units that were there when it began...
    const round = r.events[start] as Extract<CombatEvent, { t: 'round' }>;
    expect(round.order).not.toContain(s!.unit);
    // ...and later rounds list it in their order.
    const later = r.events.filter(
      (e): e is Extract<CombatEvent, { t: 'round' }> => e.t === 'round' && r.events.indexOf(e) > at,
    );
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((e) => e.order.includes(s!.unit))).toBe(true);
    // It uses its own skill on the enemy, already in that first round.
    const firstHit = r.events.findIndex((e) => e.t === 'damage' && e.source === s!.unit);
    expect(firstHit).toBeGreaterThan(at);
    expect(r.events.slice(at, firstHit).every((e) => e.t !== 'round')).toBe(true);
  });

  it('are limited to one of a kind by default, and the AI falls back to its other skills', () => {
    const r = fight({});
    expect(summons(r.events)).toHaveLength(1);
    expect(r.units.filter((u) => u.summon)).toHaveLength(1);
    const bolts = r.events.filter((e) => e.t === 'skill' && e.unit === 'c' && e.skill === 'bolt');
    expect(bolts.length).toBeGreaterThan(0);
  });

  it('can have more than one of a kind when the caster has a higher limit', () => {
    const r = fight(
      { summonLimits: { skeleton: 3 } },
      [{ skill: 'call_skeleton' }],
      ['call_skeleton'],
    );
    expect(summons(r.events).map((s) => s.unit)).toEqual([
      'c~skeleton1',
      'c~skeleton2',
      'c~skeleton3',
    ]);
    // Two kinds do not share a limit.
    const both = fight(
      { summonLimits: { skeleton: 2, demon: 1 } },
      [{ skill: 'call_imp' }, { skill: 'call_skeleton' }],
      ['call_imp', 'call_skeleton'],
    );
    const names = summons(both.events)
      .map((s) => s.name)
      .sort();
    expect(names).toEqual(['Imp', 'Skeleton', 'Skeleton']);
  });

  it('call a replacement when one dies, never above the limit at once', () => {
    // A fragile summon and a hard-hitting enemy: the imp keeps dying and is called again, but only
    // one is out at a time. The caster is tough enough to last.
    const glass: SkillDef = {
      ...imp,
      id: 'call_glass',
      summon: { ...imp.summon!, shares: { str: 0.3, dex: 0.7, int: 0.8, vit: 0.01, wis: 0.3 } },
    };
    // The enemy goes for whoever has the least health: the imp.
    const killer = unitDef('k', 'enemy', ['attack'], [{ skill: 'attack', order: 'lowest_hp' }], {
      attributes: { str: 120, dex: 5, int: 1, vit: 400, wis: 1 },
    });
    const r = runCombat({
      seed: 5,
      arena: openArena(5, 3),
      units: [
        unitDef(
          'c',
          'party',
          ['call_glass', 'bolt'],
          [{ skill: 'call_glass' }, { skill: 'bolt' }],
          {
            attributes: { str: 5, dex: 5, int: 12, vit: 900, wis: 5 },
          },
        ),
        killer,
      ],
      skills: { ...skills, call_glass: glass },
    });
    let out = 0;
    let max = 0;
    for (const e of r.events) {
      if (e.t === 'summon') out += 1;
      if (e.t === 'death' && e.unit.startsWith('c~')) out -= 1;
      max = Math.max(max, out);
    }
    expect(summons(r.events).length).toBeGreaterThan(1);
    expect(max).toBe(1);
  });

  it('do not keep a team in the fight: when the caster falls the fight is lost', () => {
    const killer = unitDef('k', 'enemy', ['attack'], [{ skill: 'attack' }], {
      attributes: { str: 200, dex: 5, int: 1, vit: 400, wis: 1 },
    });
    const r = runCombat({
      seed: 2,
      arena: openArena(3, 3),
      units: [
        unitDef('c', 'party', ['call_imp'], [{ skill: 'call_imp' }], {
          attributes: { str: 1, dex: 1, int: 5, vit: 1, wis: 1 },
        }),
        killer,
      ],
      skills,
    });
    expect(r.outcome).toBe('defeat');
    expect(r.units.find((u) => u.id === 'c')!.alive).toBe(false);
  });

  it('take their strength from the skill (skillMods) and the caster', () => {
    // The imp's average bolt grows with the attributes it was given.
    const firstHit = (caster: Parameters<typeof unitDef>[4]) => {
      const r = fight(caster);
      const id = summons(r.events)[0]!.unit;
      const hits = r.events.flatMap((e) => (e.t === 'damage' && e.source === id ? [e.amount] : []));
      return hits.length ? hits.reduce((x, y) => x + y, 0) / hits.length : 0;
    };
    const plain = firstHit({});
    expect(plain).toBeGreaterThan(0);
    expect(firstHit({ skillMods: { call_imp: { power: 2 } } })).toBeGreaterThan(plain * 1.1);
    const weak = firstHit({ attributes: { str: 2, dex: 2, int: 3, vit: 3, wis: 2 } });
    const strong = firstHit({ attributes: { str: 20, dex: 20, int: 60, vit: 30, wis: 20 } });
    expect(strong).toBeGreaterThan(weak);
  });

  it('need a free tile beside the caster, and are skipped when there is none', () => {
    // A one-tile-wide corridor with a blocker on the only free neighbour.
    const arena = openArena(3, 1, [{ x: 1, y: 0 }]);
    const r = runCombat({
      seed: 1,
      arena,
      units: [unitDef('c', 'party', ['call_imp'], [{ skill: 'call_imp' }]), dummy()],
      skills,
    });
    expect(summons(r.events)).toHaveLength(0);
    expect(r.rounds).toBeLessThanOrEqual(MAX_ROUNDS);
  });

  it('are deterministic', () => {
    expect(JSON.stringify(fight({}).events)).toBe(JSON.stringify(fight({}).events));
  });
});
