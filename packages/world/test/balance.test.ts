import { describe, expect, it } from 'vitest';
import { partyAtLevel, runLevel, trainedSkillLevel } from '../src/balance.ts';
import { rollDrop } from '../src/loot.ts';
import { CLASSES, memberDerived, memberGear } from '../src/progression.ts';
import { createRng } from '@game/engine';
import type { ClassId } from '../src/types.ts';

const classes = Object.keys(CLASSES) as ClassId[];

describe('level 1 to 100 curves', () => {
  it.each(classes)(
    'a level 100 %s has thousands of health, a real weapon and resistances',
    (cls) => {
      const p = partyAtLevel(100, { classes: [cls, 'warrior'] });
      const m = p.members[0]!;
      const d = memberDerived(m, 100);
      expect(d.maxHp).toBeGreaterThan(3000);
      expect(d.maxHp).toBeLessThan(12000);
      const g = memberGear(m);
      expect(g.weapon!.max).toBeGreaterThan(200);
      const total = Object.values(g.resist).reduce((s, v) => s + v, 0);
      expect(total).toBeGreaterThan(500);
    },
  );

  it('trained parties know more skills at high levels than on day one', () => {
    const low = partyAtLevel(1);
    const high = partyAtLevel(100);
    for (let i = 0; i < low.members.length; i++) {
      expect(high.members[i]!.skills.length).toBeGreaterThanOrEqual(low.members[i]!.skills.length);
    }
    expect(trainedSkillLevel(1)).toBe(1);
    expect(trainedSkillLevel(100)).toBe(10);
  });

  it('item drops keep up with the level', () => {
    const rng = createRng(3);
    const best = (level: number) => {
      let max = 0;
      for (let i = 0; i < 400; i++) {
        const it = rollDrop(rng, level, `i${i}`);
        if (it?.weapon) max = Math.max(max, it.weapon.max);
      }
      return max;
    };
    expect(best(100)).toBeGreaterThan(best(10) * 5);
    expect(best(100)).toBeGreaterThan(300);
  });
});

describe('fight balance at the same level', () => {
  // Each level plays the same seeded fights, so these checks are deterministic. The bounds are wide
  // on purpose: they catch a curve that breaks (an unwinnable or trivial level), not tuning drift.
  it.each([1, 5, 10, 25, 50, 75, 100])(
    'level %i is neither trivial nor deadly',
    (level) => {
      const r = runLevel(level, { fights: 30 });
      expect(r.defeatPct).toBeLessThanOrEqual(25);
      expect(r.avgHpLostPct).toBeGreaterThanOrEqual(8);
      expect(r.avgHpLostPct).toBeLessThanOrEqual(55);
      expect(r.avgRounds).toBeGreaterThan(2);
      expect(r.avgRounds).toBeLessThan(25);
    },
    60_000,
  );

  it('monsters ten levels higher are clearly harder', () => {
    for (const level of [10, 40]) {
      const even = runLevel(level, { fights: 30 });
      const hard = runLevel(level, { fights: 30, offset: 10 });
      expect(hard.avgHpLostPct + hard.defeatPct).toBeGreaterThan(
        even.avgHpLostPct + even.defeatPct,
      );
    }
  }, 60_000);
});
