import type { DamageType, WeaponKind } from '@game/engine';
import {
  MAX_RING_SCHOOL_LEVEL,
  MAX_SKILL_LEVEL,
  RING_NAMES,
  SKILL_TREE,
  type Measure,
  type RingSchool,
  type TreeNode,
} from './skill-tree.ts';

/**
 * The rules of skill levels, school levels, requirements and equipped skills (see the design in
 * docs/skill_schools_sheet.csv). Everything here is pure: it works on a small `SkillState` and the
 * tree, not on a whole party member, so it can be tested alone and wired into the game later.
 */

export interface SkillState {
  /** Level of every known skill (1 to 10). A skill that is not here is not known. */
  skillLevels: Record<string, number>;
  /** Progress towards the next level of each skill, in the skill's own measure. */
  skillXp: Record<string, number>;
  /** The skills the character carries (the ones its AI can use). Passive masteries need no slot. */
  equipped: string[];
}

export const newSkillState = (known: string[] = []): SkillState => ({
  skillLevels: Object.fromEntries(known.map((id) => [id, 1])),
  skillXp: {},
  equipped: [],
});

export const skillLevelOf = (s: Pick<SkillState, 'skillLevels'>, id: string): number =>
  s.skillLevels[id] ?? 0;

// ---------- school levels and power ----------

/**
 * A school's level: the sum of the levels of its skills, capped at 100. A dual skill belongs to
 * both of its schools, so its level counts for both.
 */
export function schoolLevelOf(
  s: Pick<SkillState, 'skillLevels'>,
  school: RingSchool,
  tree: Record<string, TreeNode> = SKILL_TREE,
): number {
  let sum = 0;
  for (const n of Object.values(tree)) {
    if ((n.schools as RingSchool[]).includes(school)) sum += skillLevelOf(s, n.id);
  }
  return Math.min(MAX_RING_SCHOOL_LEVEL, sum);
}

/** Each school point gives 1% power to the skills of the school. */
export const POWER_PER_SCHOOL_POINT = 0.01;
export const schoolPower = (level: number): number => 1 + level * POWER_PER_SCHOOL_POINT;

/**
 * The power a skill gets from its schools: a dual skill uses the better of its two schools, so a
 * character strong in either one gets the benefit.
 */
export function skillSchoolPower(
  s: Pick<SkillState, 'skillLevels'>,
  node: Pick<TreeNode, 'schools'>,
  tree: Record<string, TreeNode> = SKILL_TREE,
): number {
  const best = Math.max(...node.schools.map((sc) => schoolLevelOf(s, sc, tree)));
  return schoolPower(best);
}

/** Power can also stretch a status instead of a number: one more round every 20 points. */
export const STATUS_POINTS_PER_ROUND = 20;
export const statusBonusRounds = (schoolLevel: number): number =>
  Math.floor(schoolLevel / STATUS_POINTS_PER_ROUND);

// ---------- raising a skill's level ----------

/** What it takes to go from level 1 to 2 of a starter skill, in each measure. */
export const BASE_COST: Record<Measure, number> = { damage: 400, healing: 300, uses: 12 };
/** Every level costs this many times the one before it. */
export const COST_GROWTH = 1.5;
/** How much harder a skill is per point of the level it unlocks at (starter = 1, level 50 = 6). */
export const COST_PER_UNLOCK_LEVEL = 1 / 10;

/**
 * How hard a skill is to come by, from its requirements: the highest school level or character
 * level it asks for (a starter asks for none). It scales the cost of every one of its levels, so a
 * skill that unlocks at school level 50 needs far more for its first level-up than a starter.
 */
export function unlockLevel(node: Pick<TreeNode, 'requires'>): number {
  const r = node.requires;
  return Math.max(0, r.charLevel ?? 0, ...Object.values(r.schools ?? {}));
}

/** What it takes to go from `level` to `level + 1` (in the skill's measure), or 0 at the top. */
export function levelUpCost(node: TreeNode, level: number): number {
  if (level < 1 || level >= MAX_SKILL_LEVEL) return 0;
  const hardness = 1 + unlockLevel(node) * COST_PER_UNLOCK_LEVEL;
  return Math.round(BASE_COST[node.measure] * hardness * COST_GROWTH ** (level - 1));
}

/** Gives a known skill experience and levels it up as far as it reaches. Returns the new levels. */
export function addSkillXp(s: SkillState, node: TreeNode, amount: number): number {
  let level = skillLevelOf(s, node.id);
  if (level < 1 || amount <= 0) return 0;
  let gained = 0;
  let xp = (s.skillXp[node.id] ?? 0) + amount;
  while (level < MAX_SKILL_LEVEL && xp >= levelUpCost(node, level)) {
    xp -= levelUpCost(node, level);
    level += 1;
    gained += 1;
  }
  s.skillLevels[node.id] = level;
  s.skillXp[node.id] = level >= MAX_SKILL_LEVEL ? 0 : xp;
  return gained;
}

// ---------- what a use of a skill trains ----------

/** What happened when a character used a skill in a fight. */
export interface SkillUse {
  skillId: string;
  /** Damage dealt by this use, and health restored by it. */
  damage: number;
  heal: number;
  /** Damage that a shield stopped for the user (reported separately, on being hit). */
  blocked?: number;
  /** The weapon in the main hand, how many hands it needs, and whether two are being used. */
  weaponKind?: WeaponKind;
  hands?: 1 | 2;
  dual?: boolean;
  /** A spell, and the element of its damage. */
  spell?: boolean;
  element?: DamageType;
}

const ELEMENTS: readonly DamageType[] = ['fire', 'water', 'electric', 'earth', 'dark', 'light'];

const amountFor = (measure: Measure, damage: number, heal: number): number =>
  measure === 'damage' ? damage : measure === 'healing' ? heal : 1;

/**
 * The experience a use gives, as [skill id, amount] pairs. Only a skill the character carries
 * learns from being used (a skill that is not in its AI never fires, so never trains). Passive
 * masteries train on their own: weapon masteries from damage with that weapon, Staff Mastery from
 * any elemental spell, a shield from damage it stops, and the demon and undead masteries from
 * their own skills.
 */
export function trainingFor(
  s: SkillState,
  use: SkillUse,
  tree: Record<string, TreeNode> = SKILL_TREE,
): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  const used = tree[use.skillId];
  if (used && !used.passive && s.equipped.includes(used.id) && skillLevelOf(s, used.id) > 0) {
    const amount = amountFor(used.measure, use.damage, use.heal);
    if (amount > 0) out.push([used.id, amount]);
  }
  for (const n of Object.values(tree)) {
    if (!n.passive || !n.trainedBy || skillLevelOf(s, n.id) < 1) continue;
    const t = n.trainedBy;
    let amount = 0;
    if (t.by === 'weapon') {
      const fits =
        !!use.weaponKind &&
        t.kinds.includes(use.weaponKind) &&
        (t.hands === undefined || t.hands === use.hands) &&
        (t.dual === undefined || t.dual === !!use.dual);
      if (fits) amount = amountFor(n.measure, use.damage, use.heal);
    } else if (t.by === 'elemental') {
      if (use.spell && use.element && ELEMENTS.includes(use.element)) {
        amount = amountFor(n.measure, use.damage, use.heal);
      }
    } else if (t.by === 'shield') {
      amount = use.blocked ?? 0;
    } else if (t.ids.includes(use.skillId)) {
      amount = amountFor(n.measure, use.damage, use.heal);
    }
    if (amount > 0) out.push([n.id, amount]);
  }
  return out;
}

/** Applies `trainingFor` to the state; returns the skills that gained a level. */
export function trainSkills(
  s: SkillState,
  use: SkillUse,
  tree: Record<string, TreeNode> = SKILL_TREE,
): string[] {
  const leveled: string[] = [];
  for (const [id, amount] of trainingFor(s, use, tree)) {
    if (addSkillXp(s, tree[id]!, amount) > 0) leveled.push(id);
  }
  return leveled;
}

// ---------- requirements ----------

/** What a character still lacks to learn a skill, in words (empty when it can be learned). */
export function unmetSkillRequirements(
  s: Pick<SkillState, 'skillLevels'>,
  charLevel: number,
  node: TreeNode,
  tree: Record<string, TreeNode> = SKILL_TREE,
): string[] {
  const out: string[] = [];
  const r = node.requires;
  if (r.charLevel && charLevel < r.charLevel) {
    out.push(`character level ${r.charLevel} (have ${charLevel})`);
  }
  for (const [school, need] of Object.entries(r.schools ?? {}) as Array<[RingSchool, number]>) {
    const have = schoolLevelOf(s, school, tree);
    if (have < need) out.push(`${RING_NAMES[school]} level ${need} (have ${have})`);
  }
  for (const [id, need] of Object.entries(r.skills ?? {})) {
    const have = skillLevelOf(s, id);
    if (have < need) out.push(`${tree[id]?.name ?? id} level ${need} (have ${have})`);
  }
  return out;
}

export const meetsSkillRequirements = (
  s: Pick<SkillState, 'skillLevels'>,
  charLevel: number,
  node: TreeNode,
  tree: Record<string, TreeNode> = SKILL_TREE,
): boolean => unmetSkillRequirements(s, charLevel, node, tree).length === 0;

/** Skills a character can learn right now: not known yet, with every requirement met. */
export function learnable(
  s: Pick<SkillState, 'skillLevels'>,
  charLevel: number,
  tree: Record<string, TreeNode> = SKILL_TREE,
): TreeNode[] {
  return Object.values(tree).filter(
    (n) => skillLevelOf(s, n.id) < 1 && meetsSkillRequirements(s, charLevel, n, tree),
  );
}

// ---------- equipped skills ----------

/** How many skills a character carries: 6, 7 from level 30 and 8 from level 60. */
export function equippedLimit(charLevel: number): number {
  return charLevel >= 60 ? 8 : charLevel >= 30 ? 7 : 6;
}

/** Why a skill cannot be carried now, or null. */
export function equipProblem(
  s: SkillState,
  charLevel: number,
  id: string,
  tree: Record<string, TreeNode> = SKILL_TREE,
): string | null {
  const n = tree[id];
  if (!n) return 'unknown skill';
  if (skillLevelOf(s, id) < 1) return 'not learned yet';
  if (n.passive) return 'a passive skill is always on and takes no slot';
  if (s.equipped.includes(id)) return 'already carried';
  if (s.equipped.length >= equippedLimit(charLevel)) {
    return `only ${equippedLimit(charLevel)} skills can be carried at this level`;
  }
  return null;
}

/** Carries a skill. Returns the problem, or null when it worked. */
export function equipSkill(
  s: SkillState,
  charLevel: number,
  id: string,
  tree: Record<string, TreeNode> = SKILL_TREE,
): string | null {
  const problem = equipProblem(s, charLevel, id, tree);
  if (!problem) s.equipped.push(id);
  return problem;
}

export function unequipSkill(s: SkillState, id: string): void {
  s.equipped = s.equipped.filter((x) => x !== id);
}
