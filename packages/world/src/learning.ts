import type { CombatEvent, DamageType, WeaponKind } from '@game/engine';
import {
  addSkillXp,
  equippedLimit,
  equipProblem,
  equipSkill,
  schoolLevelOf,
  skillLevelOf,
  trainingFor,
  unmetSkillRequirements,
  type SkillUse,
} from './skill-levels.ts';
import { isStarter, RING_NAMES, SKILL_TREE, type RingSchool, type TreeNode } from './skill-tree.ts';
import { SKILLS } from './skills.ts';
import type { Item, Member } from './types.ts';

/**
 * Learning and training in the running game: a member's skills, their levels and the school
 * levels they add up to (the rules are in skill-levels.ts). A skill can be used in a fight only if
 * it has a combat definition (`SKILLS`); the summons, Dash and the masteries wait for their
 * engine feature or are passive.
 */

/** A skill with a combat definition can be carried into a fight. */
export const isUsable = (id: string): boolean => !!SKILLS[id];

/** A member's school level, from its skill levels. */
export const memberSchoolLevel = (m: Pick<Member, 'skillLevels'>, school: RingSchool): number =>
  schoolLevelOf(m, school);

/** The school levels of a member, every school that has any (for display). */
export function memberSchools(m: Pick<Member, 'skillLevels'>): Partial<Record<RingSchool, number>> {
  const out: Partial<Record<RingSchool, number>> = {};
  for (const n of Object.values(SKILL_TREE)) {
    for (const school of n.schools) {
      const level = memberSchoolLevel(m, school);
      if (level > 0) out[school] = level;
    }
  }
  return out;
}

/**
 * Learns a skill at level 1 and carries it when there is a free slot. Returns false if it was
 * already known.
 */
export function learnSkill(m: Member, level: number, id: string): boolean {
  if (m.skills.includes(id)) return false;
  m.skills.push(id);
  if (SKILL_TREE[id]) m.skillLevels[id] = 1;
  if (SKILL_TREE[id] && isUsable(id)) equipSkill(m, level, id);
  return true;
}

/** Sets up a new member's skills from the ones it starts with (all at level 1, carried as far as fits). */
export function startSkills(m: Member, level: number): void {
  const known = [...m.skills];
  m.skills = ['attack'].filter((id) => known.includes(id));
  for (const id of known) learnSkill(m, level, id);
}

/**
 * What stops `m` from learning `node` by training, or null when it can be learned now. Starters
 * come with a class or from a book, so only skills with requirements are learned this way.
 */
export function unlockProblem(m: Member, level: number, node: TreeNode): string | null {
  if (m.skills.includes(node.id)) return 'already known';
  if (node.bookOnly) return 'only a book teaches it';
  if (isStarter(node)) return 'a starting skill: learned from a class or a book';
  const unmet = unmetSkillRequirements(m, level, node);
  return unmet.length ? unmet.join(', ') : null;
}

/** Learns every skill whose requirements are met. Returns the ids learned (in tree order). */
export function learnUnlocked(m: Member, level: number): string[] {
  const learned: string[] = [];
  let again = true;
  // One skill can be the prerequisite of another, so keep going until nothing new unlocks.
  while (again) {
    again = false;
    for (const node of Object.values(SKILL_TREE)) {
      if (unlockProblem(m, level, node) === null) {
        learnSkill(m, level, node.id);
        learned.push(node.id);
        again = true;
      }
    }
  }
  return learned;
}

/** Fills the free slots with the skills the AI uses first, then the other usable ones. */
export function autoEquip(m: Member, level: number): void {
  const wanted = [
    ...m.ai.map((r) => r.skill),
    ...m.skills.filter((id) => isUsable(id) && SKILL_TREE[id]),
  ];
  for (const id of wanted) {
    if (id !== 'weapon_attack' && SKILL_TREE[id] && m.skills.includes(id)) equipSkill(m, level, id);
  }
}

/** What a character's skills and gear make of an event of a fight: one `SkillUse` per skill use. */
function usesOf(m: Member, events: readonly CombatEvent[]): SkillUse[] {
  const weapon = m.equipment.weapon;
  const uses: SkillUse[] = [];
  let current: SkillUse | null = null;
  for (const e of events) {
    if (e.t === 'skill' && e.unit === m.id) {
      const def = SKILLS[e.skill];
      current = {
        skillId: e.skill,
        damage: 0,
        heal: 0,
        weaponKind: weapon?.kind as WeaponKind | undefined,
        hands: weapon?.hands as 1 | 2 | undefined,
        dual: false,
        spell: def?.source === 'spell',
        element: def?.damageType as DamageType | undefined,
      };
      uses.push(current);
    } else if (e.t === 'damage' && e.source === m.id && current) {
      current.damage += e.amount;
    } else if (e.t === 'heal' && e.source === m.id && current) {
      current.heal += e.amount;
    }
  }
  return uses;
}

/**
 * Trains skills from what the party's members did in a fight, and teaches whatever that unlocks.
 * Mutates the members; returns who learned what, and which skills gained a level.
 */
export function trainFromFight(
  members: Member[],
  events: readonly CombatEvent[],
  level: number,
): {
  learned: Array<{ member: Member; skill: string }>;
  levelled: Array<{ member: Member; skill: string; level: number }>;
} {
  const levelled: Array<{ member: Member; skill: string; level: number }> = [];
  for (const m of members) {
    for (const use of usesOf(m, events)) {
      for (const [id, amount] of trainingFor(m, use)) {
        const node = SKILL_TREE[id];
        if (node && addSkillXp(m, node, amount) > 0) {
          levelled.push({ member: m, skill: id, level: skillLevelOf(m, id) });
        }
      }
    }
  }
  const learned: Array<{ member: Member; skill: string }> = [];
  for (const m of members)
    for (const skill of learnUnlocked(m, level)) learned.push({ member: m, skill });
  return { learned, levelled };
}

/**
 * The school level a book asks for before it teaches a skill: the school levels of the skill's own
 * requirements, a little relaxed (a book is a shortcut, but not past a skill's school level).
 */
export function bookRequirement(node: TreeNode): number {
  const levels = Object.values(node.requires.schools ?? {});
  const top = Math.max(0, ...levels);
  return top > 10 ? top - 5 : 0;
}

/** Why `m` cannot learn the book's skill right now, or null. */
export function bookProblem(m: Member, level: number, book: Pick<Item, 'teaches'>): string | null {
  const node = book.teaches ? SKILL_TREE[book.teaches] : undefined;
  if (!node) return 'That book is blank';
  if (m.skills.includes(node.id)) return `${m.name} already knows ${node.name}`;
  if (node.requires.charLevel && level < node.requires.charLevel) {
    return `${m.name} needs character level ${node.requires.charLevel} to learn ${node.name}`;
  }
  const need = bookRequirement(node);
  if (need > 0) {
    for (const school of node.schools) {
      if (memberSchoolLevel(m, school) < need) {
        return `${m.name} needs ${RING_NAMES[school]} level ${need} to learn ${node.name}`;
      }
    }
  }
  return null;
}

export { equippedLimit };

/** Why a carried or learned skill cannot be used with the gear the member wears, or null. */
export function weaponProblem(m: Pick<Member, 'equipment'>, id: string): string | null {
  const def = SKILLS[id];
  if (!def?.weapons || def.weapons.length === 0) return null;
  const kind = m.equipment.weapon?.kind;
  if (kind && def.weapons.includes(kind)) return null;
  return `needs ${def.weapons.join(' or ')} in hand`;
}

/** Why `id` cannot be carried now, or null: it must be learned, usable, not passive, and fit. */
export function carryProblem(m: Member, level: number, id: string): string | null {
  if (!m.skills.includes(id) && SKILL_TREE[id]) return 'not learned yet';
  if (SKILL_TREE[id] && !isUsable(id) && !SKILL_TREE[id]!.passive) return 'not usable yet';
  return equipProblem(m, level, id);
}

/** Puts a skill down. Refuses while an AI rule still uses it, so no rule is left without a skill. */
export function putDownProblem(m: Member, id: string): string | null {
  if (!m.equipped.includes(id)) return 'not carried';
  const rule = m.ai.findIndex((r) => r.skill === id);
  if (rule >= 0) return `AI rule ${rule + 1} uses it: change the rule first`;
  return null;
}
