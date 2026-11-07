import { describe, expect, it } from 'vitest';
import {
  badgePoint,
  missingFor,
  nodeIn,
  RING,
  SECTOR,
  sectorAngle,
  sectorBox,
  wheelLayout,
  WHEEL,
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

describe('the ring of sectors', () => {
  it('has thirteen sectors with Bow at the top and Dark beside it', () => {
    expect(RING).toHaveLength(13);
    expect(SECTOR).toBeCloseTo(360 / 13);
    const bow = badgePoint('bow');
    expect(bow.x).toBeCloseTo(0);
    expect(bow.y).toBeLessThan(0);
    // Dark is the last sector: one step back round the circle from Bow.
    expect(sectorAngle('dark') - sectorAngle('bow')).toBeCloseTo(
      -(SECTOR * Math.PI) / 180 + 2 * Math.PI,
    );
    expect(dist(badgePoint('dark'), badgePoint('bow'))).toBeLessThan(
      dist(badgePoint('dark'), badgePoint('shield')),
    );
  });
});

describe('where skills go', () => {
  const layout = wheelLayout(skills);
  const at = (id: string) => nodeIn(layout, id)!;

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

  it('keeps every node inside the rim, in its own sector', () => {
    for (const n of layout.nodes) {
      const r = Math.hypot(n.x, n.y);
      expect(r).toBeGreaterThan(WHEEL.hub);
      expect(r).toBeLessThan(WHEEL.rim);
      const angle = Math.atan2(n.y, n.x);
      let off = angle - sectorAngle(n.school);
      off = Math.atan2(Math.sin(off), Math.cos(off));
      expect(Math.abs(off)).toBeLessThan((SECTOR * Math.PI) / 360 + 1e-6);
    }
  });

  it('draws a dual skill in both of its sectors, with one home', () => {
    const imps = layout.nodes.filter((n) => n.id === 'summon_imp');
    expect(imps.map((n) => n.school).sort()).toEqual(['dark', 'fire']);
    expect(imps.filter((n) => n.home)).toHaveLength(1);
    expect(imps.find((n) => n.home)!.school).toBe('fire');
    expect(nodeIn(layout, 'summon_imp', 'dark')!.school).toBe('dark');
  });

  it('does not stack nodes on the same ring on top of each other', () => {
    const crowded = wheelLayout(Array.from({ length: 8 }, (_, i) => sk(`k${i}`, ['sword'])));
    for (let i = 0; i < crowded.nodes.length; i++) {
      for (let j = i + 1; j < crowded.nodes.length; j++) {
        expect(dist(crowded.nodes[i]!, crowded.nodes[j]!)).toBeGreaterThan(14);
      }
    }
  });

  it('joins a skill to the skills it needs, dashed when they are in another school', () => {
    const byPair = (a: string, b: string) => layout.edges.find((e) => e.from === a && e.to === b);
    expect(byPair('ricochet_arrow', 'shoot')).toMatchObject({ cross: false, school: 'bow' });
    expect(byPair('ember', 'fireball')?.cross).toBe(false);
    // Summon Imp is also in Dark, where its parent lives: not a line across schools.
    expect(byPair('demonology_mastery', 'summon_imp')).toMatchObject({
      cross: false,
      school: 'fire',
    });
    const across = wheelLayout([sk('d1', ['dagger']), sk('f1', ['fire'], { skills: { d1: 1 } })]);
    expect(across.edges).toEqual([{ from: 'd1', to: 'f1', cross: true, school: 'fire' }]);
    expect(layout.edges).toHaveLength(4);
  });

  it('survives a requirement loop and unknown requirements', () => {
    const odd = wheelLayout([
      sk('a', ['fire'], { skills: { b: 1 } }),
      sk('b', ['fire'], { skills: { a: 1 } }),
      sk('c', ['fire'], { skills: { missing: 1 } }),
    ]);
    expect(odd.nodes).toHaveLength(3);
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
  it('frames the whole wheel, or the middle of one sector', () => {
    const whole = sectorBox(null);
    expect(whole.w).toBe(WHEEL.size * 2);
    const bow = sectorBox('bow');
    expect(bow.w).toBeLessThan(whole.w / 2);
    expect(bow.x + bow.w / 2).toBeCloseTo(0);
    expect(bow.y + bow.h / 2).toBeLessThan(0);
  });
});
