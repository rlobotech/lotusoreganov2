import type { CombatEvent, SkillDef } from '@game/engine';
import { schoolLevel, SKILLS, WEAPON_SCHOOL, type SchoolId } from './skills.ts';
import type { Item, Member } from './types.ts';

/** Experience a school gains from one use of a skill. */
export const SCHOOL_XP_PER_USE = 1;

/** The school a use of `skill` trains for `m`, or null (a staff trains no weapon school). */
export function trainedSchool(m: Pick<Member, 'equipment'>, skill: SkillDef): SchoolId | null {
  if (skill.source === 'spell') return (skill.school as SchoolId | undefined) ?? null;
  // Weapon skills train the school of the weapon in hand, so the right weapon is what progresses.
  const kind = m.equipment.weapon?.kind;
  return (kind && WEAPON_SCHOOL[kind]) || null;
}

export const memberSchoolLevel = (m: Pick<Member, 'schools'>, school: string): number =>
  schoolLevel(m.schools[school] ?? 0);

/** What stops `m` from learning `skill` by training, or null when it can be learned now. */
export function unlockProblem(m: Member, skill: SkillDef): string | null {
  if (m.skills.includes(skill.id)) return 'already known';
  if (skill.bookOnly) return 'only a book teaches it';
  if (!skill.school || !skill.unlock) return 'cannot be trained';
  // A school opens when the character starts with it, learns from it or trains in it.
  if (m.schools[skill.school] === undefined) return `start training in ${skill.school}`;
  const level = memberSchoolLevel(m, skill.school);
  if (level < skill.unlock.level) return `${skill.school} level ${skill.unlock.level}`;
  const need = skill.unlock.skill;
  if (need) {
    const have = m.uses[need] ?? 0;
    const times = skill.unlock.uses ?? 1;
    if (!m.skills.includes(need) || have < times) {
      return `use ${SKILLS[need]?.name ?? need} ${times} times (${Math.min(have, times)}/${times})`;
    }
  }
  return null;
}

/** Learns every skill whose requirements are met. Returns the ids learned (in catalogue order). */
export function learnUnlocked(m: Member): string[] {
  const learned: string[] = [];
  let again = true;
  // One skill can be the prerequisite of another, so keep going until nothing new unlocks.
  while (again) {
    again = false;
    for (const skill of Object.values(SKILLS)) {
      if (unlockProblem(m, skill) === null) {
        m.skills.push(skill.id);
        learned.push(skill.id);
        again = true;
      }
    }
  }
  return learned;
}

/**
 * Counts the skills party members used in a fight, trains their schools, and teaches whatever
 * that unlocks. Mutates the members; returns who learned what.
 */
export function trainFromFight(
  members: Member[],
  events: readonly CombatEvent[],
): Array<{ member: Member; skill: string }> {
  const byId = new Map(members.map((m) => [m.id, m]));
  for (const e of events) {
    if (e.t !== 'skill') continue;
    const m = byId.get(e.unit);
    const skill = SKILLS[e.skill];
    if (!m || !skill) continue;
    m.uses[skill.id] = (m.uses[skill.id] ?? 0) + 1;
    const school = trainedSchool(m, skill);
    if (school) m.schools[school] = (m.schools[school] ?? 0) + SCHOOL_XP_PER_USE;
  }
  const out: Array<{ member: Member; skill: string }> = [];
  for (const m of members) for (const skill of learnUnlocked(m)) out.push({ member: m, skill });
  return out;
}

/** The school level needed to learn `skill` from a book: basic skills need none. */
export function bookRequirement(skill: SkillDef): number {
  const level = skill.unlock?.level ?? 1;
  return level > 2 ? level - 1 : 0;
}

/** Why `m` cannot learn the book's skill right now, or null. */
export function bookProblem(m: Member, book: Pick<Item, 'teaches'>): string | null {
  const skill = book.teaches ? SKILLS[book.teaches] : undefined;
  if (!skill) return 'That book is blank';
  if (m.skills.includes(skill.id)) return `${m.name} already knows ${skill.name}`;
  const need = bookRequirement(skill);
  if (skill.school && need > memberSchoolLevel(m, skill.school)) {
    return `${m.name} needs ${skill.school} level ${need} to learn ${skill.name}`;
  }
  return null;
}
