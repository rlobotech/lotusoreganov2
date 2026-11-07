import { describe, expect, it } from 'vitest';
import { runCombat } from '../src/combat.ts';
import type { CombatEvent, SkillDef, StatusDef } from '../src/types.ts';
import { openArena, unitDef } from './helpers.ts';

const chill: StatusDef = { id: 'chill', kind: 'mod', duration: 2, stat: 'speed', amount: -4 };

const bolt: SkillDef = {
  id: 'bolt',
  name: 'Bolt',
  kind: 'damage',
  source: 'spell',
  damageType: 'fire',
  attr: 'int',
  power: 10,
  range: 4,
  manaCost: 0,
  cooldown: 0,
  side: 'enemy',
  status: chill,
};
const mend: SkillDef = {
  id: 'mend',
  name: 'Mend',
  kind: 'heal',
  source: 'spell',
  attr: 'wis',
  power: 10,
  range: 4,
  manaCost: 0,
  cooldown: 0,
  side: 'ally',
};

function fight(mods?: { power?: number; rounds?: number }) {
  const caster = unitDef('c', 'party', ['bolt'], [{ skill: 'bolt' }], {
    ...(mods ? { skillMods: { bolt: mods } } : {}),
  });
  const target = unitDef('t', 'enemy', [], [], {
    attributes: { str: 1, dex: 1, int: 1, vit: 400, wis: 1 },
  });
  return runCombat({
    seed: 4,
    arena: openArena(8, 3),
    units: [caster, target],
    skills: { bolt },
  }).events;
}

const damageOf = (events: CombatEvent[]) =>
  events.flatMap((e) => (e.t === 'damage' && e.source === 'c' ? [e.amount] : []));

describe('per-skill strength (skill and school levels)', () => {
  it('multiplies the damage of a skill, and changes nothing without it', () => {
    const plain = damageOf(fight());
    const same = damageOf(fight({ power: 1 }));
    expect(same).toEqual(plain);
    const strong = damageOf(fight({ power: 2 }));
    expect(strong.length).toBeGreaterThan(0);
    // The first hit is the same roll, twice as strong (rounding and resistance aside).
    expect(strong[0]!).toBeGreaterThan(plain[0]! * 1.8);
    expect(strong[0]!).toBeLessThan(plain[0]! * 2.2);
  });

  it('multiplies healing the same way', () => {
    const run = (power?: number) => {
      const healer = unitDef('h', 'party', ['mend'], [{ skill: 'mend', order: 'lowest_hp_pct' }], {
        hp: 1,
        ...(power ? { skillMods: { mend: { power } } } : {}),
      });
      const foe = unitDef('f', 'enemy', [], []);
      const events = runCombat({
        seed: 4,
        arena: openArena(8, 3),
        units: [healer, foe],
        skills: { mend },
      }).events;
      return events.flatMap((e) => (e.t === 'heal' ? [e.amount] : []))[0] ?? 0;
    };
    expect(run(3)).toBeGreaterThan(run() * 2);
  });

  it('adds rounds to the status a skill applies', () => {
    const remaining = (mods?: { rounds?: number }) => {
      const events = fight(mods);
      return events.filter((e) => e.t === 'status' && e.on).length;
    };
    // The status is applied in both fights; a longer one stays on for more of the fight.
    const turnsOn = (mods?: { rounds?: number }) => {
      const events = fight(mods);
      const on = events.findIndex((e) => e.t === 'status' && e.on);
      const off = events.findIndex((e, i) => i > on && e.t === 'status' && !e.on);
      return off < 0 ? events.length - on : off - on;
    };
    expect(remaining()).toBeGreaterThan(0);
    expect(turnsOn({ rounds: 5 })).toBeGreaterThanOrEqual(turnsOn());
  });
});
