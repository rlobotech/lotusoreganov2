import { describe, expect, it } from 'vitest';
import { runCombat } from '../src/combat.ts';
import * as samples from '../src/samples.ts';
import {
  attrMult,
  derive,
  hitChance,
  resistPct,
  SCALING,
  spellBase,
  weaponRange,
} from '../src/scaling.ts';
import type { ArenaDef, CombatEvent, SkillDef, UnitDef } from '../src/types.ts';
import { bolt, bow, melee, openArena, unitDef } from './helpers.ts';

/** A small open arena where both sides start where the test says. */
function arena(party: Array<[number, number]>, enemy: Array<[number, number]>): ArenaDef {
  return {
    ...openArena(12, 3),
    spawns: {
      party: party.map(([x, y]) => ({ x, y })),
      enemy: enemy.map(([x, y]) => ({ x, y })),
    },
  };
}

const of = (events: CombatEvent[], t: CombatEvent['t']) => events.filter((e) => e.t === t);

describe('scaling', () => {
  it('resistance grows with diminishing returns, is capped, and weaknesses go negative', () => {
    expect(resistPct(0, 10)).toBe(0);
    const a = resistPct(50, 10);
    const b = resistPct(100, 10);
    const c = resistPct(100000, 10);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b - a).toBeLessThan(a);
    expect(c).toBe(SCALING.resistCap);
    expect(resistPct(-100, 10)).toBeCloseTo(-b);
    // The same points are worth less at a higher level.
    expect(resistPct(100, 80)).toBeLessThan(resistPct(100, 10));
  });

  it('hit chance is even at equal stats and stays between 5% and 95%', () => {
    expect(hitChance(100, 100)).toBe(SCALING.hitEven);
    expect(hitChance(1000, 10)).toBe(SCALING.hitMax);
    expect(hitChance(10, 1000)).toBe(SCALING.hitMin);
    expect(hitChance(80, 100)).toBeLessThan(hitChance(100, 100));
  });

  it('level 1 has about 50 health and level 100 thousands', () => {
    const l1 = derive({ str: 9, dex: 5, int: 2, vit: 9, wis: 3 }, 1, 3).maxHp;
    expect(l1).toBeGreaterThanOrEqual(40);
    expect(l1).toBeLessThanOrEqual(60);
    const l100 = derive({ str: 100, dex: 40, int: 10, vit: 130, wis: 20 }, 100, 3).maxHp;
    expect(l100).toBeGreaterThan(5000);
    expect(l100).toBeLessThan(11000);
  });

  it('a spell hits for single digits at level 1 and hundreds to low thousands at level 100', () => {
    const l1 = spellBase(1) * attrMult(10);
    expect(l1).toBeGreaterThan(5);
    expect(l1).toBeLessThan(15);
    const l100 = spellBase(100) * attrMult(120);
    expect(l100).toBeGreaterThan(500);
    expect(l100).toBeLessThan(2500);
    const w = weaponRange(100, 'cut');
    expect(w.max).toBeGreaterThan(w.min);
  });
});

describe('damage types, resistance and extra damage', () => {
  const duel = (target: Partial<UnitDef>, attacker: Partial<UnitDef> = {}, skill = bolt) =>
    runCombat({
      seed: 7,
      arena: arena([[0, 1]], [[3, 1]]),
      skills: { bolt: skill, attack: melee },
      units: [
        unitDef('a', 'party', ['bolt'], [{ skill: 'bolt' }], attacker),
        unitDef('b', 'enemy', ['attack'], [], {
          attributes: { str: 1, dex: 1, int: 1, vit: 60, wis: 1 },
          ...target,
        }),
      ],
    });
  const firstDamage = (events: CombatEvent[]) =>
    events.find((e): e is Extract<CombatEvent, { t: 'damage' }> => e.t === 'damage')!;

  it('resistance takes a share off damage of that type only', () => {
    const plain = firstDamage(duel({}).events);
    const resisted = firstDamage(duel({ resist: { fire: 200 } }).events);
    const wrongType = firstDamage(duel({ resist: { water: 200 } }).events);
    const pct = resistPct(200, 5);
    expect(plain.type).toBe('fire');
    expect(resisted.resist).toBe(Math.round(pct * 100));
    expect(resisted.amount).toBeLessThan(plain.amount);
    expect(Math.abs(resisted.amount - plain.amount * (1 - pct))).toBeLessThanOrEqual(1);
    expect(wrongType.amount).toBe(plain.amount);
  });

  it('a weakness makes the damage bigger', () => {
    const plain = firstDamage(duel({}).events);
    const weak = firstDamage(duel({ resist: { fire: -200 } }).events);
    expect(weak.resist).toBeLessThan(0);
    expect(weak.amount).toBeGreaterThan(plain.amount);
  });

  it('spells never miss; weapon hits carry their hit chance', () => {
    const spell = duel({}).events;
    expect(of(spell, 'miss').filter((e) => e.t === 'miss' && e.skill === 'bolt')).toHaveLength(0);
    expect(firstDamage(spell).chance).toBeUndefined();
    const sword = runCombat({
      seed: 3,
      arena: arena([[0, 1]], [[1, 1]]),
      skills: { attack: melee },
      units: [
        unitDef('a', 'party', ['attack'], [{ skill: 'attack' }]),
        unitDef('b', 'enemy', ['attack'], [{ skill: 'attack' }]),
      ],
    }).events;
    const rolled = sword.filter((e) => e.t === 'damage' || e.t === 'miss');
    expect(rolled.length).toBeGreaterThan(0);
    for (const e of rolled) {
      const chance = e.t === 'miss' ? e.chance : e.chance;
      expect(chance).toBeGreaterThanOrEqual(5);
      expect(chance).toBeLessThanOrEqual(95);
    }
  });

  it('extra damage from the weapon is a second, separately resisted part of the hit', () => {
    const events = runCombat({
      seed: 11,
      arena: arena([[0, 1]], [[1, 1]]),
      skills: { attack: melee },
      units: [
        unitDef('a', 'party', ['attack'], [{ skill: 'attack' }], {
          weapon: weaponRange(5, 'cut'),
          extraDamage: [{ type: 'fire', min: 10, max: 10 }],
        }),
        unitDef('b', 'enemy', ['attack'], [], {
          attributes: { str: 1, dex: 1, int: 1, vit: 60, wis: 1 },
          resist: { fire: 300 },
        }),
      ],
    }).events;
    const dmg = events.filter(
      (e): e is Extract<CombatEvent, { t: 'damage' }> => e.t === 'damage' && e.target === 'b',
    );
    const main = dmg.find((e) => !e.extra)!;
    const extra = dmg.find((e) => e.extra)!;
    expect(main.type).toBe('cut');
    expect(extra.type).toBe('fire');
    expect(extra.resist).toBeGreaterThan(0);
    expect(extra.amount).toBeLessThan(10 * (main.crit ? 1.5 : 1));
  });

  it('a damage bonus status raises damage dealt', () => {
    const buffed = { id: 'buff', kind: 'mod', duration: 3, stat: 'damage', amount: 100 } as const;
    const buff: SkillDef = {
      ...melee,
      id: 'buff',
      kind: 'status',
      power: 0,
      side: 'self',
      range: 0,
      status: buffed,
    };
    const run = (rules: string[]) =>
      runCombat({
        seed: 5,
        arena: arena([[0, 1]], [[1, 1]]),
        skills: { attack: melee, buff },
        units: [
          unitDef(
            'a',
            'party',
            ['attack', 'buff'],
            rules.map((skill) => ({ skill })),
            { attributes: { str: 10, dex: 50, int: 5, vit: 30, wis: 5 } },
          ),
          unitDef('b', 'enemy', ['attack'], [], {
            attributes: { str: 1, dex: 1, int: 1, vit: 60, wis: 1 },
          }),
        ],
      }).events;
    const dmg = (events: CombatEvent[]) =>
      events.filter(
        (e): e is Extract<CombatEvent, { t: 'damage' }> => e.t === 'damage' && e.target === 'b',
      );
    const plain = dmg(run(['attack']))[0]!;
    const withBuff = dmg(run(['buff', 'attack']))[0];
    // The buff costs the first turn, so compare a later hit with the plain first hit.
    expect(withBuff).toBeDefined();
    expect(withBuff!.amount).toBeGreaterThan(plain.amount * 1.3);
  });
});

describe('movement, opportunity attacks and retreating', () => {
  const brute = unitDef('brute', 'enemy', ['attack'], [{ skill: 'attack' }], {
    attributes: { str: 12, dex: 3, int: 1, vit: 40, wis: 1 },
  });
  const archerWith = (skillIds: string[], rules: Array<{ skill: string; when?: object }>) =>
    unitDef('archer', 'party', skillIds, rules as UnitDef['ai'], {
      attributes: { str: 5, dex: 30, int: 1, vit: 40, wis: 1 },
      move: 3,
    });

  it('an enemy gets an opportunity attack when a ranged unit steps away, and the walk is split', () => {
    const r = runCombat({
      seed: 2,
      arena: arena([[2, 1]], [[3, 1]]),
      skills: { shoot: bow, attack: melee },
      units: [archerWith(['shoot'], [{ skill: 'shoot' }]), brute],
    });
    const ev = r.events;
    const reaction = ev.findIndex((e) => e.t === 'skill' && e.reaction);
    const shot = ev.findIndex((e) => e.t === 'skill' && e.unit === 'archer');
    expect(reaction).toBeGreaterThan(-1);
    expect(ev[reaction]).toMatchObject({
      unit: 'brute',
      skill: 'attack',
      target: 'archer',
      reaction: true,
    });
    // The reaction happens before the archer's own shot, and the move comes after it began.
    expect(reaction).toBeLessThan(shot);
    expect(ev.slice(0, shot).some((e) => e.t === 'move' && e.unit === 'archer')).toBe(true);
  });

  it('nobody gets more than one reaction per round', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const { events } = runCombat(samples.input(seed));
      let perUnit = new Map<string, number>();
      for (const e of events) {
        if (e.t === 'round') perUnit = new Map();
        if (e.t === 'skill' && e.reaction) {
          perUnit.set(e.unit, (perUnit.get(e.unit) ?? 0) + 1);
          expect(perUnit.get(e.unit)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('a retreat skill steps away after hitting and provokes nothing', () => {
    const backstep: SkillDef = { ...bow, id: 'backstep', retreat: 3 };
    const r = runCombat({
      seed: 2,
      arena: arena([[2, 1]], [[3, 1]]),
      skills: { backstep, attack: melee },
      units: [archerWith(['backstep'], [{ skill: 'backstep' }]), brute],
    });
    const first = r.events.findIndex((e) => e.t === 'skill' && e.unit === 'archer');
    expect(r.events.some((e) => e.t === 'skill' && e.reaction)).toBe(false);
    const step =
      r.events[
        first +
          1 +
          (r.events[first + 1]?.t === 'damage' || r.events[first + 1]?.t === 'miss' ? 1 : 0)
      ];
    expect(step).toMatchObject({ t: 'move', unit: 'archer', retreat: true });
    if (step?.t === 'move') {
      const end = step.path[step.path.length - 1]!;
      expect(Math.max(Math.abs(end.x - 3), Math.abs(end.y - 1))).toBeGreaterThan(1);
    }
  });

  it('a unit that cannot step away cheaply stays and shoots', () => {
    // Wedged in a corridor with the brute adjacent and nowhere to go.
    const corridor: ArenaDef = {
      id: 'corridor',
      width: 3,
      height: 1,
      blocked: [],
      spawns: { party: [{ x: 0, y: 0 }], enemy: [{ x: 1, y: 0 }] },
    };
    const r = runCombat({
      seed: 4,
      arena: corridor,
      skills: { shoot: bow, attack: melee },
      units: [archerWith(['shoot'], [{ skill: 'shoot' }]), brute],
    });
    expect(r.events.some((e) => e.t === 'move' && e.unit === 'archer')).toBe(false);
    expect(r.events.some((e) => e.t === 'skill' && e.unit === 'archer')).toBe(true);
  });

  it('a free skill leaves the action for another skill in the same turn', () => {
    const shout: SkillDef = {
      ...melee,
      id: 'shout',
      kind: 'status',
      source: 'spell',
      power: 0,
      range: 0,
      side: 'self',
      free: true,
      cooldown: 5,
      status: { id: 'shouting', kind: 'mod', duration: 2, stat: 'damage', amount: 10 },
    };
    const r = runCombat({
      seed: 1,
      arena: arena([[0, 1]], [[1, 1]]),
      skills: { attack: melee, shout },
      units: [
        unitDef('a', 'party', ['attack', 'shout'], [{ skill: 'shout' }, { skill: 'attack' }], {
          attributes: { str: 10, dex: 40, int: 1, vit: 40, wis: 1 },
        }),
        unitDef('b', 'enemy', ['attack'], [], {
          attributes: { str: 1, dex: 1, int: 1, vit: 40, wis: 1 },
        }),
      ],
    });
    const used = r.events
      .filter((e) => e.t === 'skill' && e.unit === 'a')
      .map((e) => e.t === 'skill' && e.skill);
    expect(used.slice(0, 2)).toEqual(['shout', 'attack']);
    const turns = r.events.filter((e) => e.t === 'turn' && e.unit === 'a');
    const firstTurn = r.events.findIndex((e) => e.t === 'turn' && e.unit === 'a');
    expect(turns.length).toBeGreaterThan(0);
    expect(r.events[firstTurn + 1]).toMatchObject({ t: 'skill', skill: 'shout' });
  });

  it('a unit killed by an opportunity attack stops walking', () => {
    const r = runCombat({
      seed: 3,
      arena: arena([[2, 1]], [[3, 1]]),
      skills: { shoot: bow, attack: melee },
      units: [
        { ...archerWith(['shoot'], [{ skill: 'shoot' }]), hp: 1 },
        { ...brute, attributes: { str: 40, dex: 40, int: 1, vit: 40, wis: 1 } },
      ],
    });
    const death = r.events.findIndex((e) => e.t === 'death' && e.unit === 'archer');
    if (death >= 0) {
      const after = r.events.slice(death + 1);
      expect(after.some((e) => e.t === 'move' && e.unit === 'archer')).toBe(false);
      expect(after.some((e) => e.t === 'skill' && e.unit === 'archer')).toBe(false);
    }
  });

  it('a stunned enemy does not get an opportunity attack', () => {
    const stunned = { ...brute, ai: [] };
    // Stun the brute for its whole round by giving it a stun status through a custom skill.
    const stun: SkillDef = {
      ...melee,
      id: 'stun',
      source: 'spell',
      power: 0,
      range: 5,
      kind: 'status',
      status: { id: 'stun', kind: 'stun', duration: 3 },
    };
    const r = runCombat({
      seed: 6,
      arena: arena(
        [
          [2, 1],
          [0, 1],
        ],
        [[3, 1]],
      ),
      skills: { shoot: bow, attack: melee, stun },
      units: [
        archerWith(['shoot'], [{ skill: 'shoot' }]),
        unitDef('caster', 'party', ['stun'], [{ skill: 'stun' }], {
          attributes: { str: 1, dex: 60, int: 5, vit: 40, wis: 1 },
        }),
        stunned,
      ],
    });
    // The caster is faster than the archer, so the brute is stunned before the archer walks away.
    const stunAt = r.events.findIndex((e) => e.t === 'status' && e.status === 'stun' && e.on);
    expect(stunAt).toBeGreaterThan(-1);
    const early = r.events.slice(stunAt).findIndex((e) => e.t === 'round');
    const slice = r.events.slice(stunAt, early > 0 ? stunAt + early : undefined);
    expect(slice.some((e) => e.t === 'skill' && e.reaction)).toBe(false);
  });
});
