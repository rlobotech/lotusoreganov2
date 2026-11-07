import { describe, expect, it } from 'vitest';
import {
  badgePoint,
  edgePath,
  missingFor,
  NODE_R,
  RING,
  SECTOR,
  sectorAngle,
  sectorBox,
  wheelLayout,
  WHEEL,
  type WheelLayout,
} from '../src/lib/manage/wheelLayout.ts';

const sk = (
  id: string,
  schools: string[],
  requires: {
    charLevel?: number;
    schools?: Record<string, number>;
    skills?: Record<string, number>;
  } = {},
) => ({ id, schools, requires });

const skills = [
  sk('bow_mastery', ['bow']),
  sk('ricochet_arrow', ['bow']),
  sk('shoot', ['bow'], { skills: { ricochet_arrow: 2 } }),
  sk('volley', ['bow'], { schools: { bow: 25 }, skills: { shoot: 2 } }),
  sk('ember', ['fire']),
  sk('fireball', ['fire'], { schools: { fire: 10 }, skills: { ember: 2 } }),
  sk('demonology_mastery', ['dark']),
  sk('summon_imp', ['fire', 'dark'], { skills: { demonology_mastery: 1 } }),
  sk('late', ['axe'], { schools: { axe: 80 } }),
];

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Every node must lie inside its own sector, with room for the node itself. */
function insideSectors(layout: WheelLayout): void {
  for (const n of layout.nodes) {
    const r = Math.hypot(n.x, n.y);
    expect(r, n.id).toBeGreaterThan(WHEEL.hub + NODE_R);
    expect(r, n.id).toBeLessThan(WHEEL.rim - NODE_R);
    let off = Math.atan2(n.y, n.x) - sectorAngle(n.school);
    off = Math.atan2(Math.sin(off), Math.cos(off));
    // The node's edge, not only its middle, stays on its side of the sector line.
    const margin = Math.asin(Math.min(1, NODE_R / r));
    expect(Math.abs(off) + margin, n.id).toBeLessThanOrEqual((SECTOR * Math.PI) / 360 + 1e-6);
  }
}

describe('the ring of sectors', () => {
  it('has thirteen sectors with Bow at the top and Dark beside it', () => {
    expect(RING).toHaveLength(13);
    expect(SECTOR).toBeCloseTo(360 / 13);
    const bow = badgePoint('bow');
    expect(bow.x).toBeCloseTo(0);
    expect(bow.y).toBeLessThan(0);
    expect(dist(badgePoint('dark'), badgePoint('bow'))).toBeLessThan(
      dist(badgePoint('dark'), badgePoint('shield')),
    );
  });
});

describe('where skills go', () => {
  const layout = wheelLayout(skills);
  const at = (id: string) => layout.nodes.find((n) => n.id === id)!;

  it('puts starters on the first ring and advanced skills further out', () => {
    expect(at('bow_mastery').ring).toBe(0);
    expect(at('ricochet_arrow').ring).toBe(0);
    expect(at('shoot').ring).toBe(1);
    expect(at('volley').ring).toBe(2);
    expect(at('late').ring).toBe(4); // school level 80
    const r = (id: string) => Math.hypot(at(id).x, at(id).y);
    expect(r('shoot')).toBeGreaterThan(r('ricochet_arrow'));
    expect(r('volley')).toBeGreaterThan(r('shoot'));
    expect(r('late')).toBeGreaterThan(r('volley'));
  });

  it('keeps every node inside its own sector, never over a boundary', () => {
    insideSectors(layout);
  });

  it('puts a skill of two schools in one sector only, the first of its schools', () => {
    const imps = layout.nodes.filter((n) => n.id === 'summon_imp');
    expect(imps).toHaveLength(1);
    expect(imps[0]!.school).toBe('fire');
    expect(layout.nodes).toHaveLength(skills.length);
    expect(new Set(layout.nodes.map((n) => n.id)).size).toBe(skills.length);
  });

  it('keeps nodes well apart, even in a crowded school', () => {
    // Fourteen skills with nothing to follow all want the first ring.
    const crowded = wheelLayout(Array.from({ length: 14 }, (_, i) => sk(`k${i}`, ['dark'])));
    insideSectors(crowded);
    for (let i = 0; i < crowded.nodes.length; i++) {
      for (let j = i + 1; j < crowded.nodes.length; j++) {
        expect(dist(crowded.nodes[i]!, crowded.nodes[j]!)).toBeGreaterThan(NODE_R * 2 + 12);
      }
    }
    // A full ring pushes the rest outward instead of stacking them.
    expect(Math.max(...crowded.nodes.map((n) => n.ring))).toBeGreaterThan(1);
  });

  it('keeps nodes apart across the whole wheel with a realistic tree', () => {
    const many = [
      ...Array.from({ length: 6 }, (_, i) => sk(`d${i}`, ['dark'])),
      sk('dd', ['dark'], { skills: { d0: 2, d1: 2 } }),
      sk('de', ['dark'], { skills: { d2: 2 } }),
      sk('df', ['dark'], { schools: { dark: 40 }, skills: { dd: 3 } }),
      ...Array.from({ length: 5 }, (_, i) => sk(`s${i}`, ['sword'])),
      sk('s_up', ['sword'], { skills: { s0: 2 } }),
    ];
    const lay = wheelLayout(many);
    insideSectors(lay);
    for (let i = 0; i < lay.nodes.length; i++) {
      for (let j = i + 1; j < lay.nodes.length; j++) {
        expect(
          dist(lay.nodes[i]!, lay.nodes[j]!),
          `${lay.nodes[i]!.id}/${lay.nodes[j]!.id}`,
        ).toBeGreaterThan(NODE_R * 2 + 8);
      }
    }
  });

  it('places a skill in line with the skill it needs, so branches run straight out', () => {
    const lay = wheelLayout([
      sk('root', ['sword']),
      sk('child', ['sword'], { skills: { root: 1 } }),
    ]);
    const root = lay.nodes.find((n) => n.id === 'root')!;
    const child = lay.nodes.find((n) => n.id === 'child')!;
    const angle = (n: { x: number; y: number }) => Math.atan2(n.y, n.x);
    expect(angle(child)).toBeCloseTo(angle(root), 5);
    expect(lay.edges[0]!.d).toMatch(/^M [-\d.]+ [-\d.]+ L /); // straight
  });

  it('joins a skill to the skills it needs, dashed when they are in another school', () => {
    const byPair = (a: string, b: string) => layout.edges.find((e) => e.from === a && e.to === b);
    expect(byPair('ricochet_arrow', 'shoot')).toMatchObject({ cross: false, school: 'bow' });
    expect(byPair('ember', 'fireball')?.cross).toBe(false);
    // Summon Imp sits in Fire, its parent in Dark: a line across schools.
    expect(byPair('demonology_mastery', 'summon_imp')).toMatchObject({
      cross: true,
      school: 'fire',
    });
    expect(layout.edges).toHaveLength(4);
  });

  it('survives a requirement loop and unknown requirements', () => {
    const odd = wheelLayout([
      sk('a', ['fire'], { skills: { b: 1 } }),
      sk('b', ['fire'], { skills: { a: 1 } }),
      sk('c', ['fire'], { skills: { missing: 1 } }),
    ]);
    expect(odd.nodes).toHaveLength(3);
    insideSectors(odd);
  });
});

describe('lines that keep clear of other skills', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 200, y: 0 };

  it('are straight when nothing is in the way', () => {
    expect(edgePath(a, b, [{ x: 100, y: 120 }])).toBe('M 0 0 L 200 0');
  });

  it('bend around a skill that sits on the line, and clear it', () => {
    const blocker = { x: 100, y: 0 };
    const d = edgePath(a, b, [blocker]);
    expect(d).toMatch(/Q /);
    // The middle of the bent line is far enough from the skill.
    const [, cx, cy] = d.match(/Q ([-\d.]+) ([-\d.]+)/)!.map(Number) as [number, number, number];
    const mid = { x: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, y: 0.25 * a.y + 0.5 * cy + 0.25 * b.y };
    expect(dist(mid, blocker)).toBeGreaterThan(NODE_R + 8);
  });

  it('never run over a node in a laid out wheel', () => {
    // A skill that needs one two rings out, with another skill in between on the straight line.
    const lay = wheelLayout([
      sk('r0', ['sword']),
      sk('r1', ['sword'], { skills: { r0: 1 } }),
      sk('r2', ['sword'], { skills: { r1: 1 } }),
      sk('far', ['sword'], { skills: { r0: 1 }, schools: { sword: 60 } }),
    ]);
    const nodes = Object.fromEntries(lay.nodes.map((n) => [n.id, n]));
    const edge = lay.edges.find((e) => e.from === 'r0' && e.to === 'far')!;
    // Walk the path and keep clear of the nodes that are not its ends.
    const pts: Array<{ x: number; y: number }> = [];
    const m = edge.d.match(
      /M ([-\d.]+) ([-\d.]+) (?:L ([-\d.]+) ([-\d.]+)|Q ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+))/,
    )!;
    const n = m.slice(1).map((v) => (v === undefined ? NaN : Number(v)));
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      if (!Number.isNaN(n[2]!)) {
        pts.push({ x: n[0]! + (n[2]! - n[0]!) * t, y: n[1]! + (n[3]! - n[1]!) * t });
      } else {
        pts.push({
          x: (1 - t) ** 2 * n[0]! + 2 * (1 - t) * t * n[4]! + t * t * n[6]!,
          y: (1 - t) ** 2 * n[1]! + 2 * (1 - t) * t * n[5]! + t * t * n[7]!,
        });
      }
    }
    for (const id of ['r1', 'r2']) {
      for (const p of pts) expect(dist(p, nodes[id]!), id).toBeGreaterThan(NODE_R);
    }
  });
});

describe('what a skill still needs', () => {
  const names = (id: string) => id.replace('_', ' ');
  const state = (level: number, levels: Record<string, number>, school = 0) => ({
    level,
    skillLevels: Object.fromEntries(Object.entries(levels).map(([k, v]) => [k, { level: v }])),
    schoolLevel: () => school,
  });
  const wall = sk('ice_wall', ['water'], {
    charLevel: 15,
    schools: { water: 20 },
    skills: { ice_shard: 5, rain: 3 },
  });

  it('lists everything missing, and nothing once it is met', () => {
    expect(missingFor(wall, names, state(10, { ice_shard: 2 }, 8))).toEqual([
      'character level 15 (have 10)',
      'Water level 20 (have 8)',
      'ice shard level 5 (have 2)',
      'rain level 3 (have 0)',
    ]);
    expect(missingFor(wall, names, state(15, { ice_shard: 5, rain: 3 }, 20))).toEqual([]);
  });
});

describe('zooming to a school', () => {
  it('frames the whole wheel, or the skills of one sector', () => {
    const whole = sectorBox(null);
    expect(whole.w).toBe(WHEEL.size * 2);
    const lay = wheelLayout(skills);
    const bow = sectorBox('bow', lay);
    expect(bow.w).toBeLessThan(whole.w / 2);
    expect(bow.w).toBe(bow.h);
    for (const n of lay.nodes.filter((x) => x.school === 'bow')) {
      expect(n.x).toBeGreaterThan(bow.x);
      expect(n.x).toBeLessThan(bow.x + bow.w);
      expect(n.y).toBeGreaterThan(bow.y);
      expect(n.y).toBeLessThan(bow.y + bow.h);
    }
    // With no skills, the middle of the sector.
    const empty = sectorBox('bow');
    expect(empty.x + empty.w / 2).toBeCloseTo(0);
  });
});
