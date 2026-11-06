import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng.ts';

describe('rng', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const sa = Array.from({ length: 20 }, () => a.next());
    const sb = Array.from({ length: 20 }, () => b.next());
    const sc = Array.from({ length: 20 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  it('produces floats in [0, 1) with a roughly flat distribution', () => {
    const r = createRng(1);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 10)]++;
    }
    for (const n of buckets) expect(Math.abs(n - 2000)).toBeLessThan(250);
  });

  it('int is inclusive on both ends and chance respects the percent', () => {
    const r = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(3, 6));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);

    let hits = 0;
    for (let i = 0; i < 10000; i++) if (r.chance(30)) hits++;
    expect(Math.abs(hits - 3000)).toBeLessThan(300);
    expect(r.chance(0)).toBe(false);
    expect(r.chance(100)).toBe(true);
  });

  it('matches a pinned sequence so accidental algorithm changes are caught', () => {
    const r = createRng(12345);
    expect(Array.from({ length: 3 }, () => r.int(0, 1000))).toMatchInlineSnapshot(`
      [
        326,
        19,
        277,
      ]
    `);
  });
});
