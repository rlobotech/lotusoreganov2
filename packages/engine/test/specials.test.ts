import { describe, expect, it } from 'vitest';
import { runCombat } from '../src/combat.ts';
import { formatLog } from '../src/format.ts';
import { weaponRange } from '../src/scaling.ts';
import type { CombatEvent, SkillDef, StatusDef } from '../src/types.ts';
import { melee, openArena, unitDef } from './helpers.ts';

const stealth: StatusDef = { id: 'stealth', kind: 'stealth', duration: 2 };

const stab: SkillDef = { ...melee, id: 'stab', name: 'Stab', weapons: ['dagger'] };
const chop: SkillDef = { ...melee, id: 'chop', name: 'Chop', weapons: ['sword'] };
const arrow: SkillDef = {
  id: 'arrow',
  name: 'Arrow',
  kind: 'damage',
  source: 'weapon',
  attr: 'dex',
  power: 10,
  range: 6,
  manaCost: 0,
  cooldown: 0,
  side: 'enemy',
};
const dash: SkillDef = {
  id: 'dash',
  name: 'Dash',
  kind: 'status',
  source: 'spell',
  attr: 'dex',
  power: 0,
  range: 0,
  manaCost: 0,
  cooldown: 3,
  side: 'self',
  free: true,
  dash: 3,
  status: stealth,
};
const shadowStep: SkillDef = {
  id: 'shadow_step',
  name: 'Shadow Step',
  kind: 'status',
  source: 'spell',
  attr: 'dex',
  power: 0,
  range: 7,
  manaCost: 0,
  cooldown: 4,
  side: 'enemy',
  free: true,
  teleport: true,
  status: stealth,
};

const skills = { attack: melee, stab, chop, arrow, dash, shadow_step: shadowStep };

/** A target that soaks damage and never hits back. */
const sack = (id: string, over: Parameters<typeof unitDef>[4] = {}) =>
  unitDef(id, 'enemy', [], [], {
    attributes: { str: 1, dex: 1, int: 1, vit: 900, wis: 1 },
    ...over,
  });

const damages = (
  events: CombatEvent[],
  pick: (e: Extract<CombatEvent, { t: 'damage' }>) => boolean,
) => events.flatMap((e) => (e.t === 'damage' && pick(e) ? [e] : []));

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe('dual wielding', () => {
  const dagger = weaponRange(5, 'piercing', 1);
  const fight = (seed: number, over: Parameters<typeof unitDef>[4], skill = 'stab') =>
    runCombat({
      seed,
      arena: openArena(2, 1),
      units: [
        unitDef('r', 'party', [skill], [{ skill }], {
          attributes: { str: 10, dex: 30, int: 5, vit: 30, wis: 5 },
          weapon: dagger,
          weaponKind: 'dagger',
          ...over,
        }),
        sack('t'),
      ],
      skills,
    });

  it('strikes a second time with the off-hand weapon, at a share of the damage', () => {
    const solo: number[] = [];
    const main: number[] = [];
    const off: number[] = [];
    for (let seed = 1; seed <= 25; seed++) {
      const one = fight(seed, {});
      solo.push(...damages(one.events, (e) => e.source === 'r').map((e) => e.amount));
      expect(damages(one.events, (e) => !!e.offhand)).toHaveLength(0);
      const two = fight(seed, { offWeapon: dagger, offWeaponKind: 'dagger' });
      const d = damages(two.events, (e) => e.source === 'r');
      main.push(...d.filter((e) => !e.offhand).map((e) => e.amount));
      off.push(...d.filter((e) => e.offhand).map((e) => e.amount));
    }
    expect(off.length).toBeGreaterThan(20);
    // The main hand hits as hard as ever; the off hand about 70% of that.
    expect(avg(main)).toBeGreaterThan(avg(solo) * 0.9);
    expect(avg(main)).toBeLessThan(avg(solo) * 1.1);
    expect(avg(off) / avg(main)).toBeGreaterThan(0.55);
    expect(avg(off) / avg(main)).toBeLessThan(0.85);
    // Each strike is its own event, so the log says which was which.
    const log = formatLog(fight(1, { offWeapon: dagger, offWeaponKind: 'dagger' }).events).join(
      '\n',
    );
    expect(log).toMatch(/off hand/);
  });

  it('only for melee skills that fit the off-hand weapon', () => {
    const both = { offWeapon: dagger, offWeaponKind: 'dagger' as const };
    // A skill that asks for a sword does not use a dagger in the off hand.
    const sword = fight(3, { ...both, weaponKind: 'sword' }, 'chop');
    expect(damages(sword.events, (e) => !!e.offhand)).toHaveLength(0);
    // A ranged weapon skill never dual wields.
    const bow = runCombat({
      seed: 3,
      arena: openArena(6, 1),
      units: [
        unitDef('r', 'party', ['arrow'], [{ skill: 'arrow' }], { ...both, weaponKind: 'bow' }),
        sack('t'),
      ],
      skills,
    });
    expect(damages(bow.events, (e) => e.source === 'r').length).toBeGreaterThan(0);
    expect(damages(bow.events, (e) => !!e.offhand)).toHaveLength(0);
  });

  it('rolls the off hand on its own: it can miss while the main hand hits', () => {
    let missesAfterHit = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const e = fight(seed, {
        offWeapon: dagger,
        offWeaponKind: 'dagger',
        attributes: { str: 10, dex: 2, int: 5, vit: 30, wis: 5 },
      }).events;
      for (let i = 1; i < e.length; i++) {
        if (
          e[i - 1]!.t === 'damage' &&
          !(e[i - 1] as { offhand?: boolean }).offhand &&
          e[i]!.t === 'miss'
        ) {
          missesAfterHit++;
        }
      }
    }
    expect(missesAfterHit).toBeGreaterThan(0);
  });
});

describe('a ricochet arrow', () => {
  const bounce: SkillDef = {
    ...arrow,
    id: 'ricochet',
    ricochet: { bounces: 2, falloff: 0.5, reach: 3 },
  };
  const run = (seed: number, foes: Array<[string, number]>, over: Partial<SkillDef> = {}) => {
    const arena = openArena(8, 5);
    const archer = unitDef('a', 'party', ['ricochet'], [{ skill: 'ricochet' }], {
      weaponKind: 'bow',
    });
    const enemies = foes.map(([id], i) => ({ ...sack(id), hp: undefined, _i: i }));
    const spawn = {
      ...arena,
      spawns: { party: [{ x: 0, y: 2 }], enemy: foes.map(([, y]) => ({ x: 6, y })) },
    };
    return runCombat({
      seed,
      arena: spawn,
      units: [archer, ...enemies.map(({ _i, ...u }) => u)],
      skills: { ricochet: { ...bounce, ...over } },
    });
  };

  it('jumps to the nearest other enemies, once each, weaker every time', () => {
    const first: number[] = [];
    const second: number[] = [];
    const third: number[] = [];
    for (let seed = 1; seed <= 25; seed++) {
      const r = run(seed, [
        ['e1', 2],
        ['e2', 3],
        ['e3', 4],
      ]);
      const hits = damages(r.events, (e) => e.source === 'a');
      // In one use the arrow hits at most three different enemies.
      const firstUse = hits.slice(0, 3);
      if (
        firstUse.length === 3 &&
        !firstUse[0]!.ricochet &&
        firstUse[1]!.ricochet &&
        firstUse[2]!.ricochet
      ) {
        expect(new Set(firstUse.map((h) => h.target)).size).toBe(3);
        first.push(firstUse[0]!.amount);
        second.push(firstUse[1]!.amount);
        third.push(firstUse[2]!.amount);
      }
    }
    expect(first.length).toBeGreaterThan(10);
    expect(avg(second) / avg(first)).toBeGreaterThan(0.35);
    expect(avg(second) / avg(first)).toBeLessThan(0.65);
    expect(avg(third) / avg(first)).toBeLessThan(0.4);
  });

  it('stops when no other enemy is in reach, or the bounces are used up', () => {
    // Two enemies far apart (reach 3): no bounce.
    const far = run(
      2,
      [
        ['e1', 0],
        ['e2', 4],
      ],
      { ricochet: { bounces: 2, falloff: 0.5, reach: 1 } },
    );
    expect(damages(far.events, (e) => !!e.ricochet)).toHaveLength(0);
    // Four enemies in a row, two bounces: three hits per arrow at most.
    const row = run(2, [
      ['e1', 1],
      ['e2', 2],
      ['e3', 3],
      ['e4', 4],
    ]);
    const used = row.events.findIndex((e) => e.t === 'skill');
    const nextUse = row.events.findIndex((e, i) => i > used && e.t === 'skill');
    const firstArrow = damages(
      row.events.slice(used, nextUse < 0 ? undefined : nextUse),
      (e) => e.source === 'a',
    );
    expect(firstArrow.length).toBeLessThanOrEqual(3);
  });
});

describe('stealth', () => {
  const lurker = (over: Parameters<typeof unitDef>[4] = {}) =>
    unitDef('s', 'party', ['dash', 'attack'], [{ skill: 'dash' }, { skill: 'attack' }], {
      attributes: { str: 20, dex: 30, int: 5, vit: 40, wis: 5 },
      ...over,
    });
  const hunter = unitDef('h', 'enemy', ['attack'], [{ skill: 'attack' }], {
    attributes: { str: 20, dex: 20, int: 5, vit: 60, wis: 5 },
  });

  it('hides the unit from enemies: they cannot pick it, and it is not attacked while hidden', () => {
    const r = runCombat({ seed: 4, arena: openArena(7, 1), units: [lurker(), hunter], skills });
    const hidden = r.events.findIndex(
      (e) => e.t === 'status' && e.unit === 's' && e.status === 'stealth' && e.on,
    );
    expect(hidden).toBeGreaterThan(-1);
    const shown = r.events.findIndex(
      (e, i) => i > hidden && e.t === 'status' && e.unit === 's' && e.status === 'stealth' && !e.on,
    );
    expect(shown).toBeGreaterThan(hidden);
    // Between hiding and being shown, nobody hit it.
    const between = r.events.slice(hidden, shown);
    expect(between.some((e) => e.t === 'damage' && e.target === 's')).toBe(false);
    expect(between.some((e) => e.t === 'miss' && e.target === 's')).toBe(false);
  });

  it('is broken by the unit’s own damaging skill, and that hit is an ambush', () => {
    const ambush: number[] = [];
    const plain: number[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const r = runCombat({ seed, arena: openArena(4, 1), units: [lurker(), sack('t')], skills });
      for (const e of r.events) {
        if (e.t === 'damage' && e.source === 's') (e.ambush ? ambush : plain).push(e.amount);
      }
      const hit = r.events.findIndex((e) => e.t === 'damage' && e.source === 's' && e.ambush);
      if (hit > -1) {
        // The hiding ends with the hit.
        expect(
          r.events
            .slice(hit)
            .some((e) => e.t === 'status' && e.unit === 's' && e.status === 'stealth' && !e.on),
        ).toBe(true);
      }
    }
    expect(ambush.length).toBeGreaterThan(5);
    expect(avg(ambush) / avg(plain)).toBeGreaterThan(1.25);
  });

  it('a hidden unit provokes no opportunity attacks', () => {
    // The lurker steps away from an adjacent enemy: no reaction strike while hidden.
    const flee = unitDef('s', 'party', ['dash'], [{ skill: 'dash' }], { move: 3 });
    const r = runCombat({
      seed: 6,
      arena: openArena(2, 1),
      units: [flee, hunter],
      skills,
    });
    const hit = r.events.findIndex((e) => e.t === 'skill' && e.unit === 'h' && e.reaction);
    expect(hit).toBe(-1);
  });
});

describe('a dash', () => {
  it('gives more movement this turn, and the unit arrives sooner than without it', () => {
    const run = (ai: string[]) =>
      runCombat({
        seed: 2,
        arena: openArena(12, 1),
        units: [
          unitDef(
            'd',
            'party',
            ai.concat('attack'),
            ai.map((skill) => ({ skill })).concat({ skill: 'attack' }),
            { move: 3 },
          ),
          sack('t'),
        ],
        skills,
      });
    const distance = (events: CombatEvent[]) => {
      let x = 0;
      for (const e of events) {
        if (e.t === 'round' && e.n === 2) break;
        if (e.t === 'move' && e.unit === 'd') x = e.path[e.path.length - 1]!.x;
      }
      return x;
    };
    const slow = distance(run([]).events);
    const fast = distance(run(['dash']).events);
    expect(fast).toBeGreaterThan(slow);
    expect(fast - slow).toBeGreaterThanOrEqual(2);
  });
});

describe('a step beside the target (shadow step)', () => {
  it('puts the caster beside the target in one unseen move, hidden, and the next hit is an ambush', () => {
    const r = runCombat({
      seed: 8,
      arena: openArena(12, 1),
      units: [
        unitDef(
          's',
          'party',
          ['shadow_step', 'attack'],
          [{ skill: 'shadow_step' }, { skill: 'attack' }],
          { move: 3 },
        ),
        sack('t'),
      ],
      skills,
    });
    const i = r.events.findIndex((e) => e.t === 'move' && e.teleport);
    expect(i).toBeGreaterThan(-1);
    const move = r.events[i] as Extract<CombatEvent, { t: 'move' }>;
    expect(move.path).toHaveLength(1);
    expect(move.path[0]!.x).toBe(10); // beside the target at x 11
    expect(
      r.events.some((e) => e.t === 'status' && e.unit === 's' && e.status === 'stealth' && e.on),
    ).toBe(true);
    const first = r.events.find((e) => e.t === 'damage' && e.source === 's');
    expect(first && first.t === 'damage' && first.ambush).toBe(true);
  });
});
