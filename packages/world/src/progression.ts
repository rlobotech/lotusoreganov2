import { derive, samples, type AIRule, type Attributes, type Derived } from '@game/engine';
import type { ClassDef, ClassId, Member, MemberTemplate, Race } from './types.ts';

export const MAX_LEVEL = 100;

/**
 * XP needed to go from `level` to `level + 1`. Sized as a number of average fights of four
 * monsters each: 2.5 at level 1 growing to ~51 near level 100, about 2,700 fights in total.
 * At the ~2 fights per hour the pace gives in the wild, that is ~56 days of constant play, so
 * players who optimise (dungeon rewards, efficient zones) can reach 100 in about 45.
 * Placeholder: retune with the balance tools once more zones and the loop's pace are real.
 */
export function xpToNext(level: number): number {
  const fights = 2 + 0.5 * level;
  return Math.round(fights * 4 * monsterXp(level));
}

/** XP value of one monster of the given level. */
export function monsterXp(level: number): number {
  return 20 + 4 * level;
}

export function monsterGold(level: number): number {
  return 3 + level;
}

export const RACE_MODS: Record<Race, Partial<Attributes>> = {
  human: {},
  elf: { dex: 1, int: 1, vit: -1 },
  dwarf: { vit: 2, str: 1, dex: -1 },
  orc: { str: 2, vit: 1, int: -1, wis: -1 },
};

const warriorAi: AIRule[] = [
  { skill: 'war_cry', when: { selfManaAbovePct: 20 } },
  { skill: 'power_strike' },
  { skill: 'attack' },
];

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    base: { str: 9, dex: 5, int: 2, vit: 9, wis: 3 },
    growth: { str: 0.8, dex: 0.2, int: 0, vit: 0.8, wis: 0.2 },
    move: 3,
    skills: ['attack', 'power_strike', 'war_cry'],
    ai: warriorAi,
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    base: { str: 2, dex: 5, int: 10, vit: 5, wis: 6 },
    growth: { str: 0.1, dex: 0.2, int: 0.9, vit: 0.3, wis: 0.4 },
    move: 3,
    skills: ['staff_bolt', 'fireball'],
    ai: [{ skill: 'fireball', order: 'highest_hp' }, { skill: 'staff_bolt' }],
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    base: { str: 3, dex: 4, int: 6, vit: 6, wis: 9 },
    growth: { str: 0.1, dex: 0.2, int: 0.4, vit: 0.4, wis: 0.8 },
    move: 3,
    skills: ['staff_bolt', 'heal', 'big_heal'],
    ai: [
      { skill: 'big_heal', order: 'lowest_hp_pct', filter: { hpBelowPct: 40 } },
      { skill: 'heal', order: 'lowest_hp_pct', filter: { hpBelowPct: 75 } },
      { skill: 'staff_bolt' },
    ],
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    base: { str: 6, dex: 10, int: 3, vit: 6, wis: 4 },
    growth: { str: 0.4, dex: 0.8, int: 0.1, vit: 0.4, wis: 0.2 },
    move: 4,
    skills: ['shoot', 'poison_arrow'],
    ai: [
      { skill: 'poison_arrow', order: 'highest_hp', filter: { lacksStatus: 'poison' } },
      { skill: 'shoot' },
    ],
  },
};

/** Skills available in the engine. Real skill content arrives with packages/content. */
export const SKILLS = samples.skills;

export function memberAttributes(m: Pick<Member, 'race' | 'cls'>, level: number): Attributes {
  const cls = CLASSES[m.cls];
  const mod = RACE_MODS[m.race];
  const at = (k: keyof Attributes) =>
    Math.max(1, Math.round(cls.base[k] + cls.growth[k] * (level - 1) + (mod[k] ?? 0)));
  return { str: at('str'), dex: at('dex'), int: at('int'), vit: at('vit'), wis: at('wis') };
}

export function memberDerived(m: Pick<Member, 'race' | 'cls'>, level: number): Derived {
  return derive(memberAttributes(m, level), level, CLASSES[m.cls].move);
}

export function createMember(index: number, t: MemberTemplate, level = 1): Member {
  const d = memberDerived(t, level);
  return {
    id: `m${index + 1}`,
    name: t.name,
    race: t.race,
    cls: t.cls,
    hp: d.maxHp,
    mana: d.maxMana,
    alive: true,
  };
}

/** Adds XP and returns how many levels were gained. Mutates `p`. */
export function addXp(p: { level: number; xp: number }, amount: number): number {
  let gained = 0;
  p.xp += Math.max(0, Math.round(amount));
  while (p.level < MAX_LEVEL && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level += 1;
    gained += 1;
  }
  if (p.level >= MAX_LEVEL) p.xp = 0;
  return gained;
}
