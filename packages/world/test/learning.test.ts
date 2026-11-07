import { type CombatEvent } from '@game/engine';
import { createRng } from '@game/engine';
import { describe, expect, it } from 'vitest';
import { learnFromBook } from '../src/actions.ts';
import {
  bookProblem,
  bookRequirement,
  isUsable,
  learnSkill,
  learnUnlocked,
  memberSchoolLevel,
  memberSchools,
  trainFromFight,
  unlockProblem,
} from '../src/learning.ts';
import { bookItem, rollDrop, starterGear } from '../src/loot.ts';
import { CLASSES, createMember, normalizeMember } from '../src/progression.ts';
import { equippedLimit, levelUpCost, unlockLevel } from '../src/skill-levels.ts';
import { CLASS_START_SKILLS, SKILL_TREE, treeProblems } from '../src/skill-tree.ts';
import { createParty, memberUnit } from '../src/sim.ts';
import { SKILLS } from '../src/skills.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import type { ClassId, Member, PartyState } from '../src/types.ts';

const classes = Object.keys(CLASSES) as ClassId[];
const mk = (cls: ClassId, level = 1): Member =>
  createMember(0, { name: 'A', race: 'human', cls }, level);

/** The events of one skill use with the damage it did, as the engine logs them. */
const use = (unit: string, skill: string, damage: number, heal = 0): CombatEvent[] => [
  { t: 'skill', unit, skill, target: 'x', x: 0, y: 0, vfx: null },
  ...(damage > 0
    ? ([
        {
          t: 'damage',
          target: 'x',
          source: unit,
          skill,
          amount: damage,
          crit: false,
          hp: 0,
          type: 'smash',
          resist: 0,
        },
      ] as CombatEvent[])
    : []),
  ...(heal > 0
    ? ([{ t: 'heal', target: unit, source: unit, skill, amount: heal, hp: 1 }] as CombatEvent[])
    : []),
];

describe('the skill catalogue', () => {
  it('has a tree that follows the rules, and combat skills only for known ids', () => {
    expect(treeProblems()).toEqual([]);
    for (const id of Object.keys(SKILLS)) {
      // Skills that are not in the tree (the basic Attack) belong to no school.
      if (id !== 'attack') expect(SKILL_TREE[id], id).toBeDefined();
    }
  });

  it('every skill a character can carry has a weapon list that matches a weapon kind', () => {
    for (const s of Object.values(SKILLS)) {
      for (const w of s.weapons ?? []) {
        expect(['sword', 'dagger', 'axe', 'mace', 'hammer', 'staff', 'bow']).toContain(w);
      }
    }
  });

  it('keeps the earlier skills behind starters, so nothing advanced is free', () => {
    for (const id of ['power_strike', 'lunge', 'whirlwind', 'fireball', 'big_heal', 'volley']) {
      const node = SKILL_TREE[id]!;
      expect(
        Object.keys(node.requires.skills ?? {}).length +
          Object.keys(node.requires.schools ?? {}).length,
      ).toBeGreaterThan(0);
    }
    expect(unlockLevel(SKILL_TREE.whirlwind!)).toBeGreaterThan(
      unlockLevel(SKILL_TREE.power_strike!),
    );
  });
});

describe('class starts', () => {
  it.each(classes)('a %s starts with the skills of the sheet at level 1, carried', (cls) => {
    const m = mk(cls);
    for (const id of CLASS_START_SKILLS[cls]!) {
      expect(m.skills, id).toContain(id);
      expect(m.skillLevels[id], id).toBe(1);
    }
    // Everything carried is usable, learned and within the limit.
    expect(m.equipped.length).toBeLessThanOrEqual(equippedLimit(1));
    for (const id of m.equipped) {
      expect(m.skills).toContain(id);
      expect(isUsable(id)).toBe(true);
    }
    // The AI uses only what the member carries (or the basic attack).
    for (const rule of m.ai) {
      if (rule.skill !== 'attack') expect(m.equipped, rule.skill).toContain(rule.skill);
    }
    // And it can fight: the unit has at least one skill whose weapon it holds.
    const kind = m.equipment.weapon?.kind;
    const usable = memberUnitSkills(m).filter((id) => {
      const s = SKILLS[id]!;
      return s.source === 'spell' || !s.weapons || (kind && s.weapons.includes(kind));
    });
    expect(usable.length).toBeGreaterThan(0);
    // Nothing is waiting to be learned on day one.
    expect(learnUnlocked(m, 1)).toEqual([]);
  });

  it('the rogue is the mobile dagger class', () => {
    const rogue = CLASSES.rogue;
    expect(rogue.move).toBeGreaterThan(CLASSES.warrior.move);
    expect(starterGear(rogue.kit, 'm', 1).weapon?.kind).toBe('dagger');
    expect(rogue.skills).toContain('dagger_slash');
  });

  it('a member saved before skill levels gets them, with every learned skill at level 1', () => {
    const m = mk('mage');
    const old = { ...m } as Partial<Member>;
    delete old.skillLevels;
    delete old.skillXp;
    delete old.equipped;
    const fixed = normalizeMember(old as Member);
    expect(fixed.skillLevels.ember).toBe(1);
    expect(fixed.equipped).toContain('ember');
  });
});

function memberUnitSkills(m: Member): string[] {
  const p = createParty({
    id: 'p',
    name: 'T',
    seed: 1,
    now: 0,
    world: W,
    members: [
      { name: m.name, race: m.race, cls: m.cls },
      { name: 'B', race: 'human', cls: 'warrior' },
    ],
  });
  return memberUnit(p, p.members[0]!).skills;
}

describe('school levels of a member', () => {
  it('add up the levels of the skills of each school', () => {
    const m = mk('mage');
    expect(memberSchoolLevel(m, 'fire')).toBe(1);
    expect(memberSchools(m)).toMatchObject({ fire: 1, water: 1, electric: 1, staff: 1 });
    m.skillLevels.ember = 5;
    expect(memberSchoolLevel(m, 'fire')).toBe(5);
    expect(memberSchoolLevel(m, 'dark')).toBe(0);
  });
});

describe('training', () => {
  it('a carried skill levels up from what it did, and school levels follow', () => {
    const m = mk('mage');
    const need = levelUpCost(SKILL_TREE.ember!, 1);
    const { levelled } = trainFromFight([m], use(m.id, 'ember', need), 1);
    expect(levelled).toContainEqual({ member: m, skill: 'ember', level: 2 });
    expect(m.skillLevels.ember).toBe(2);
    expect(memberSchoolLevel(m, 'fire')).toBe(2);
  });

  it('a heal trains by the health it restored, a plain skill by its uses', () => {
    const p = mk('priest');
    const before = p.skillXp.heal ?? 0;
    trainFromFight([p], use(p.id, 'heal', 0, 30), 1);
    expect(p.skillXp.heal).toBe(before + 30);
  });

  it('Staff Mastery levels from elemental spells, and weapon masteries from damage with the weapon', () => {
    const mage = mk('mage');
    trainFromFight([mage], use(mage.id, 'ember', 10), 1);
    expect(mage.skillXp.staff_mastery).toBe(1);
    const warrior = mk('warrior');
    expect(warrior.equipment.weapon?.kind).toBe('sword');
    trainFromFight([warrior], use(warrior.id, 'sword_slash', 40), 1);
    expect(warrior.skillXp.sword_one_hand_mastery).toBe(40);
  });

  it('a skill that is not carried does not train', () => {
    const m = mk('mage');
    m.equipped = [];
    trainFromFight([m], use(m.id, 'ember', 500), 1);
    expect(m.skillXp.ember ?? 0).toBe(0);
    expect(m.skillLevels.ember).toBe(1);
  });

  it('a skill unlocks when its school level and skill levels are met, and is carried if there is room', () => {
    const w = mk('warrior');
    expect(w.skills).not.toContain('power_strike');
    expect(unlockProblem(w, 1, SKILL_TREE.power_strike!)).toMatch(/Sword level 5/);
    w.skillLevels.sword_slash = 2;
    w.skillLevels.sword_one_hand_mastery = 3;
    expect(unlockProblem(w, 1, SKILL_TREE.power_strike!)).toBeNull();
    expect(learnUnlocked(w, 1)).toContain('power_strike');
    expect(w.skillLevels.power_strike).toBe(1);
    expect(w.equipped).toContain('power_strike');
  });

  it('starting skills and book-only skills are never learned by training', () => {
    const m = mk('mage');
    expect(unlockProblem(m, 1, SKILL_TREE.gust!)).toMatch(/starting skill/);
    m.skillLevels.staff_bolt = 4;
    m.skillLevels.ember = 9;
    expect(unlockProblem(m, 99, SKILL_TREE.chain_lightning!)).toBe('only a book teaches it');
    expect(learnUnlocked(m, 99)).not.toContain('chain_lightning');
  });

  it('the carried limit holds: an extra skill is learned but waits for a slot', () => {
    const m = mk('mage');
    for (const id of ['gust', 'rain', 'staff_strike', 'poison_dart', 'fortify'])
      learnSkill(m, 1, id);
    expect(m.equipped).toHaveLength(equippedLimit(1));
    expect(m.skills).toContain('fortify');
    expect(m.equipped).not.toContain('fortify');
  });
});

describe('books', () => {
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

  it('teach a starting skill to anyone and are used up', () => {
    const p = party();
    p.bag.push(bookItem('poison_dart', 5, 'b1'));
    expect(bookRequirement(SKILL_TREE.poison_dart!)).toBe(0);
    expect(learnFromBook(p, 'm1', 'b1')).toEqual({ ok: true });
    expect(p.members[0]!.skills).toContain('poison_dart');
    expect(p.members[0]!.skillLevels.poison_dart).toBe(1);
    expect(p.bag).toHaveLength(0);
  });

  it('advanced skills need a school level, and a refused book stays in the bag', () => {
    const p = party();
    p.bag.push(bookItem('chain_lightning', 12, 'b2'));
    const need = bookRequirement(SKILL_TREE.chain_lightning!);
    expect(need).toBeGreaterThan(0);
    const mage = p.members[0]!;
    const r = learnFromBook(p, mage.id, 'b2');
    expect(r).toMatchObject({ ok: false, code: 'cannot_learn' });
    expect(p.bag).toHaveLength(1);
    mage.skillLevels.staff_bolt = need;
    expect(learnFromBook(p, mage.id, 'b2')).toEqual({ ok: true });
    expect(mage.skills).toContain('chain_lightning');
  });

  it('cannot teach what is already known, and only real books work', () => {
    const p = party();
    p.bag.push(bookItem('ember', 5, 'b3'));
    expect(bookProblem(p.members[0]!, p.level, p.bag[0]!)).toMatch(/already knows/);
    expect(learnFromBook(p, 'm1', 'b3')).toMatchObject({ code: 'cannot_learn' });
    p.bag.push({
      id: 'x',
      name: 'Rock',
      rarity: 'common',
      itemLevel: 1,
      value: 1,
      favorite: false,
    });
    expect(learnFromBook(p, 'm1', 'x')).toMatchObject({ code: 'not_a_book' });
    expect(learnFromBook(p, 'm1', 'nope')).toMatchObject({ code: 'no_item' });
  });

  it('drop sometimes, with higher levels teaching more advanced skills', () => {
    const rng = createRng(9);
    const levels = (monsterLevel: number) => {
      const out: number[] = [];
      for (let i = 0; i < 3000; i++) {
        const it = rollDrop(rng, monsterLevel, `d${i}`);
        if (it?.teaches) out.push(unlockLevel(SKILL_TREE[it.teaches]!));
      }
      return out;
    };
    const low = levels(1);
    const high = levels(60);
    expect(low.length).toBeGreaterThan(20);
    expect(Math.max(...high)).toBeGreaterThan(Math.max(...low));
  });
});

describe('skill and school levels in a fight', () => {
  it('make the skills a member carries stronger, and the unit fights with only what it carries', () => {
    const p = createParty({
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
    const mage = p.members[0]!;
    const base = memberUnit(p, mage);
    expect(base.skillMods!.ember!.power).toBeCloseTo(1 * (1 + 0.01));
    mage.skillLevels.ember = 10;
    const grown = memberUnit(p, mage);
    // Skill level 10 is +45%; the fire school (level 10) adds 10%.
    expect(grown.skillMods!.ember!.power).toBeCloseTo(1.45 * 1.1);
    mage.skillLevels.ember = 1;
    mage.skillLevels.frost_shard = 20; // another school
    expect(memberUnit(p, mage).skillMods!.ember!.power).toBeCloseTo(1.01);
    // Water level 20 gives one more round of a status (chill) to the water skills.
    expect(memberUnit(p, mage).skillMods!.frost_shard!.rounds).toBe(1);
    // A skill that is learned but not carried is not in the unit.
    mage.equipped = mage.equipped.filter((id) => id !== 'ember');
    expect(memberUnit(p, mage).skills).not.toContain('ember');
    expect(memberUnit(p, mage).skills).toContain('frost_shard');
  });
});
