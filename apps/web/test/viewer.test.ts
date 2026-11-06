import { runCombat, samples } from '@game/engine';
import { describe, expect, it } from 'vitest';
import { arenaBounds, gridToScreen } from '../src/viewer/iso.ts';
import { clampPan, fitZoom, snapZoom, stepZoom, zoomAbout } from '../src/viewer/camera.ts';
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
