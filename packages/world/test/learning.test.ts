import { createRng, type CombatEvent } from '@game/engine';
import { describe, expect, it } from 'vitest';
import { learnFromBook } from '../src/actions.ts';
import {
  bookProblem,
  bookRequirement,
  learnUnlocked,
  trainedSchool,
  trainFromFight,
  unlockProblem,
} from '../src/learning.ts';
import { bookItem, rollDrop, starterGear } from '../src/loot.ts';
import { CLASSES, createMember } from '../src/progression.ts';
import { createParty } from '../src/sim.ts';
import {
  MAX_SCHOOL_LEVEL,
  schoolLevel,
  SCHOOLS,
  schoolXpForLevel,
  SKILLS,
  WEAPON_SCHOOL,
} from '../src/skills.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import type { ClassId, Member, PartyState } from '../src/types.ts';

const classes = Object.keys(CLASSES) as ClassId[];
const mk = (cls: ClassId, level = 1): Member =>
  createMember(0, { name: 'A', race: 'human', cls }, level);

const uses = (unit: string, skill: string, n: number): CombatEvent[] =>
  Array.from({ length: n }, () => ({
    t: 'skill',
    unit,
    skill,
    target: 'x',
    x: 0,
    y: 0,
    vfx: null,
  }));

describe('school levels', () => {
  it('level 1 is free, levels need more and more, and the top is capped', () => {
    expect(schoolLevel(0)).toBe(1);
    expect(schoolXpForLevel(2)).toBeGreaterThan(0);
    expect(schoolXpForLevel(5) - schoolXpForLevel(4)).toBeGreaterThan(
      schoolXpForLevel(3) - schoolXpForLevel(2),
    );
    expect(schoolLevel(schoolXpForLevel(7))).toBe(7);
    expect(schoolLevel(schoolXpForLevel(7) - 1)).toBe(6);
    expect(schoolLevel(10_000_000)).toBe(MAX_SCHOOL_LEVEL);
  });
});

describe('the skill catalogue', () => {
  it('every school skill has an unlock, a known prerequisite and a valid weapon list', () => {
    for (const s of Object.values(SKILLS)) {
      if (!s.school) continue;
      expect(SCHOOLS).toContain(s.school);
      expect(s.unlock, s.id).toBeDefined();
      if (s.unlock?.skill) {
        expect(SKILLS[s.unlock.skill], s.id).toBeDefined();
        expect(SKILLS[s.unlock.skill]!.school, s.id).toBe(s.school);
      }
      // A weapon skill must name a weapon that trains its own school.
      if (s.weapons) {
        expect(
          s.weapons.some((k) => WEAPON_SCHOOL[k] === s.school),
          s.id,
        ).toBe(true);
      }
    }
  });

  it('prerequisites never form a loop', () => {
    for (const s of Object.values(SKILLS)) {
      let cur = s;
      for (let i = 0; i < 20 && cur.unlock?.skill; i++) cur = SKILLS[cur.unlock.skill]!;
      expect(cur.unlock?.skill, s.id).toBeUndefined();
    }
  });
});

describe('class starts', () => {
  it.each(classes)('a %s starts with skills its schools unlock and a usable weapon', (cls) => {
    const m = mk(cls);
    for (const id of m.skills) {
      const s = SKILLS[id]!;
      expect(s, id).toBeDefined();
      if (s.school && s.unlock) {
        expect(schoolLevel(m.schools[s.school] ?? 0), id).toBeGreaterThanOrEqual(s.unlock.level);
      }
    }
    const kind = m.equipment.weapon?.kind;
    const usable = m.skills.filter((id) => {
      const s = SKILLS[id]!;
      return s.source === 'spell' || !s.weapons || (kind && s.weapons.includes(kind));
    });
    expect(usable.length).toBeGreaterThan(0);
    // Nothing is waiting to be learned on day one.
    expect(learnUnlocked(m)).toEqual([]);
  });

  it('the rogue is the mobile dagger class', () => {
    const rogue = CLASSES.rogue;
    expect(rogue.move).toBeGreaterThan(CLASSES.warrior.move);
    expect(starterGear(rogue.kit, 'm', 1).weapon?.kind).toBe('dagger');
    expect(rogue.skills).toContain('vanish_strike');
  });
});

describe('training', () => {
  it('weapon skills train the school of the weapon in hand, spells their own school', () => {
    const w = mk('warrior');
    expect(trainedSchool(w, SKILLS.attack!)).toBe('sword');
    const mage = mk('mage');
    expect(trainedSchool(mage, SKILLS.fireball!)).toBe('fire');
    expect(trainedSchool(mage, SKILLS.attack!)).toBeNull(); // a staff trains no weapon school
    w.equipment.weapon = { ...w.equipment.weapon!, kind: 'axe' };
    expect(trainedSchool(w, SKILLS.attack!)).toBe('axe');
  });

  it('using skills earns school experience and counts uses', () => {
    const m = mk('rogue');
    const before = m.schools.dagger!;
    trainFromFight([m], uses(m.id, 'stab', 3));
    expect(m.schools.dagger).toBe(before + 3);
    expect(m.uses.stab).toBe(3);
  });

  it('a mage using a dagger skill without a dagger does not progress it', () => {
    const mage = mk('mage');
    mage.skills.push('stab');
    trainFromFight([mage], uses(mage.id, 'stab', 5));
    expect(mage.schools.dagger ?? 0).toBe(0);
    // With a dagger in hand the same skill does train.
    mage.equipment.weapon = starterGear(['Iron Dagger'], 'x', 1).weapon;
    trainFromFight([mage], uses(mage.id, 'stab', 5));
    expect(mage.schools.dagger).toBe(5);
  });

  it('a skill unlocks when the school level and the prerequisite uses are met', () => {
    const m = mk('ranger');
    const skill = SKILLS.volley!; // bow level 6 and 6 uses of poison arrow
    expect(unlockProblem(m, skill)).toMatch(/bow level 6/);
    m.schools.bow = schoolXpForLevel(6);
    expect(unlockProblem(m, skill)).toMatch(/Poison Arrow 6 times \(0\/6\)/);
    expect(trainFromFight([m], uses(m.id, 'poison_arrow', 5))).toEqual([]);
    const learned = trainFromFight([m], uses(m.id, 'poison_arrow', 1));
    expect(learned.map((l) => l.skill)).toContain('volley');
    expect(m.skills).toContain('volley');
    expect(unlockProblem(m, skill)).toBe('already known');
  });

  it('book-only skills are never learned by training', () => {
    const m = mk('mage');
    m.schools.electric = schoolXpForLevel(10);
    m.uses.staff_bolt = 100;
    learnUnlocked(m);
    expect(m.skills).not.toContain('chain_lightning');
    expect(unlockProblem(m, SKILLS.chain_lightning!)).toMatch(/book/);
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

  it('teach a basic skill to anyone and are used up', () => {
    const p = party();
    p.bag.push(bookItem('stab', 5, 'b1'));
    expect(bookRequirement(SKILLS.stab!)).toBe(0);
    expect(learnFromBook(p, 'm1', 'b1')).toEqual({ ok: true });
    expect(p.members[0]!.skills).toContain('stab');
    expect(p.bag).toHaveLength(0);
  });

  it('advanced skills need a school level, and a refused book stays in the bag', () => {
    const p = party();
    p.bag.push(bookItem('chain_lightning', 12, 'b2'));
    const need = bookRequirement(SKILLS.chain_lightning!);
    expect(need).toBeGreaterThan(0);
    const mage = p.members[0]!;
    mage.schools.electric = 0;
    const r = learnFromBook(p, mage.id, 'b2');
    expect(r).toMatchObject({ ok: false, code: 'cannot_learn' });
    expect(p.bag).toHaveLength(1);
    mage.schools.electric = schoolXpForLevel(need);
    expect(learnFromBook(p, mage.id, 'b2')).toEqual({ ok: true });
    expect(mage.skills).toContain('chain_lightning');
  });

  it('cannot teach what is already known, and only real books work', () => {
    const p = party();
    p.bag.push(bookItem('fireball', 5, 'b3'));
    expect(bookProblem(p.members[0]!, p.bag[0]!)).toMatch(/already knows/);
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
        if (it?.teaches) out.push(SKILLS[it.teaches]!.unlock!.level);
      }
      return out;
    };
    const low = levels(1);
    const high = levels(30);
    expect(low.length).toBeGreaterThan(20);
    expect(Math.max(...low)).toBeLessThanOrEqual(2);
    expect(Math.max(...high)).toBeGreaterThan(Math.max(...low));
  });
});
