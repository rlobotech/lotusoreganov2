import { runCombat, samples, type CombatEvent } from '@game/engine';
import { describe, expect, it } from 'vitest';
import { arenaBounds, gridToScreen } from '../src/viewer/iso.ts';
import {
  clampPan,
  fitZoom,
  followWindow,
  snapZoom,
  stepZoom,
  zoomAbout,
} from '../src/viewer/camera.ts';
import { Playback } from '../src/viewer/playback.ts';
import { buildTimeline, eventDuration } from '../src/viewer/state.ts';

const events = runCombat(samples.input(1)).events;

describe('iso transform', () => {
  it('maps grid to a 2:1 diamond', () => {
    expect(gridToScreen(0, 0)).toEqual({ x: 0, y: 0 });
    expect(gridToScreen(1, 0)).toEqual({ x: 16, y: 8 });
    expect(gridToScreen(0, 1)).toEqual({ x: -16, y: 8 });
    expect(gridToScreen(1, 1)).toEqual({ x: 0, y: 16 });
  });

  it('arena bounds contain every tile', () => {
    const b = arenaBounds(10, 8);
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 8; y++) {
        const p = gridToScreen(x, y);
        expect(p.x).toBeGreaterThanOrEqual(b.minX);
        expect(p.x).toBeLessThanOrEqual(b.maxX);
        expect(p.y).toBeGreaterThanOrEqual(b.minY);
        expect(p.y).toBeLessThanOrEqual(b.maxY);
      }
    }
  });
});

describe('timeline', () => {
  it('builds one state per step and ends with the logged outcome', () => {
    const { steps, states } = buildTimeline(events);
    expect(states).toHaveLength(steps.length + 1);
    const last = events[events.length - 1]!;
    expect(last.t).toBe('end');
    expect(states[states.length - 1]!.outcome).toBe(last.t === 'end' ? last.outcome : null);
  });

  it('ends with the same hp and positions the engine reported', () => {
    const result = runCombat(samples.input(7));
    const { states } = buildTimeline(result.events);
    const final = states[states.length - 1]!;
    for (const u of result.units) {
      expect(final.units[u.id]!.hp).toBe(u.hp);
      expect(final.units[u.id]!.alive).toBe(u.alive);
    }
  });

  it('does not mutate earlier states', () => {
    const { states } = buildTimeline(events);
    expect(states[0]!.round).toBe(0);
    expect(Object.values(states[0]!.units).every((u) => u.hp === u.maxHp)).toBe(true);
  });

  it('rejects a log without a start event', () => {
    expect(() => buildTimeline(events.slice(1))).toThrow();
  });
});

describe('playback', () => {
  it('plays to the end in the expected total time and stops', () => {
    const pb = new Playback(events);
    const total = pb.steps.reduce((sum, e) => sum + eventDuration(e), 0);
    pb.play();
    let t = 0;
    while (pb.playing && t < total * 2) {
      pb.tick(16);
      t += 16;
    }
    expect(pb.atEnd).toBe(true);
    expect(pb.playing).toBe(false);
    expect(t).toBeGreaterThanOrEqual(total - 16);
    expect(t).toBeLessThanOrEqual(total + 32);
  });

  it('speed scales playback time', () => {
    const slow = new Playback(events);
    const fast = new Playback(events);
    fast.setSpeed(4);
    slow.play();
    fast.play();
    for (let i = 0; i < 200; i++) {
      slow.tick(16);
      fast.tick(16);
    }
    expect(fast.index).toBeGreaterThan(slow.index);
  });

  it('jumps between turns and rounds in both directions', () => {
    const pb = new Playback(events);
    pb.nextTurn();
    const first = pb.index;
    expect(pb.steps[first]!.t).toBe('turn');
    pb.nextTurn();
    expect(pb.index).toBeGreaterThan(first);
    pb.prevTurn();
    expect(pb.index).toBe(first);
    pb.prevTurn();
    expect(pb.index).toBe(0);

    pb.seekRound(3);
    expect(pb.steps[pb.index]!.t).toBe('round');
    expect(pb.state.round).toBe(2);
    pb.end();
    expect(pb.atEnd).toBe(true);
    expect(pb.state.outcome).not.toBeNull();
  });

  it('scrubbing back restores earlier state exactly', () => {
    const pb = new Playback(events);
    pb.end();
    const finalHp = Object.values(pb.state.units).map((u) => u.hp);
    pb.seek(0);
    expect(Object.values(pb.state.units).every((u) => u.hp === u.maxHp)).toBe(true);
    pb.end();
    expect(Object.values(pb.state.units).map((u) => u.hp)).toEqual(finalHp);
  });

  it('notifies listeners and replays from the start when played at the end', () => {
    const pb = new Playback(events);
    let calls = 0;
    pb.subscribe(() => calls++);
    pb.end();
    pb.play();
    expect(pb.index).toBe(0);
    expect(pb.playing).toBe(true);
    expect(calls).toBeGreaterThan(0);
  });
});

describe('camera maths', () => {
  const b = arenaBounds(10, 8);

  it('fits with an integer zoom when there is room, fractional when there is not', () => {
    const big = fitZoom(1280, 720, b);
    expect(Number.isInteger(big)).toBe(true);
    expect(big).toBeGreaterThanOrEqual(2);
    const tiny = fitZoom(200, 200, b);
    expect(tiny).toBeLessThan(1);
    expect(tiny).toBeGreaterThan(0);
  });

  it('steps through integer zooms and respects limits', () => {
    expect(stepZoom(1, 1)).toBe(2);
    expect(stepZoom(2.4, 1)).toBe(3);
    expect(stepZoom(3, -1)).toBe(2);
    expect(stepZoom(1, -1)).toBe(1);
    expect(stepZoom(8, 1)).toBe(8);
    expect(stepZoom(0.6, 1, 0.6)).toBe(1);
    expect(stepZoom(1, -1, 0.6)).toBe(0.6);
    expect(snapZoom(2.6)).toBe(3);
    expect(snapZoom(0.2)).toBe(1);
  });

  it('keeps the point under the cursor fixed when zooming', () => {
    const pos = { x: 100, y: 50 };
    const anchor = { x: 300, y: 200 };
    const worldBefore = { x: (anchor.x - pos.x) / 2, y: (anchor.y - pos.y) / 2 };
    const next = zoomAbout(pos, 2, 4, anchor);
    expect((anchor.x - next.x) / 4).toBeCloseTo(worldBefore.x);
    expect((anchor.y - next.y) / 4).toBeCloseTo(worldBefore.y);
  });

  it('stops the arena being dragged off screen', () => {
    const far = clampPan({ x: 5000, y: 5000 }, 800, 600, b, 2);
    expect(b.minX * 2 + far.x).toBeLessThanOrEqual(800);
    expect(b.minY * 2 + far.y).toBeLessThanOrEqual(600);
    const ok = clampPan({ x: 400, y: 300 }, 800, 600, b, 2);
    expect(ok).toEqual({ x: 400, y: 300 });
  });
});

describe('exact fit', () => {
  it('keeps the fractional fit when asked, whole steps otherwise', () => {
    const b = { minX: 0, minY: 0, maxX: 300, maxY: 300 };
    expect(fitZoom(500, 500, b)).toBe(1);
    expect(fitZoom(500, 500, b, 12, true)).toBeCloseTo(476 / 300);
    expect(fitZoom(100, 100, b, 12, true)).toBe(fitZoom(100, 100, b));
  });
});

describe('following the party on a big map', () => {
  const all = { minX: 0, minY: 0, maxX: 1200, maxY: 1200 };

  it('shows a window around the party shaped like the screen', () => {
    const w = followWindow(all, { x: 600, y: 600 }, 400, 400, 800);
    expect(w).toEqual({ minX: 400, minY: 200, maxX: 800, maxY: 1000 });
    const wide = followWindow(all, { x: 600, y: 600 }, 400, 800, 400);
    expect(wide.maxX - wide.minX).toBe(400);
    expect(wide.maxY - wide.minY).toBe(200);
  });

  it('slides along the edge instead of showing empty space', () => {
    const corner = followWindow(all, { x: 5, y: 1190 }, 400, 400, 400);
    expect(corner).toEqual({ minX: 0, minY: 800, maxX: 400, maxY: 1200 });
    const far = followWindow(all, { x: 1195, y: 3 }, 400, 400, 400);
    expect(far).toEqual({ minX: 800, minY: 0, maxX: 1200, maxY: 400 });
  });

  it('shows everything when the map is smaller than the window', () => {
    const small = { minX: 0, minY: 0, maxX: 300, maxY: 200 };
    expect(followWindow(small, { x: 150, y: 100 }, 400, 400, 800)).toEqual(small);
  });
});

describe('summons in a replay', () => {
  const start: Extract<CombatEvent, { t: 'start' }> = {
    t: 'start',
    formatVersion: 3,
    engineVersion: '1.0.0',
    seed: 1,
    arena: { id: 'a', width: 5, height: 5, blocked: [] },
    units: [
      {
        id: 'c',
        name: 'C',
        team: 'party',
        level: 5,
        sprite: null,
        x: 0,
        y: 0,
        hp: 10,
        maxHp: 10,
        mana: 5,
        maxMana: 5,
      },
      {
        id: 'e',
        name: 'E',
        team: 'enemy',
        level: 5,
        sprite: null,
        x: 4,
        y: 0,
        hp: 10,
        maxHp: 10,
        mana: 0,
        maxMana: 0,
      },
    ],
  };
  const summon: Extract<CombatEvent, { t: 'summon' }> = {
    t: 'summon',
    unit: 'c~demon1',
    caster: 'c',
    skill: 'summon_imp',
    name: 'Imp',
    team: 'party',
    level: 5,
    sprite: 'imp',
    x: 1,
    y: 0,
    hp: 8,
    maxHp: 8,
    mana: 2,
    maxMana: 2,
  };

  it('is built hidden from the start and appears with its event', () => {
    const events: CombatEvent[] = [
      start,
      { t: 'round', n: 1, order: ['c', 'e'] },
      { t: 'skill', unit: 'c', skill: 'summon_imp', target: 'c', x: 0, y: 0, vfx: 'buff' },
      summon,
      { t: 'end', outcome: 'draw', rounds: 1 },
    ];
    const { steps, states } = buildTimeline(events);
    // The unit exists in every state (so the scene can build it), hidden until the summon.
    expect(states[0]!.order).toEqual(['c', 'e', 'c~demon1']);
    expect(states[0]!.units['c~demon1']!.hidden).toBe(true);
    const at = steps.indexOf(summon);
    expect(states[at]!.units['c~demon1']!.hidden).toBe(true);
    const after = states[at + 1]!.units['c~demon1']!;
    expect(after.hidden).toBe(false);
    expect(after).toMatchObject({ x: 1, y: 0, hp: 8, alive: true, faceLeft: false, team: 'party' });
    expect(eventDuration(summon)).toBeGreaterThan(0);
  });

  it('plays a real fight with a summon from the engine', () => {
    const imp = {
      id: 'call_imp',
      name: 'Call Imp',
      kind: 'summon',
      source: 'spell',
      attr: 'int',
      power: 0,
      range: 0,
      manaCost: 0,
      cooldown: 0,
      side: 'self',
      summon: {
        group: 'demon',
        name: 'Imp',
        shares: { str: 0.3, dex: 0.5, int: 0.5, vit: 0.5, wis: 0.3 },
        move: 3,
        skills: ['attack'],
        ai: [{ skill: 'attack' }],
      },
    } as const;
    const result = runCombat({
      seed: 9,
      arena: samples.arena,
      units: [
        {
          ...samples.input(1).units[0]!,
          skills: ['call_imp', 'attack'],
          ai: [{ skill: 'call_imp' }, { skill: 'attack' }],
        },
        samples.input(1).units.find((u) => u.team === 'enemy')!,
      ],
      skills: { ...samples.input(1).skills, call_imp: imp as never },
    });
    const { states } = buildTimeline(result.events);
    const last = states[states.length - 1]!;
    const unit = Object.values(last.units).find((u) => u.id.includes('~'))!;
    expect(unit).toBeDefined();
    expect(unit.hidden).toBe(false);
  });
});

describe('stealth and unseen steps in a replay', () => {
  const start: Extract<CombatEvent, { t: 'start' }> = {
    t: 'start',
    formatVersion: 3,
    engineVersion: '1.0.0',
    seed: 1,
    arena: { id: 'a', width: 9, height: 3, blocked: [] },
    units: [
      {
        id: 'r',
        name: 'R',
        team: 'party',
        level: 5,
        sprite: null,
        x: 0,
        y: 0,
        hp: 10,
        maxHp: 10,
        mana: 5,
        maxMana: 5,
      },
      {
        id: 'e',
        name: 'E',
        team: 'enemy',
        level: 5,
        sprite: null,
        x: 8,
        y: 0,
        hp: 10,
        maxHp: 10,
        mana: 0,
        maxMana: 0,
      },
    ],
  };

  it('moves the unit at once, takes longer to play, and tracks the hiding', () => {
    const step: CombatEvent = { t: 'move', unit: 'r', path: [{ x: 7, y: 0 }], teleport: true };
    const { states } = buildTimeline([
      start,
      step,
      { t: 'status', unit: 'r', status: 'stealth', on: true },
      { t: 'status', unit: 'r', status: 'stealth', on: false },
    ]);
    expect(states[1]!.units.r).toMatchObject({ x: 7, y: 0 });
    expect(states[2]!.units.r!.statuses).toContain('stealth');
    expect(states[3]!.units.r!.statuses).not.toContain('stealth');
    const walk: CombatEvent = { t: 'move', unit: 'r', path: [{ x: 1, y: 0 }] };
    expect(eventDuration(step)).toBeGreaterThan(eventDuration(walk));
  });
});

describe('where the art is', () => {
  it('heroes use the south-east picture in the characters folder, everything else the plain name', async () => {
    const { spriteUrl } = await import('../src/viewer/sprites.ts');
    expect(spriteUrl('dwarf_warrior')).toBe('/sprites/characters/dwarf_warrior_se.png');
    expect(spriteUrl('orc_necromancer')).toBe('/sprites/characters/orc_necromancer_se.png');
    expect(spriteUrl('goblin')).toBe('/sprites/goblin.png');
    expect(spriteUrl('imp')).toBe('/sprites/imp.png');
    // Not a race: a monster with an underscore in its name stays a plain sprite.
    expect(spriteUrl('ice_golem')).toBe('/sprites/ice_golem.png');
  });

  it('the inventory and party creation use the front picture', async () => {
    const { characterSprite } = await import('../src/lib/inventory/layout.ts');
    expect(characterSprite('elf', 'mage')).toBe('/sprites/characters/elf_mage_front.png');
  });
});
