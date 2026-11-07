import { describe, expect, it } from 'vitest';
import { setMemberAi, validateAiRules } from '../src/actions.ts';
import { CLASSES } from '../src/progression.ts';
import { createParty } from '../src/sim.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';

const known = ['attack', 'shoot', 'fireball'];
const ok = (r: unknown) => validateAiRules([r], known);

describe('AI rule validation', () => {
  it('accepts the new orders, conditions, weapon attack and linked moves', () => {
    expect(ok({ skill: 'weapon_attack', order: 'farthest' })).toBeNull();
    expect(ok({ skill: 'attack', order: 'crowded' })).toBeNull();
    expect(ok({ skill: 'attack', order: 'strongest' })).toBeNull();
    expect(ok({ skill: 'attack', order: 'least_armor' })).toBeNull();
    expect(ok({ skill: 'attack', filter: { fullHealth: true } })).toBeNull();
    expect(
      ok({
        skill: 'attack',
        when: {
          selfHpAbovePct: 50,
          selfHasStatus: 'war_cry',
          selfLacksStatus: 'stun',
          enemyAdjacent: false,
          enemiesAtLeast: 3,
        },
        move: { when: 'after', mode: 'away' },
      }),
    ).toBeNull();
  });

  it('rejects bad values with a message', () => {
    expect(ok({ skill: 'attack', order: 'random' })).toMatch(/target order/);
    expect(ok({ skill: 'attack', move: { when: 'during', mode: 'away' } })).toMatch(
      /before or after/,
    );
    expect(ok({ skill: 'attack', move: { when: 'before', mode: 'fly' } })).toMatch(/unknown move/);
    expect(ok({ skill: 'attack', when: { enemiesAtLeast: 0 } })).toMatch(/1 to 12/);
    expect(ok({ skill: 'attack', when: { selfHpAbovePct: 120 } })).toMatch(/0 to 100/);
    expect(ok({ skill: 'attack', when: { enemyAdjacent: 'yes' } })).toMatch(/bad condition/);
    expect(ok({ skill: 'attack', filter: { fullHealth: 1 } })).toMatch(/bad filter/);
    expect(ok({ skill: 'heal' })).toMatch(/unknown skill|does not know/);
  });

  it('saving keeps the new fields and drops anything unknown', () => {
    const p = createParty({
      id: 'p',
      name: 'T',
      seed: 1,
      now: 0,
      world: W,
      members: [
        { name: 'R', race: 'elf', cls: 'ranger' },
        { name: 'W', race: 'human', cls: 'warrior' },
      ],
    });
    const rules = [
      {
        skill: 'weapon_attack',
        order: 'least_armor',
        filter: { fullHealth: true, evil: 1 },
        when: { enemiesAtLeast: 2, selfLacksStatus: 'poison', junk: true },
        move: { when: 'before', mode: 'range', extra: 1 },
        hacked: true,
      },
    ];
    expect(setMemberAi(p, 'm1', rules)).toEqual({ ok: true });
    expect(p.members[0]!.ai).toEqual([
      {
        skill: 'weapon_attack',
        order: 'least_armor',
        filter: { fullHealth: true },
        when: { selfLacksStatus: 'poison', enemiesAtLeast: 2 },
        move: { when: 'before', mode: 'range' },
      },
    ]);
  });

  it('every class default is valid for that class', () => {
    for (const cls of Object.values(CLASSES)) {
      expect(validateAiRules(cls.ai, cls.skills)).toBeNull();
    }
  });
});
