import type { WeaponKind } from '@game/engine';

/**
 * The skill tree: thirteen schools in a ring, and for every skill its place in the tree (which
 * schools it belongs to, what it needs, what raises its level). It is the data side of the rules in
 * skill-levels.ts; the combat definition of a skill (damage, range, cost) is a `SkillDef` with the
 * same id. See docs/skill_schools_sheet.csv for the design.
 */

/** The schools in ring order: each is next to the one before and after it (Dark is next to Bow). */
export const SCHOOL_RING = [
  'bow',
  'electric',
  'axe',
  'fire',
  'sword',
  'water',
  'staff',
  'mace',
  'light',
  'shield',
  'earth',
  'dagger',
  'dark',
] as const;
export type RingSchool = (typeof SCHOOL_RING)[number];

export const RING_NAMES: Record<RingSchool, string> = {
  bow: 'Bow',
  electric: 'Air / Electric',
  axe: 'Axe',
  fire: 'Fire',
  sword: 'Sword',
  water: 'Water',
  staff: 'Staff',
  mace: 'Mace',
  light: 'Light',
  shield: 'Shield',
  earth: 'Earth',
  dagger: 'Dagger',
  dark: 'Dark',
};

/** Whether two schools touch on the ring (adjacent schools are likelier to share dual skills). */
export function areAdjacent(a: RingSchool, b: RingSchool): boolean {
  const n = SCHOOL_RING.length;
  const d = Math.abs(SCHOOL_RING.indexOf(a) - SCHOOL_RING.indexOf(b));
  return Math.min(d, n - d) === 1;
}

/** The two schools beside a school on the ring. */
export function adjacentSchools(school: RingSchool): [RingSchool, RingSchool] {
  const n = SCHOOL_RING.length;
  const i = SCHOOL_RING.indexOf(school);
  return [SCHOOL_RING[(i + n - 1) % n]!, SCHOOL_RING[(i + 1) % n]!];
}

export const MAX_SKILL_LEVEL = 10;
/** A school's level is the sum of its skills' levels, never more than this (10 skills x 10 levels). */
export const MAX_RING_SCHOOL_LEVEL = 100;
/** The hardest school level any skill asks for: everything can be learned by school level 80. */
export const MAX_UNLOCK_SCHOOL_LEVEL = 80;

/** What raises a skill's level. */
export type Measure = 'damage' | 'healing' | 'uses';

/** What a skill needs before it can be learned. All parts must be met. */
export interface Requirements {
  charLevel?: number;
  /** School levels, by school (a dual skill lists both). */
  schools?: Partial<Record<RingSchool, number>>;
  /** Other skills at a level or higher. */
  skills?: Record<string, number>;
}

/**
 * What trains a passive mastery: damage with a kind of weapon, any elemental spell, damage a shield
 * stops, or the use of named skills (Demonology Mastery grows with the demon skills).
 */
export type MasteryTraining =
  | { by: 'weapon'; kinds: WeaponKind[]; hands?: 1 | 2; dual?: boolean }
  | { by: 'elemental' }
  | { by: 'shield' }
  | { by: 'skills'; ids: string[] };

export interface TreeNode {
  id: string;
  name: string;
  /** One school, or two for a dual skill (it shows in both trees and its level counts for both). */
  schools: [RingSchool] | [RingSchool, RingSchool];
  /** Skills that share a name across schools (Slash) are separate nodes with the same family. */
  family?: string;
  requires: Requirements;
  measure: Measure;
  /** Masteries are passive: always on, no slot, trained by `trainedBy` and not by being cast. */
  passive?: boolean;
  trainedBy?: MasteryTraining;
  /** Cannot be learned by training, only from a book. */
  bookOnly?: boolean;
  /** Only a proposal until the user settles the name. */
  proposed?: boolean;
}

export const isDual = (n: Pick<TreeNode, 'schools'>): boolean => n.schools.length === 2;

type Extra = Partial<Omit<TreeNode, 'id' | 'name' | 'schools'>>;

function node(id: string, name: string, schools: TreeNode['schools'], extra: Extra = {}): TreeNode {
  return { id, name, schools, requires: {}, measure: 'uses', ...extra };
}

/** A passive mastery that levels with damage (or damage stopped, for a shield). */
const weaponMastery = (
  id: string,
  name: string,
  school: RingSchool,
  trainedBy: MasteryTraining,
): TreeNode => node(id, name, [school], { passive: true, measure: 'damage', trainedBy });

/**
 * The thirty-two starting skills of the sheet. A node has the id of its combat skill (`SKILLS`):
 * the starters that already existed keep their old ids with the names of the sheet (`ember` is Fire
 * Bolt, `frost_shard` Ice Bolt, `staff_bolt` Lightning Bolt, `shadow_bolt` Void Bolt, `heal` Less
 * Heal, `smite` Holy Bolt). Nodes without a combat skill (the summons, Dash and the masteries) wait
 * for their engine feature.
 */
const STARTERS: TreeNode[] = [
  // Bow
  weaponMastery('bow_mastery', 'Bow Mastery', 'bow', { by: 'weapon', kinds: ['bow'] }),
  node('ricochet_arrow', 'Ricochet Arrow', ['bow'], { measure: 'damage' }),
  // Air / Electric
  node('gust', 'Gust', ['electric'], { measure: 'damage' }),
  node('staff_bolt', 'Lightning Bolt', ['electric'], { measure: 'damage' }),
  // Axe
  weaponMastery('axe_dual_wield_mastery', 'Axe Dual Wield Mastery', 'axe', {
    by: 'weapon',
    kinds: ['axe'],
    dual: true,
  }),
  weaponMastery('axe_two_handed_mastery', 'Axe Two Handed Mastery', 'axe', {
    by: 'weapon',
    kinds: ['axe'],
    hands: 2,
  }),
  node('axe_slash', 'Slash', ['axe'], { family: 'slash', measure: 'damage' }),
  // Fire
  node('ember', 'Fire Bolt', ['fire'], { measure: 'damage' }),
  node('summon_imp', 'Summon Imp', ['fire', 'dark'], {
    requires: { skills: { demonology_mastery: 1 } },
  }),
  // Sword
  weaponMastery('sword_one_hand_mastery', 'Sword One Hand Mastery', 'sword', {
    by: 'weapon',
    kinds: ['sword'],
    hands: 1,
  }),
  weaponMastery('sword_two_handed_mastery', 'Sword Two Handed Mastery', 'sword', {
    by: 'weapon',
    kinds: ['sword'],
    hands: 2,
  }),
  node('sword_slash', 'Slash', ['sword'], { family: 'slash', measure: 'damage' }),
  // Water
  node('frost_shard', 'Ice Bolt', ['water'], { measure: 'damage' }),
  node('rain', 'Rain', ['water'], { proposed: true }),
  // Staff
  node('staff_mastery', 'Staff Mastery', ['staff'], {
    passive: true,
    trainedBy: { by: 'elemental' },
  }),
  node('staff_strike', 'Staff Strike', ['staff'], { measure: 'damage', proposed: true }),
  // Mace
  weaponMastery('mace_one_hand_mastery', 'Mace One Hand Mastery', 'mace', {
    by: 'weapon',
    kinds: ['mace', 'hammer'],
    hands: 1,
  }),
  weaponMastery('mace_two_handed_mastery', 'Mace Two Handed Mastery', 'mace', {
    by: 'weapon',
    kinds: ['mace', 'hammer'],
    hands: 2,
  }),
  node('blunt_strike', 'Blunt Strike', ['mace'], { measure: 'damage' }),
  // Light
  node('heal', 'Less Heal', ['light'], { measure: 'healing' }),
  node('smite', 'Holy Bolt', ['light'], { measure: 'damage' }),
  // Shield
  weaponMastery('shield_mastery', 'Shield Mastery', 'shield', { by: 'shield' }),
  node('defensive_stance', 'Defensive Stance', ['shield']),
  // Earth
  node('poison_dart', 'Poison Dart', ['earth'], { measure: 'damage' }),
  node('fortify', 'Fortify', ['earth']),
  // Dagger
  weaponMastery('dagger_mastery', 'Dagger Mastery', 'dagger', { by: 'weapon', kinds: ['dagger'] }),
  node('dagger_slash', 'Slash', ['dagger'], { family: 'slash', measure: 'damage' }),
  // Dark
  node('demonology_mastery', 'Demonology Mastery', ['dark'], {
    passive: true,
    trainedBy: { by: 'skills', ids: ['summon_imp'] },
  }),
  node('shadow_bolt', 'Void Bolt', ['dark'], { measure: 'damage' }),
  node('dash', 'Dash', ['dark']),
  node('necromancy_mastery', 'Necromancy Mastery', ['dark'], {
    passive: true,
    trainedBy: { by: 'skills', ids: ['summon_skeleton'] },
  }),
  node('summon_skeleton', 'Summon Skeleton', ['dark']),
];

/**
 * The skills the game had before the sheet, placed in the tree behind the starters. Their old school
 * levels (1 to 7) became school levels (0 to 30) and "used N times" became a skill level. The rest
 * of the tree comes batch by batch from the user.
 */
const EARLIER: TreeNode[] = [
  // Sword
  node('power_strike', 'Power Strike', ['sword'], {
    measure: 'damage',
    requires: { schools: { sword: 5 }, skills: { sword_slash: 2 } },
  }),
  node('war_cry', 'War Cry', ['sword'], { requires: { schools: { sword: 5 } } }),
  node('lunge', 'Lunge', ['sword'], {
    measure: 'damage',
    requires: { schools: { sword: 15 }, skills: { power_strike: 2 } },
  }),
  node('whirlwind', 'Whirlwind', ['sword'], {
    measure: 'damage',
    requires: { schools: { sword: 30 }, skills: { lunge: 3 } },
  }),
  // Axe
  node('axe_chop', 'Axe Chop', ['axe'], {
    measure: 'damage',
    requires: { skills: { axe_slash: 2 } },
  }),
  node('rend', 'Rend', ['axe'], {
    measure: 'damage',
    requires: { schools: { axe: 10 }, skills: { axe_chop: 2 } },
  }),
  // Mace
  node('crushing_blow', 'Crushing Blow', ['mace'], {
    measure: 'damage',
    requires: { skills: { blunt_strike: 2 } },
  }),
  node('stun_bash', 'Stun Bash', ['mace'], {
    measure: 'damage',
    requires: { schools: { mace: 10 }, skills: { crushing_blow: 2 } },
  }),
  // Dagger
  node('stab', 'Stab', ['dagger'], {
    measure: 'damage',
    requires: { skills: { dagger_slash: 2 } },
  }),
  node('quick_cut', 'Quick Cut', ['dagger'], {
    measure: 'damage',
    requires: { schools: { dagger: 5 } },
  }),
  node('vanish_strike', 'Vanish Strike', ['dagger'], {
    measure: 'damage',
    requires: { schools: { dagger: 10 }, skills: { stab: 2 } },
  }),
  node('throat_cut', 'Throat Cut', ['dagger'], {
    measure: 'damage',
    requires: { schools: { dagger: 25 }, skills: { vanish_strike: 2 } },
  }),
  // Bow
  node('shoot', 'Shoot', ['bow'], {
    measure: 'damage',
    requires: { skills: { ricochet_arrow: 2 } },
  }),
  node('poison_arrow', 'Poison Arrow', ['bow'], {
    measure: 'damage',
    requires: { schools: { bow: 5 } },
  }),
  node('backstep_shot', 'Backstep Shot', ['bow'], {
    measure: 'damage',
    requires: { schools: { bow: 10 }, skills: { shoot: 2 } },
  }),
  node('volley', 'Volley', ['bow'], {
    measure: 'damage',
    requires: { schools: { bow: 25 }, skills: { poison_arrow: 2 } },
  }),
  // Dagger and Dark: Shadow Step follows Dash (the example of the sheet; the name is still a proposal).
  node('shadow_step', 'Shadow Step', ['dagger', 'dark'], {
    proposed: true,
    requires: { schools: { dagger: 10 }, skills: { dash: 2 } },
  }),
  // Fire, Air / Electric, Earth, Light
  node('fireball', 'Fireball', ['fire'], {
    measure: 'damage',
    requires: { schools: { fire: 10 }, skills: { ember: 2 } },
  }),
  node('chain_lightning', 'Chain Lightning', ['electric'], {
    measure: 'damage',
    bookOnly: true,
    requires: { schools: { electric: 20 }, skills: { staff_bolt: 2 } },
  }),
  node('stone_spike', 'Stone Spike', ['earth'], {
    measure: 'damage',
    requires: { schools: { earth: 5 } },
  }),
  node('big_heal', 'Greater Heal', ['light'], {
    measure: 'healing',
    requires: { schools: { light: 15 }, skills: { heal: 2 } },
  }),
];

export const SKILL_TREE: Record<string, TreeNode> = Object.fromEntries(
  [...STARTERS, ...EARLIER].map((n) => [n.id, n]),
);

/** The thirty-two skills of the sheet's starter table. */
export const STARTER_IDS: string[] = STARTERS.map((n) => n.id);

/** The skills of a school's tree in catalogue order, dual skills included. */
export const skillsOfSchool = (school: RingSchool, tree = SKILL_TREE): TreeNode[] =>
  Object.values(tree).filter((n) => (n.schools as RingSchool[]).includes(school));

/** Skills with no requirements: what a character can start with. */
export const startersOf = (school: RingSchool, tree = SKILL_TREE): TreeNode[] =>
  skillsOfSchool(school, tree).filter((n) => isStarter(n));

export const isStarter = (n: Pick<TreeNode, 'requires'>): boolean => {
  const r = n.requires;
  return (
    !r.charLevel && !Object.keys(r.schools ?? {}).length && !Object.keys(r.skills ?? {}).length
  );
};

/** The skills each class starts with, in the order of the sheet. Nothing is locked to a class. */
export const CLASS_START_SKILLS: Record<string, string[]> = {
  ranger: ['bow_mastery', 'ricochet_arrow'],
  warrior: [
    'sword_one_hand_mastery',
    'sword_two_handed_mastery',
    'sword_slash',
    'shield_mastery',
    'defensive_stance',
  ],
  barbarian: ['axe_dual_wield_mastery', 'axe_two_handed_mastery', 'axe_slash'],
  paladin: ['mace_one_hand_mastery', 'mace_two_handed_mastery', 'blunt_strike', 'heal'],
  priest: ['mace_one_hand_mastery', 'blunt_strike', 'heal', 'smite'],
  mage: ['staff_mastery', 'ember', 'frost_shard', 'staff_bolt'],
  warlock: ['staff_mastery', 'demonology_mastery', 'summon_imp', 'shadow_bolt'],
  necromancer: ['staff_mastery', 'necromancy_mastery', 'summon_skeleton'],
  shaman: ['staff_mastery', 'ember', 'gust', 'staff_bolt'],
  druid: ['staff_mastery', 'poison_dart', 'fortify'],
  rogue: ['dagger_mastery', 'dagger_slash', 'dash'],
};

/** What is wrong with a tree (empty when it follows the rules of the sheet). */
export function treeProblems(
  tree: Record<string, TreeNode> = SKILL_TREE,
  classStarts: Record<string, string[]> = CLASS_START_SKILLS,
): string[] {
  const out: string[] = [];
  const schools = new Set<string>(SCHOOL_RING);
  for (const [key, n] of Object.entries(tree)) {
    if (key !== n.id) out.push(`${key}: the id is ${n.id}`);
    if (!/^[a-z0-9_]+$/.test(n.id)) out.push(`${n.id}: ids are lowercase with underscores`);
    if (n.schools.length < 1 || n.schools.length > 2) out.push(`${n.id}: one or two schools`);
    if (n.schools.length === 2 && n.schools[0] === n.schools[1]) {
      out.push(`${n.id}: a dual skill needs two different schools`);
    }
    for (const s of n.schools) if (!schools.has(s)) out.push(`${n.id}: unknown school ${s}`);
    const r = n.requires;
    for (const [s, level] of Object.entries(r.schools ?? {})) {
      if (!schools.has(s)) out.push(`${n.id}: requires unknown school ${s}`);
      if (level > MAX_UNLOCK_SCHOOL_LEVEL) out.push(`${n.id}: ${s} level ${level} is over 80`);
    }
    for (const [id, level] of Object.entries(r.skills ?? {})) {
      if (!tree[id]) out.push(`${n.id}: requires unknown skill ${id}`);
      if (level < 1 || level > MAX_SKILL_LEVEL) out.push(`${n.id}: ${id} level ${level}`);
    }
    if ((r.charLevel ?? 0) > 82) out.push(`${n.id}: character level ${r.charLevel} is over 82`);
    if (n.passive && !n.trainedBy)
      out.push(`${n.id}: a passive skill needs something that trains it`);
    if (!n.passive && n.trainedBy) out.push(`${n.id}: only passive skills have a trainer`);
  }
  // A skill cannot (even indirectly) need itself.
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return true;
    if (visiting.has(id)) return false;
    visiting.add(id);
    for (const dep of Object.keys(tree[id]?.requires.skills ?? {})) {
      if (tree[dep] && !visit(dep)) return false;
    }
    visiting.delete(id);
    done.add(id);
    return true;
  };
  for (const id of Object.keys(tree)) if (!visit(id)) out.push(`${id}: requirements loop`);
  for (const [cls, ids] of Object.entries(classStarts)) {
    for (const id of ids) {
      if (!tree[id]) out.push(`${cls}: starts with unknown skill ${id}`);
      else if (
        !isStarter(tree[id]!) &&
        !Object.keys(tree[id]!.requires.skills ?? {}).every((d) => ids.includes(d))
      ) {
        out.push(`${cls}: ${id} needs skills the class does not start with`);
      }
    }
  }
  return out;
}
