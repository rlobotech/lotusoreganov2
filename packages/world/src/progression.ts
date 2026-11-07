import {
  armorPoints,
  derive,
  samples,
  type AIRule,
  type Attributes,
  type DamageType,
  type Derived,
  type ExtraDamage,
  type Resistances,
  type WeaponDef,
} from '@game/engine';
import { starterGear } from './loot.ts';
import type { ClassDef, ClassId, Item, Member, MemberTemplate, Race } from './types.ts';

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

/**
 * Turns armor shares (1 = a full set at that level, negative = a weakness) into resistance points.
 * Monsters use it; characters get theirs from the armor they wear.
 */
export function armorResist(
  shares: Partial<Record<DamageType, number>>,
  level: number,
): Resistances {
  return Object.fromEntries(
    Object.entries(shares).map(([type, share]) => [type, Math.round(armorPoints(level) * share)]),
  );
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    base: { str: 9, dex: 5, int: 2, vit: 9, wis: 3 },
    growth: { str: 0.8, dex: 0.2, int: 0, vit: 0.8, wis: 0.2 },
    move: 3,
    skills: ['attack', 'power_strike', 'war_cry'],
    ai: warriorAi,
    pointOrder: ['str', 'vit', 'str', 'vit', 'dex'],
    kit: ['Rusty Sword', 'Wooden Shield', 'Leather Cap', 'Iron Mail', 'Worn Boots'],
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    base: { str: 2, dex: 5, int: 10, vit: 5, wis: 6 },
    growth: { str: 0.1, dex: 0.2, int: 0.9, vit: 0.3, wis: 0.4 },
    move: 3,
    skills: ['staff_bolt', 'fireball'],
    ai: [{ skill: 'fireball', order: 'highest_hp' }, { skill: 'staff_bolt' }],
    pointOrder: ['int', 'int', 'wis', 'vit'],
    kit: ['Gnarled Staff', 'Cloth Hood', 'Cloth Robe'],
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
    pointOrder: ['wis', 'wis', 'int', 'vit'],
    kit: ['Oak Mace', 'Spell Tome', 'Cloth Hood', 'Cloth Robe'],
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    base: { str: 6, dex: 10, int: 3, vit: 6, wis: 4 },
    growth: { str: 0.4, dex: 0.8, int: 0.1, vit: 0.4, wis: 0.2 },
    move: 4,
    skills: ['shoot', 'poison_arrow', 'backstep_shot'],
    ai: [
      { skill: 'backstep_shot', when: { enemyAdjacent: true } },
      { skill: 'poison_arrow', order: 'highest_hp', filter: { lacksStatus: 'poison' } },
      { skill: 'shoot' },
    ],
    pointOrder: ['dex', 'dex', 'str', 'vit'],
    kit: ['Short Bow', 'Leather Cap', 'Padded Vest', 'Worn Boots'],
  },
};

/** Skills available in the engine. Real skill content arrives with packages/content. */
export const SKILLS = samples.skills;

export const ATTRS: ReadonlyArray<keyof Attributes> = ['str', 'dex', 'int', 'vit', 'wis'];
export const zeroAttrs = (): Attributes => ({ str: 0, dex: 0, int: 0, vit: 0, wis: 0 });

/** What a member's attributes are made of, for display and for the totals the engine uses. */
export type MemberLike = Pick<Member, 'race' | 'cls'> &
  Partial<Pick<Member, 'alloc' | 'equipment'>>;

export function memberBreakdown(m: MemberLike, level: number) {
  const cls = CLASSES[m.cls];
  const mod = RACE_MODS[m.race];
  const base = zeroAttrs();
  const alloc = zeroAttrs();
  const gear = zeroAttrs();
  const total = zeroAttrs();
  const worn = Object.values(m.equipment ?? {});
  for (const k of ATTRS) {
    base[k] = Math.round(cls.base[k] + cls.growth[k] * (level - 1) + (mod[k] ?? 0));
    alloc[k] = m.alloc?.[k] ?? 0;
    gear[k] = worn.reduce((s, it) => s + (it?.bonuses?.[k] ?? 0), 0);
    total[k] = Math.max(1, base[k] + alloc[k] + gear[k]);
  }
  return { base, alloc, gear, total };
}

/** What a member's worn gear does in combat: weapon, extra damage and summed resistances. */
export function memberGear(m: Pick<Member, 'equipment'>): {
  weapon: WeaponDef | undefined;
  extra: ExtraDamage[];
  resist: Resistances;
} {
  const weapon = m.equipment.weapon;
  const resist: Record<string, number> = {};
  for (const it of Object.values(m.equipment)) {
    for (const [type, pts] of Object.entries(it?.resist ?? {})) {
      resist[type] = (resist[type] ?? 0) + pts;
    }
  }
  return { weapon: weapon?.weapon, extra: weapon?.extra ?? [], resist };
}

/** Attribute requirements of `item` that `m` does not meet (counting base and spent points only). */
export function unmetRequirements(
  m: MemberLike,
  level: number,
  item: Pick<Item, 'requires'>,
): Array<{ attr: keyof Attributes; need: number; have: number }> {
  const { base, alloc } = memberBreakdown({ ...m, equipment: {} }, level);
  const out: Array<{ attr: keyof Attributes; need: number; have: number }> = [];
  for (const k of ATTRS) {
    const need = item.requires?.[k] ?? 0;
    const have = base[k] + alloc[k];
    if (need > have) out.push({ attr: k, need, have });
  }
  return out;
}

export function memberAttributes(m: MemberLike, level: number): Attributes {
  return memberBreakdown(m, level).total;
}

export function memberDerived(m: MemberLike, level: number): Derived {
  return derive(memberAttributes(m, level), level, CLASSES[m.cls].move);
}

export function createMember(index: number, t: MemberTemplate, level = 1): Member {
  const cls = CLASSES[t.cls];
  const m: Member = {
    id: `m${index + 1}`,
    name: t.name,
    race: t.race,
    cls: t.cls,
    hp: 0,
    mana: 0,
    alive: true,
    equipment: {},
    bag: [],
    gold: 0,
    alloc: zeroAttrs(),
    points: 0,
    autoAlloc: true,
    skills: [...cls.skills],
    ai: structuredClone(cls.ai),
  };
  m.equipment = starterGear(cls.kit, m.id, level);
  const d = memberDerived(m, level);
  m.hp = d.maxHp;
  m.mana = d.maxMana;
  return m;
}

/** Fills in fields older saves do not have, so new features never break an existing party. */
export function normalizeMember(m: Member): Member {
  const cls = CLASSES[m.cls];
  m.equipment ??= {};
  m.bag ??= [];
  m.gold ??= 0;
  m.alloc ??= zeroAttrs();
  m.points ??= 0;
  m.autoAlloc ??= true;
  m.skills ??= [...cls.skills];
  m.ai ??= structuredClone(cls.ai);
  return m;
}

export function spentPoints(m: Pick<Member, 'alloc'>): number {
  return ATTRS.reduce((s, k) => s + m.alloc[k], 0);
}

/** Gives a member `n` new points and, if they auto-spend, puts them in the class pattern. */
export function grantPoints(m: Member, n: number): void {
  m.points += n;
  if (!m.autoAlloc) return;
  const order = CLASSES[m.cls].pointOrder;
  while (m.points > 0) {
    const k = order[spentPoints(m) % order.length]!;
    m.alloc[k] += 1;
    m.points -= 1;
  }
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
