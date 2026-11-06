import type { FeedEntry } from '@game/shared';
import { describe, expect, it } from 'vitest';
import { buildFeedItems, COLLAPSE_ABOVE } from '../src/lib/feedItems.ts';

let id = 0;
const entry = (
  kind: string,
  payload: Record<string, unknown> = {},
  replayId: number | null = null,
): FeedEntry => ({
  id: ++id,
  at: id * 1000,
  kind,
  payload,
  replayId,
});
const win = (over: Record<string, unknown> = {}) =>
  entry(
    'fight',
    {
      title: 'Greenwood: Goblin pack',
      outcome: 'victory',
      rounds: 5,
      xp: 100,
      gold: 20,
      loot: [],
      fallen: [],
      context: 'wild',
      boss: false,
      ...over,
    },
    id + 100,
  );

describe('buildFeedItems', () => {
  it('returns nothing for an empty feed', () => {
    expect(buildFeedItems([])).toEqual([]);
  });

  it('keeps every fight and merges the events between them into cards', () => {
    id = 0;
    const entries = [
      entry('travel', { hexes: 2 }),
      entry('arrive', { name: 'Oakhaven' }),
      win(),
      entry('rest', { ticks: 12, forced: false }),
      entry('level_up', { level: 2 }),
      win(),
    ];
    const items = buildFeedItems(entries);
    expect(items.map((i) => i.kind)).toEqual(['card', 'fight', 'card', 'fight']);
    const first = items[0]!;
    expect(first.kind === 'card' && first.lines).toHaveLength(2);
    const second = items[2]!;
    expect(second.kind === 'card' && second.tone).toBe('good');
    const fight = items[1]!;
    expect(fight.kind === 'fight' && fight.replayId).not.toBeNull();
    expect(fight.kind === 'fight' && fight.subtitle).toContain('Victory in 5 rounds');
  });

  it('item ids never go backwards and the last item covers the whole feed', () => {
    id = 0;
    const entries = [entry('travel'), win(), entry('rest'), win(), entry('travel')];
    const items = buildFeedItems(entries);
    for (let i = 1; i < items.length; i++)
      expect(items[i]!.lastId).toBeGreaterThanOrEqual(items[i - 1]!.lastId);
    expect(items[items.length - 1]!.lastId).toBe(entries[entries.length - 1]!.id);
  });

  it('marks defeats as setbacks', () => {
    id = 0;
    const items = buildFeedItems([
      win({ outcome: 'defeat' }),
      entry('defeat', { goldLost: 10, itemsLost: [], city: 'Oakhaven' }),
    ]);
    const card = items[1]!;
    expect(card.kind === 'card' && card.tone).toBe('bad');
    expect(card.kind === 'card' && card.title).toBe('Setback');
  });

  describe('long absences', () => {
    function longFeed() {
      id = 0;
      const e: FeedEntry[] = [];
      for (let i = 0; i < COLLAPSE_ABOVE + 20; i++) {
        e.push(entry('travel', { hexes: 1 }));
        e.push(win());
      }
      e.splice(
        10,
        0,
        win({ outcome: 'defeat', title: 'Goblin King' }),
        entry('defeat', { goldLost: 5, itemsLost: [], city: 'Oakhaven' }),
      );
      e.splice(30, 0, win({ boss: true, title: 'Boss fight' }));
      e.push(entry('rest', { ticks: 10, forced: false }));
      return e;
    }

    it('rolls routine victories into summaries and keeps the notable fights', () => {
      const entries = longFeed();
      const items = buildFeedItems(entries);
      const fights = items.filter((i) => i.kind === 'fight');
      expect(fights.map((f) => f.kind === 'fight' && f.title)).toEqual([
        'Goblin King',
        'Boss fight',
      ]);
      const summaries = items.filter((i) => i.kind === 'card' && i.title === 'Routine hunting');
      expect(summaries.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThan(entries.length / 3);
    });

    it('summaries add up the routine fights exactly', () => {
      const entries = longFeed();
      const routine = entries.filter(
        (e) => e.kind === 'fight' && e.payload.outcome === 'victory' && !e.payload.boss,
      );
      const items = buildFeedItems(entries);
      let n = 0;
      let xp = 0;
      for (const i of items) {
        if (i.kind === 'card' && i.title === 'Routine hunting') {
          n += Number(/^(\d+) fights won/.exec(i.lines[0]!)![1]);
          xp += Number(/\+(\d+) xp/.exec(i.lines[1]!)![1]);
        }
      }
      expect(n).toBe(routine.length);
      expect(xp).toBe(routine.length * 100);
    });

    it('drops travel and rest chatter but still counts it as watched', () => {
      const entries = longFeed();
      const items = buildFeedItems(entries);
      expect(
        items.some((i) => i.kind === 'card' && i.lines.some((l) => l.startsWith('Travelled'))),
      ).toBe(false);
      expect(items[items.length - 1]!.lastId).toBe(entries[entries.length - 1]!.id);
    });

    it('keeps loot of rare quality and fights where someone fell', () => {
      id = 0;
      const e: FeedEntry[] = [];
      for (let i = 0; i < COLLAPSE_ABOVE + 3; i++) e.push(win());
      e.push(win({ title: 'Lucky', loot: [{ name: 'X', rarity: 'epic' }] }));
      e.push(win({ title: 'Costly', fallen: ['Kesh'] }));
      const titles = buildFeedItems(e)
        .filter((i) => i.kind === 'fight')
        .map((i) => i.kind === 'fight' && i.title);
      expect(titles).toEqual(['Lucky', 'Costly']);
    });
  });
});
