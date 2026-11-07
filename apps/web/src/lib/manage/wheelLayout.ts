import type { SkillInfo } from '@game/shared';

/**
 * Layout of the skill wheel: thirteen sectors (the schools, in ring order, Bow at the top), the
 * skills of each school as nodes along a branch from the centre outward. A skill's distance from the
 * centre grows with what it asks for (other skills first, then the school level), so starters sit
 * near the middle and the most advanced skills near the rim. A skill of two schools sits in the first
 * of them, once. Nodes stay inside their sector, apart from each other, and the lines between skills
 * bend around the skills in their way. Pure maths, so it can be tested without a screen.
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
  hub: 90,
  /** Where the first ring of skills sits, and the distance between rings. */
  firstRing: 230,
  ringStep: 84,
  /** Outer edge of the sectors. */
  rim: 1000,
  /** Where the school names and level badges sit. */
  badge: 1050,
  size: 1150,
} as const;

export const SECTOR = 360 / RING.length;

/** Radius of a skill's node, and the room a node needs beside its neighbours (its name is below). */
export const NODE_R = 17;
const NODE_SPACE = 56;

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

/** The radius of a ring (0 is the first, next to the hub). */
export const ringRadius = (ring: number): number => WHEEL.firstRing + ring * WHEEL.ringStep;

export interface Placed {
  id: string;
  /** The skill's sector. A skill of two schools sits in the first of them, and only there. */
  school: School;
  ring: number;
  x: number;
  y: number;
}

export interface Edge {
  from: string;
  to: string;
  /** Joins skills of different schools (drawn dashed). */
  cross: boolean;
  /** The school whose colour it takes (the skill's own). */
  school: School;
  /** The SVG path of the line, bent where a straight line would run over another skill. */
  d: string;
}

export interface WheelLayout {
  nodes: Placed[];
  edges: Edge[];
}

type LayoutSkill = Pick<SkillInfo, 'id' | 'schools' | 'requires'>;

const isSchool = (s: string): s is School => (RING as readonly string[]).includes(s);

/** How far out a skill is at least: past every skill it needs, and further the higher the school level it asks for. */
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

/** Half the width (in degrees) a node may use on a ring: the sector, less the node's own size. */
function halfWidth(r: number): number {
  const margin = ((NODE_R + 8) / r) * (180 / Math.PI);
  return Math.max(0, SECTOR / 2 - margin);
}

/** How many nodes fit side by side on a ring inside the sector. */
function capacity(r: number): number {
  const chord = 2 * r * Math.sin((halfWidth(r) * Math.PI) / 180);
  return Math.max(1, Math.floor(chord / NODE_SPACE) + 1);
}

/** Distance from a point to a segment. */
function nearSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const quad = (a: Point, c: Point, b: Point) =>
  `M ${r1(a.x)} ${r1(a.y)} Q ${r1(c.x)} ${r1(c.y)} ${r1(b.x)} ${r1(b.y)}`;
const line = (a: Point, b: Point) => `M ${r1(a.x)} ${r1(a.y)} L ${r1(b.x)} ${r1(b.y)}`;

/**
 * A line from one skill to another that keeps clear of every other skill: straight when it can be,
 * otherwise bent sideways, a little more each try, until nothing is in the way.
 */
export function edgePath(a: Point, b: Point, others: readonly Point[]): string {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // The side direction, perpendicular to the line.
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const clearance = NODE_R + 8;
  let best = { bend: 0, room: -1 };
  for (const bend of [0, 36, -36, 72, -72, 108, -108, 150, -150]) {
    // A quadratic bend: its control point sits twice as far out as the curve's middle.
    const c = { x: mid.x + nx * bend * 2, y: mid.y + ny * bend * 2 };
    const curve: Point[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      curve.push({
        x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
        y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
      });
    }
    let room = Infinity;
    for (const o of others) {
      for (let i = 0; i < curve.length - 1; i++) {
        room = Math.min(room, nearSegment(o, curve[i]!, curve[i + 1]!));
      }
    }
    if (room > best.room) best = { bend, room };
    if (room >= clearance) return bend === 0 ? line(a, b) : quad(a, c, b);
  }
  const c = { x: mid.x + nx * best.bend * 2, y: mid.y + ny * best.bend * 2 };
  return best.bend === 0 ? line(a, b) : quad(a, c, b);
}

/**
 * Positions every skill once, in the sector of its first school (a skill of two schools picks one
 * sector and sits there), and the lines between skills. Each sector is laid out as a tree: a skill
 * goes on a ring past the skills it needs, a ring that is full pushes the next skill one ring out, and
 * the skills of a ring are spread across the sector in the order of their parents so branches run
 * straight out and rarely cross. Nodes stay inside their sector.
 */
export function wheelLayout(skills: readonly LayoutSkill[]): WheelLayout {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const memo = new Map<string, number>();
  const base = new Map(skills.map((s) => [s.id, ringOf(s, byId, memo)]));
  const order = new Map(skills.map((s, i) => [s.id, i]));
  const home = (s: LayoutSkill): School | undefined => s.schools.find(isSchool);

  const nodes: Placed[] = [];
  for (const school of RING) {
    const mine = skills
      .filter((s) => home(s) === school)
      .sort((a, b) => base.get(a.id)! - base.get(b.id)! || order.get(a.id)! - order.get(b.id)!);
    // Rings: the earliest ring a skill may take, pushed out while that ring is full.
    const ringOfId = new Map<string, number>();
    const used = new Map<number, number>();
    for (const s of mine) {
      let ring = base.get(s.id)!;
      for (const dep of Object.keys(s.requires.skills ?? {})) {
        const d = ringOfId.get(dep);
        if (d !== undefined) ring = Math.max(ring, d + 1);
      }
      while ((used.get(ring) ?? 0) >= capacity(ringRadius(ring))) ring++;
      ringOfId.set(s.id, ring);
      used.set(ring, (used.get(ring) ?? 0) + 1);
    }
    // Along each ring: in the order of the parents' places, spread as little as the nodes need.
    const offset = new Map<string, number>(); // degrees from the middle of the sector
    const rings = [...new Set(ringOfId.values())].sort((x, y) => x - y);
    for (const ring of rings) {
      const r = ringRadius(ring);
      const ids = mine.filter((s) => ringOfId.get(s.id) === ring);
      const key = (s: LayoutSkill): number => {
        const ps = Object.keys(s.requires.skills ?? {})
          .map((d) => offset.get(d))
          .filter((v): v is number => v !== undefined);
        return ps.length ? ps.reduce((x, y) => x + y, 0) / ps.length : 0;
      };
      const sorted = [...ids].sort(
        (x, y) => key(x) - key(y) || order.get(x.id)! - order.get(y.id)!,
      );
      const half = halfWidth(r);
      const gap = Math.min(
        (NODE_SPACE / r) * (180 / Math.PI),
        sorted.length > 1 ? (2 * half) / (sorted.length - 1) : 0,
      );
      const span = gap * (sorted.length - 1);
      // Centre the group on its parents, kept inside the sector.
      const want = sorted.reduce((x, s) => x + key(s), 0) / sorted.length;
      const centre = Math.max(-half + span / 2, Math.min(half - span / 2, want));
      sorted.forEach((s, i) => {
        const off = centre - span / 2 + gap * i;
        offset.set(s.id, off);
        const p = polar(sectorAngle(school) + (off * Math.PI) / 180, r);
        nodes.push({ id: s.id, school, ring, x: p.x, y: p.y });
      });
    }
  }

  const at = new Map(nodes.map((n) => [n.id, n]));
  const edges: Edge[] = [];
  for (const s of skills) {
    const school = home(s);
    const to = at.get(s.id);
    if (!school || !to) continue;
    for (const dep of Object.keys(s.requires.skills ?? {})) {
      const from = at.get(dep);
      if (!from) continue;
      const others = nodes.filter((n) => n.id !== s.id && n.id !== dep);
      edges.push({
        from: dep,
        to: s.id,
        cross: from.school !== school,
        school,
        d: edgePath(from, to, others),
      });
    }
  }
  return { nodes, edges };
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
    if (have < need) {
      out.push(`${SCHOOL_LABELS[school as School] ?? school} level ${need} (have ${have})`);
    }
  }
  for (const [id, need] of Object.entries(r.skills ?? {})) {
    const have = state.skillLevels[id]?.level ?? 0;
    if (have < need) out.push(`${names(id)} level ${need} (have ${have})`);
  }
  return out;
}

/**
 * The view box that frames one sector (to zoom into a school), or the whole wheel. With the layout it
 * fits the skills of that school, with room for their names; without, the middle of the sector.
 */
export function sectorBox(
  school: School | null,
  layout?: WheelLayout,
): { x: number; y: number; w: number; h: number } {
  const whole = { x: -WHEEL.size, y: -WHEEL.size, w: WHEEL.size * 2, h: WHEEL.size * 2 };
  if (!school) return whole;
  const mine = layout?.nodes.filter((n) => n.school === school) ?? [];
  if (mine.length === 0) {
    const mid = polar(sectorAngle(school), 320);
    return { x: mid.x - 300, y: mid.y - 300, w: 600, h: 600 };
  }
  // The hub side too, so the branch is seen starting from the middle.
  const hubSide = polar(sectorAngle(school), WHEEL.hub + 20);
  const xs = [...mine.map((n) => n.x), hubSide.x];
  const ys = [...mine.map((n) => n.y), hubSide.y];
  const pad = 80;
  const x0 = Math.min(...xs) - pad;
  const x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad;
  const y1 = Math.max(...ys) + pad;
  const side = Math.max(x1 - x0, y1 - y0, 420);
  return { x: (x0 + x1) / 2 - side / 2, y: (y0 + y1) / 2 - side / 2, w: side, h: side };
}
