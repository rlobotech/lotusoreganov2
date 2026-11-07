import { describe, expect, it } from 'vitest';
import { planAfterMove, planTurn } from '../src/ai.ts';
import { distance, makeGrid } from '../src/grid.ts';
import { WEAPON_ATTACK, type AIRule, type SkillDef } from '../src/types.ts';
import { bolt, bow, melee, openArena, stateOf, unitDef } from './helpers.ts';

const skills: Record<string, SkillDef> = { attack: melee, bolt, shoot: bow };
const grid = makeGrid(openArena(14, 5));

/** One acting unit at (5,2) with the rules, against enemies at the given tiles. */
function setup(ai: AIRule[], enemies: Array<[number, number, number?]>, own = ['attack', 'shoot']) {
  const me = stateOf(unitDef('me', 'party', own, ai), 5, 2);
  const foes = enemies.map(([x, y, str], i) =>
    stateOf(
      unitDef(`e${i}`, 'enemy', ['attack'], [], {
        attributes: { str: str ?? 10, dex: 5, int: 5, vit: 10, wis: 5 },
      }),
      x,
      y,
    ),
  );
  return { me, foes, units: [me, ...foes] };
}

const plan = (ai: AIRule[], enemies: Array<[number, number, number?]>, own?: string[]) => {
  const { me, units } = setup(ai, enemies, own);
  return { me, units, plan: planTurn(grid, units, skills, me) };
};

describe('target order', () => {
  it('picks the closest, the farthest, or the strongest enemy', () => {
    const foes: Array<[number, number, number?]> = [
      [8, 2, 5],
      [10, 2, 30],
      [7, 3, 10],
    ];
    const pick = (order: AIRule['order']) => {
      const r = plan([{ skill: 'shoot', order }], foes).plan;
      return r.kind === 'act' ? r.target.id : r.kind;
    };
    expect(pick('nearest')).toBe('e2');
    expect(pick('farthest')).toBe('e1');
    expect(pick('strongest')).toBe('e1');
  });

  it('picks the enemy with the most friends around it, and the one with the least armor', () => {
    const { me, foes, units } = setup(
      [{ skill: 'shoot', order: 'crowded' }],
      [
        [6, 0],
        [10, 3],
        [10, 4],
        [11, 3],
      ],
    );
    const crowded = planTurn(grid, units, skills, me);
    expect(crowded.kind === 'act' && crowded.target.id).toBe('e1');
    foes[0]!.resist = { cut: 50 };
    foes[1]!.resist = { cut: 90 };
    foes[2]!.resist = { cut: 0 };
    foes[3]!.resist = { cut: 90 };
    me.def = { ...me.def, ai: [{ skill: 'shoot', order: 'least_armor' }] };
    const least = planTurn(grid, units, skills, me);
    expect(least.kind === 'act' && least.target.id).toBe('e2');
  });
});

describe('conditions', () => {
  it('only targets full-health enemies when asked', () => {
    const { me, foes, units } = setup(
      [{ skill: 'shoot', filter: { fullHealth: true } }],
      [
        [8, 2],
        [9, 2],
      ],
    );
    foes[0]!.hp -= 1;
    const p = planTurn(grid, units, skills, me);
    expect(p.kind === 'act' && p.target.id).toBe('e1');
  });

  it('own-health, status and enemy-count conditions gate a rule', () => {
    const ai = (when: NonNullable<AIRule['when']>): AIRule[] => [
      { skill: 'shoot', when },
      { skill: 'attack' },
    ];
    const used = (when: NonNullable<AIRule['when']>) => {
      const r = plan(ai(when), [[7, 2]]).plan;
      return r.kind === 'act' ? r.skill.id : r.kind;
    };
    expect(used({ selfHpAbovePct: 50 })).toBe('shoot');
    expect(used({ selfHpBelowPct: 50 })).toBe('attack');
    expect(used({ enemiesAtLeast: 2 })).toBe('attack');
    expect(used({ enemiesAtLeast: 1 })).toBe('shoot');
    expect(used({ selfHasStatus: 'war_cry' })).toBe('attack');
    expect(used({ selfLacksStatus: 'war_cry' })).toBe('shoot');
  });

  it('the weapon attack action resolves to the unit basic attack', () => {
    const r = plan([{ skill: WEAPON_ATTACK }], [[6, 2]]).plan;
    expect(r.kind === 'act' && r.skill.id).toBe('attack');
  });
});

describe('linked moves', () => {
  it('"stay" before a skill only applies from where the unit stands', () => {
    const near = plan(
      [{ skill: 'shoot', move: { when: 'before', mode: 'stay' } }, { skill: 'attack' }],
      [[8, 2]],
    ).plan;
    expect(near.kind === 'act' && near.skill.id).toBe('shoot');
    expect(near.kind === 'act' && near.path).toEqual([]);
    const far = plan([{ skill: 'shoot', move: { when: 'before', mode: 'stay' } }], [[13, 2]]).plan;
    expect(far.kind === 'act' && far.skill.id).not.toBe('shoot');
  });

  it('"toward" before a ranged skill closes in, while the default keeps distance', () => {
    const towards = plan([{ skill: 'shoot', move: { when: 'before', mode: 'toward' } }], [[8, 2]]);
    const dflt = plan([{ skill: 'shoot' }], [[8, 2]]);
    const end = (p: typeof towards.plan, me: typeof towards.me) =>
      p.kind === 'act' && p.path.length ? p.path[p.path.length - 1]! : { x: me.x, y: me.y };
    expect(distance(end(towards.plan, towards.me), { x: 8, y: 2 })).toBeLessThan(
      distance(end(dflt.plan, dflt.me), { x: 8, y: 2 }) + 1,
    );
    expect(towards.plan.kind === 'act' && towards.plan.rule?.move?.mode).toBe('toward');
  });

  it('after-moves: away steps back, toward closes in, range stays in reach', () => {
    const { me, foes, units } = setup([], [[8, 2]]);
    const target = foes[0]!;
    me.movesLeft = 3;
    const away = planAfterMove(grid, units, skills, me, 'away', bow, target);
    expect(away).not.toBeNull();
    expect(distance(away![away!.length - 1]!, target)).toBeGreaterThan(distance(me, target));
    const toward = planAfterMove(grid, units, skills, me, 'toward', bow, target);
    expect(distance(toward![toward!.length - 1]!, target)).toBeLessThan(distance(me, target));
    const range = planAfterMove(grid, units, skills, me, 'range', bow, target);
    expect(distance(range![range!.length - 1]!, target)).toBeLessThanOrEqual(bow.range);
    expect(planAfterMove(grid, units, skills, me, 'stay', bow, target)).toBeNull();
  });
});
