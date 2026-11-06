import { describe, expect, it } from 'vitest';
import { planTurn } from '../src/ai.ts';
import { hasLineOfSight, makeGrid } from '../src/grid.ts';
import type { SkillDef } from '../src/types.ts';
import { bigHeal, bolt, heal, melee, nuke, openArena, stateOf, unitDef } from './helpers.ts';

const skills: Record<string, SkillDef> = { attack: melee, bolt, heal, big_heal: bigHeal, nuke };
const grid = makeGrid(openArena(10, 6));

describe('gambit priority', () => {
  const priestDef = unitDef(
    'priest',
    'party',
    ['bolt', 'heal', 'big_heal'],
    [
      { skill: 'big_heal', order: 'lowest_hp_pct', filter: { hpBelowPct: 40 } },
      { skill: 'heal', order: 'lowest_hp_pct', filter: { hpBelowPct: 75 } },
      { skill: 'bolt' },
    ],
  );
  const allyDef = unitDef('ally', 'party', ['attack'], []);
  const enemyDef = unitDef('enemy', 'enemy', ['attack'], []);

  it('uses the first rule that applies: big heal below 40%, heal below 75%, otherwise attack', () => {
    const priest = stateOf(priestDef, 2, 2);
    const enemy = stateOf(enemyDef, 8, 2);

    const critical = stateOf(allyDef, 3, 2, { hp: 10 });
    let plan = planTurn(grid, [priest, critical, enemy], skills, priest);
    expect(plan.kind === 'act' && plan.skill.id).toBe('big_heal');

    const hurt = stateOf(allyDef, 3, 2, {
      hp: Math.round(stateOf(allyDef, 0, 0).base.maxHp * 0.6),
    });
    plan = planTurn(grid, [priest, hurt, enemy], skills, priest);
    expect(plan.kind === 'act' && plan.skill.id).toBe('heal');

    const healthy = stateOf(allyDef, 3, 2);
    plan = planTurn(grid, [priest, healthy, enemy], skills, priest);
    expect(plan.kind === 'act' && plan.skill.id).toBe('bolt');
  });

  it('heals the lowest-percentage ally first', () => {
    const priest = stateOf(priestDef, 2, 2);
    const a = stateOf({ ...allyDef, id: 'a' }, 3, 2, { hp: 40 });
    const b = stateOf({ ...allyDef, id: 'b' }, 3, 3, { hp: 20 });
    const plan = planTurn(grid, [priest, a, b, stateOf(enemyDef, 8, 2)], skills, priest);
    expect(plan.kind === 'act' && plan.target.id).toBe('b');
  });

  it('skips a rule when mana is too low or the skill is on cooldown', () => {
    const def = unitDef('mage', 'party', ['bolt', 'nuke'], [{ skill: 'nuke' }, { skill: 'bolt' }]);
    const enemy = stateOf(unitDef('enemy', 'enemy', ['attack'], []), 5, 2);

    const noMana = stateOf(def, 2, 2, { mana: 4 });
    expect(planTurn(grid, [noMana, enemy], skills, noMana)).toMatchObject({
      skill: { id: 'bolt' },
    });

    const cooling = stateOf(def, 2, 2, { cooldowns: { nuke: 2 } });
    expect(planTurn(grid, [cooling, enemy], skills, cooling)).toMatchObject({
      skill: { id: 'bolt' },
    });

    const ready = stateOf(def, 2, 2);
    expect(planTurn(grid, [ready, enemy], skills, ready)).toMatchObject({ skill: { id: 'nuke' } });
  });

  it('honours self conditions in `when`', () => {
    const def = unitDef(
      'mage',
      'party',
      ['bolt', 'nuke'],
      [{ skill: 'nuke', when: { selfHpBelowPct: 50 } }, { skill: 'bolt' }],
    );
    const enemy = stateOf(unitDef('enemy', 'enemy', ['attack'], []), 5, 2);
    const healthy = stateOf(def, 2, 2);
    expect(planTurn(grid, [healthy, enemy], skills, healthy)).toMatchObject({
      skill: { id: 'bolt' },
    });
    const hurt = stateOf(def, 2, 2, { hp: 5 });
    expect(planTurn(grid, [hurt, enemy], skills, hurt)).toMatchObject({ skill: { id: 'nuke' } });
  });
});

describe('movement and reach', () => {
  const enemyDef = unitDef('enemy', 'enemy', ['attack'], []);

  it('walks into melee range and attacks when it can reach this turn', () => {
    const def = unitDef('hero', 'party', ['attack'], [{ skill: 'attack' }]);
    const hero = stateOf(def, 2, 2);
    const enemy = stateOf(enemyDef, 5, 2);
    const plan = planTurn(grid, [hero, enemy], skills, hero);
    expect(plan.kind).toBe('act');
    if (plan.kind === 'act') expect(plan.path).toHaveLength(2);
  });

  it('approaches without acting when the target is out of reach this turn', () => {
    const def = unitDef('hero', 'party', ['attack'], [{ skill: 'attack' }]);
    const hero = stateOf(def, 0, 2);
    const enemy = stateOf(enemyDef, 9, 2);
    const plan = planTurn(grid, [hero, enemy], skills, hero);
    expect(plan.kind).toBe('approach');
    if (plan.kind === 'approach') expect(plan.path).toHaveLength(3);
  });

  it('stays put when a ranged skill already has range and line of sight', () => {
    const def = unitDef('mage', 'party', ['bolt'], [{ skill: 'bolt' }]);
    const mage = stateOf(def, 2, 2);
    const enemy = stateOf(enemyDef, 6, 2);
    const plan = planTurn(grid, [mage, enemy], skills, mage);
    expect(plan.kind === 'act' && plan.path).toEqual([]);
  });

  it('moves to regain line of sight when a wall blocks a ranged attack', () => {
    const wallGrid = makeGrid(openArena(10, 6, [{ x: 4, y: 2 }]));
    const def = unitDef('mage', 'party', ['bolt'], [{ skill: 'bolt' }]);
    const mage = stateOf(def, 2, 2);
    const enemy = stateOf(enemyDef, 6, 2);
    expect(hasLineOfSight(wallGrid, mage, enemy)).toBe(false);
    const plan = planTurn(wallGrid, [mage, enemy], skills, mage);
    expect(plan.kind).toBe('act');
    if (plan.kind === 'act') {
      const end = plan.path[plan.path.length - 1]!;
      expect(plan.path.length).toBeGreaterThan(0);
      expect(hasLineOfSight(wallGrid, end, enemy)).toBe(true);
    }
  });

  it('waits when the target cannot be reached at all', () => {
    const sealed = makeGrid(
      openArena(5, 3, [
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 2, y: 2 },
      ]),
    );
    const def = unitDef('hero', 'party', ['attack'], [{ skill: 'attack' }]);
    const hero = stateOf(def, 0, 1);
    const enemy = stateOf(enemyDef, 4, 1);
    expect(planTurn(sealed, [hero, enemy], skills, hero)).toEqual({ kind: 'wait' });
  });

  it('falls back to a free basic attack when no rule applies', () => {
    const def = unitDef(
      'hero',
      'party',
      ['attack', 'nuke'],
      [{ skill: 'nuke', when: { selfHpBelowPct: 1 } }],
    );
    const hero = stateOf(def, 2, 2);
    const enemy = stateOf(enemyDef, 3, 2);
    expect(planTurn(grid, [hero, enemy], skills, hero)).toMatchObject({ skill: { id: 'attack' } });
  });
});
