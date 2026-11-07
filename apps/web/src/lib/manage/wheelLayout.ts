import type { SkillInfo } from '@game/shared';

/**
 * Layout of the skill wheel: thirteen sectors (the schools, in ring order, Bow at the top), the
 * skills of each school as nodes along a branch from the centre outward. A skill's distance from the
 * centre grows with what it asks for (other skills first, then the school level), so starters sit
 * near the middle and the most advanced skills near the rim. A dual skill is drawn in both of its
 * schools' sectors. Pure maths, so it can be tested without a screen.
 */

/** The schools in ring order (the same order as the game's rules). */
export const RING = [
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
export type School = (typeof RING)[number];

export const SCHOOL_COLORS: Record<School, string> = {
  bow: '#e0b860',
  electric: '#8cd0f0',
  axe: '#d08040',
  fire: '#e8683a',
  sword: '#c8a868',
  water: '#50a8d8',
  staff: '#a888d8',
  mace: '#b89870',
  light: '#e8d870',
  shield: '#8ca4b4',
  earth: '#8ca858',
  dagger: '#a890c8',
  dark: '#9068b8',
};

export const SCHOOL_LABELS: Record<School, string> = {
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

/** Geometry of the wheel in its own units (the picture is drawn in a square around the origin). */
export const WHEEL = {
  /** Radius of the central hub. */
  hub: 62,
  /** Where the first ring of skills sits, and the distance between rings. */
  firstRing: 128,
  ringStep: 60,
  /** Outer edge of the sectors. */
  rim: 480,
  /** Where the school names and level badges sit. */
  badge: 516,
  size: 580,
} as const;

export const SECTOR = 360 / RING.length;

/** The room one node needs along a ring, and how far a crowded ring staggers its nodes outward. */
const NODE_SPACE = 34;
const STAGGER = 20;

/** Angle (radians, 0 = right, clockwise on screen) of the middle of a school's sector. Bow is at the top. */
export const sectorAngle = (school: School): number =>
  ((RING.indexOf(school) * SECTOR - 90) * Math.PI) / 180;

export interface Point {
  x: number;
  y: number;
}

const polar = (angle: number, r: number): Point => ({
  x: Math.cos(angle) * r,
  y: Math.sin(angle) * r,
});

/** The point for a school's badge (its level circle), outside the sector. */
export const badgePoint = (school: School): Point => polar(sectorAngle(school), WHEEL.badge);

export interface Placed {
  id: string;
  school: School;
  /** The skill's home sector, as opposed to the copy a dual skill has in its second school. */
  home: boolean;
  ring: number;
  x: number;
  y: number;
}

export interface Edge {
  from: string;
  to: string;
  /** Joins nodes of different schools (drawn dashed). */
  cross: boolean;
  /** The school whose colour it takes (the skill's own). */
  school: School;
}

export interface WheelLayout {
  nodes: Placed[];
  edges: Edge[];
}

type LayoutSkill = Pick<SkillInfo, 'id' | 'schools' | 'requires'>;

const isSchool = (s: string): s is School => (RING as readonly string[]).includes(s);

/** How far out a skill is: past every skill it needs, and further the higher the school level it asks for. */
function ringOf(
  skill: LayoutSkill,
  byId: Map<string, LayoutSkill>,
  memo: Map<string, number>,
): number {
  const known = memo.get(skill.id);
  if (known !== undefined) return known;
  memo.set(skill.id, 0); // guards against a loop in bad data
  let ring = 0;
  for (const dep of Object.keys(skill.requires.skills ?? {})) {
    const parent = byId.get(dep);
    if (parent) ring = Math.max(ring, ringOf(parent, byId, memo) + 1);
  }
  // Without a skill to follow, the school level it asks for decides: 0 = first ring, 80 = fifth.
  const levels = Object.values(skill.requires.schools ?? {});
  const band = levels.length ? Math.ceil(Math.max(...levels) / 20) : 0;
  ring = Math.max(ring, band);
  memo.set(skill.id, ring);
  return ring;
}

/** Positions of every skill in every sector it belongs to, and the lines between them. */
export function wheelLayout(skills: readonly LayoutSkill[]): WheelLayout {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const memo = new Map<string, number>();
  const rings = new Map(skills.map((s) => [s.id, ringOf(s, byId, memo)]));

  // Group by sector and ring, so nodes on one ring can be spread across the sector.
  const slots = new Map<string, Array<{ skill: LayoutSkill; home: boolean }>>();
  for (const s of skills) {
    s.schools.filter(isSchool).forEach((school, i) => {
      const key = `${school}:${rings.get(s.id)}`;
      slots.set(key, [...(slots.get(key) ?? []), { skill: s, home: i === 0 }]);
    });
  }

  const nodes: Placed[] = [];
  for (const [key, list] of slots) {
    const [school, ringText] = key.split(':') as [School, string];
    const ring = Number(ringText);
    const r = WHEEL.firstRing + ring * WHEEL.ringStep;
    // Spread across most of the sector. When too many fit no more side by side, every other node
    // sits a little further out, so labels and nodes stay apart.
    const spread = Math.min(SECTOR * 0.8, 8 + list.length * 7);
    const arc = (r * (spread * Math.PI)) / 180;
    const capacity = Math.max(1, Math.floor(arc / NODE_SPACE) + 1);
    const levels = Math.min(4, Math.ceil(list.length / capacity));
    list.forEach(({ skill, home }, i) => {
      const offset = list.length === 1 ? 0 : -spread / 2 + (spread * i) / (list.length - 1);
      const angle = sectorAngle(school) + (offset * Math.PI) / 180;
      const p = polar(angle, r + (levels > 1 ? (i % levels) * STAGGER : 0));
      nodes.push({ id: skill.id, school, home, ring, x: p.x, y: p.y });
    });
  }

  const edges: Edge[] = [];
  for (const s of skills) {
    const school = s.schools.find(isSchool);
    if (!school) continue;
    for (const dep of Object.keys(s.requires.skills ?? {})) {
      const parent = byId.get(dep);
      if (!parent) continue;
      const shared = parent.schools.some((p) => s.schools.includes(p));
      edges.push({ from: dep, to: s.id, cross: !shared, school });
    }
  }
  return { nodes, edges };
}

/** The node of a skill that a line should join: its copy in `school` if it has one, else its home. */
export function nodeIn(layout: WheelLayout, id: string, school?: School): Placed | undefined {
  return (
    layout.nodes.find((n) => n.id === id && n.school === school) ??
    layout.nodes.find((n) => n.id === id && n.home)
  );
}

/** What a character still lacks for a skill (empty when it can be learned), in words. */
export function missingFor(
  skill: Pick<SkillInfo, 'requires'>,
  names: (id: string) => string,
  state: {
    level: number;
    skillLevels: Record<string, { level: number }>;
    schoolLevel: (school: string) => number;
  },
): string[] {
  const out: string[] = [];
  const r = skill.requires;
  if (r.charLevel && state.level < r.charLevel) {
    out.push(`character level ${r.charLevel} (have ${state.level})`);
  }
  for (const [school, need] of Object.entries(r.schools ?? {})) {
    const have = state.schoolLevel(school);
    if (have < need)
      out.push(`${SCHOOL_LABELS[school as School] ?? school} level ${need} (have ${have})`);
  }
  for (const [id, need] of Object.entries(r.skills ?? {})) {
    const have = state.skillLevels[id]?.level ?? 0;
    if (have < need) out.push(`${names(id)} level ${need} (have ${have})`);
  }
  return out;
}

/** The view box that frames one sector (to zoom into a school), or the whole wheel. */
export function sectorBox(school: School | null): { x: number; y: number; w: number; h: number } {
  const whole = { x: -WHEEL.size, y: -WHEEL.size, w: WHEEL.size * 2, h: WHEEL.size * 2 };
  if (!school) return whole;
  // Centred where the skills are (the first rings), wide enough for the whole branch.
  const mid = polar(sectorAngle(school), 235);
  const side = 400;
  return { x: mid.x - side / 2, y: mid.y - side / 2, w: side, h: side };
}
