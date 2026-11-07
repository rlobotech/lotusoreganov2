import { describe, expect, it } from 'vitest';
import {
  equipMemberSkill,
  learnFromBook,
  setMemberAi,
  unequipMemberSkill,
} from '../src/actions.ts';
import {
  carryProblem,
  learnSkill,
  learnUnlocked,
  putDownProblem,
  weaponProblem,
} from '../src/learning.ts';
import { bookItem } from '../src/loot.ts';
import { equippedLimit } from '../src/skill-levels.ts';
import { createParty } from '../src/sim.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import type { PartyState } from '../src/types.ts';

function party(): PartyState {
  return createParty({
    id: 'p',
    name: 'T',
    seed: 1,
    now: 0,
    world: W,
    members: [
      { name: 'M', race: 'elf', cls: 'mage' },
      { name: 'W', race: 'human', cls: 'warrior' },
    ],
  });
}

describe('carrying skills', () => {
  it('puts a skill down and carries it again, within the limit', () => {
    const p = party();
    const mage = p.members[0]!;
    // The AI of a mage uses its three bolts, so put the others down through a new AI first.
    expect(unequipMemberSkill(p, mage.id, 'ember')).toMatchObject({ code: 'cannot_put_down' });
    expect(setMemberAi(p, mage.id, [{ skill: 'frost_shard' }, { skill: 'staff_bolt' }])).toEqual({
      ok: true,
    });
    expect(unequipMemberSkill(p, mage.id, 'ember')).toEqual({ ok: true });
    expect(mage.equipped).not.toContain('ember');
    expect(unequipMemberSkill(p, mage.id, 'ember')).toMatchObject({ code: 'cannot_put_down' });
    expect(equipMemberSkill(p, mage.id, 'ember')).toEqual({ ok: true });
    expect(mage.equipped).toContain('ember');
    expect(equipMemberSkill(p, mage.id, 'ember')).toMatchObject({ code: 'cannot_carry' });
  });

  it('refuses a full set, an unknown or unlearned skill, and a passive one', () => {
    const p = party();
    const mage = p.members[0]!;
    for (const id of ['gust', 'rain', 'staff_strike', 'poison_dart', 'fortify']) {
      learnSkill(mage, 1, id);
    }
    expect(mage.equipped).toHaveLength(equippedLimit(1));
    expect(equipMemberSkill(p, mage.id, 'fortify')).toMatchObject({
      code: 'cannot_carry',
      error: expect.stringMatching(/only 6/),
    });
    expect(carryProblem(mage, 1, 'whirlwind')).toBe('not learned yet');
    expect(carryProblem(mage, 1, 'nothing')).toBe('unknown skill');
    expect(carryProblem(mage, 1, 'staff_mastery')).toMatch(/takes no slot/);
    // Every skill of the tree has its combat skill now, so nothing is "not usable yet".
    expect(carryProblem(mage, 1, 'shadow_step')).toBe('not learned yet');
    // At level 30 there is a seventh slot.
    p.level = 30;
    expect(equipMemberSkill(p, mage.id, 'fortify')).toEqual({ ok: true });
  });

  it('only the owner of a character changes what it carries', () => {
    const p = party();
    p.members[0]!.ownerId = 'u1';
    expect(equipMemberSkill(p, 'm1', 'gust', 'u2')).toMatchObject({ ok: false });
    expect(unequipMemberSkill(p, 'm1', 'gust', 'u2')).toMatchObject({ ok: false });
  });

  it('says why a skill that needs a weapon cannot be used with the gear worn', () => {
    const p = party();
    const warrior = p.members[1]!;
    expect(weaponProblem(warrior, 'sword_slash')).toBeNull();
    expect(weaponProblem(warrior, 'dagger_slash')).toMatch(/needs dagger/);
    expect(weaponProblem(warrior, 'ember')).toBeNull(); // spells need no weapon
    delete warrior.equipment.weapon;
    expect(weaponProblem(warrior, 'sword_slash')).toMatch(/needs sword/);
    expect(putDownProblem(warrior, 'dagger_slash')).toBe('not carried');
  });
});

describe('books and nothing locked to a class', () => {
  it('a warrior learns Demonology Mastery from a book and it adds to the Dark school', () => {
    const p = party();
    const warrior = p.members[1]!;
    p.bag.push(bookItem('demonology_mastery', 5, 'b1'));
    expect(learnFromBook(p, warrior.id, 'b1')).toEqual({ ok: true });
    expect(warrior.skills).toContain('demonology_mastery');
    expect(warrior.skillLevels.demonology_mastery).toBe(1);
    // Passive: learned, but takes no slot.
    expect(warrior.equipped).not.toContain('demonology_mastery');
  });

  it('a warrior who learned Summon Imp from a book can carry it and call an imp', () => {
    const p = party();
    const warrior = p.members[1]!;
    p.bag.push(bookItem('summon_imp', 5, 'b2'));
    expect(learnFromBook(p, warrior.id, 'b2')).toEqual({ ok: true });
    expect(warrior.skills).toContain('summon_imp');
    // Nothing is locked to a class: it is carried like any other skill.
    expect(warrior.equipped).toContain('summon_imp');
    expect(carryProblem(warrior, 1, 'summon_imp')).toBe('already carried');
  });
});

describe('learning at a new character level', () => {
  it('learns a skill that was only waiting for the character level', () => {
    // Made-up requirement through the real tree: Greater Heal needs Less Heal level 2 and Light 15.
    const p = party();
    const priest = createParty({
      id: 'q',
      name: 'Q',
      seed: 1,
      now: 0,
      world: W,
      members: [
        { name: 'P', race: 'human', cls: 'priest' },
        { name: 'W', race: 'human', cls: 'warrior' },
      ],
    }).members[0]!;
    priest.skillLevels.heal = 14;
    priest.skillLevels.smite = 4;
    expect(learnUnlocked(priest, 1)).toContain('big_heal');
    expect(p.level).toBe(1);
  });
});
