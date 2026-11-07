import type { CombatEvent } from '@game/engine';
import type { FeedEntry } from '@game/shared';
import { formatFeedEvent } from '@game/world';

export type Tone = 'info' | 'good' | 'bad';

export type FeedItem =
  | {
      kind: 'fight';
      title: string;
      subtitle: string;
      outcome: string;
      /** Id of the last feed entry this item covers, used to remember what was watched. */
      lastId: number;
      replayId: number | null;
      /** Present for fights that are not stored on the server (the demo feed). */
      events?: CombatEvent[];
    }
  | { kind: 'card'; title: string; lines: string[]; tone: Tone; lastId: number };

/** More fights than this in one catch-up and routine victories are collapsed into summaries. */
export const COLLAPSE_ABOVE = 12;

const CHATTER = new Set(['travel', 'arrive', 'rest']);
const GOOD = new Set(['level_up', 'dungeon_cleared', 'zone_unlocked', 'quest_completed']);
const BAD = new Set(['defeat', 'party_lost']);

type Payload = Record<string, unknown>;

function isNotable(p: Payload): boolean {
  if (p.boss || p.outcome !== 'victory' || p.context === 'dungeon') return true;
  if (Array.isArray(p.fallen) && p.fallen.length > 0) return true;
  const loot = Array.isArray(p.loot) ? (p.loot as Array<{ rarity?: string }>) : [];
  return loot.some((i) => i.rarity === 'rare' || i.rarity === 'epic');
}

function fightItem(e: FeedEntry): FeedItem {
  const p = e.payload;
  const outcome = String(p.outcome);
  const bits = [
    `${outcome === 'victory' ? 'Victory' : outcome === 'defeat' ? 'Defeat' : 'Draw'} in ${p.rounds} rounds`,
  ];
  if (p.xp) bits.push(`+${p.xp} xp`);
  if (p.gold) bits.push(`+${p.gold} gold`);
  if (Array.isArray(p.missed) && p.missed.length) bits.push('bag full');
  return {
    kind: 'fight',
    title: String(p.title ?? 'Fight'),
    subtitle: bits.join(' · '),
    outcome,
    lastId: e.id,
    replayId: e.replayId,
  };
}

/**
 * Turns the raw feed into slideshow items: each fight is one item, everything in between is merged
 * into a short card. For long absences routine victories are rolled into summary cards and the
 * travelling/resting chatter is dropped, so the player sees the notable things first.
 */
export function buildFeedItems(entries: FeedEntry[], collapseAbove = COLLAPSE_ABOVE): FeedItem[] {
  const fights = entries.filter((e) => e.kind === 'fight').length;
  const collapse = fights > collapseAbove;
  const items: FeedItem[] = [];

  let lines: string[] = [];
  let tone: Tone = 'info';
  let linesLast = 0;
  let run = { n: 0, xp: 0, gold: 0, loot: 0, missed: 0, lastId: 0 };

  const flushLines = () => {
    if (lines.length > 0) {
      const title = tone === 'bad' ? 'Setback' : tone === 'good' ? 'Progress' : 'On the road';
      items.push({ kind: 'card', title, lines, tone, lastId: linesLast });
    }
    lines = [];
    tone = 'info';
  };
  const flushRun = () => {
    if (run.n > 0) {
      const extra =
        (run.loot > 0 ? `, ${run.loot} items` : '') +
        (run.missed > 0 ? `, ${run.missed} left behind (bag full)` : '');
      items.push({
        kind: 'card',
        title: 'Routine hunting',
        lines: [`${run.n} fights won`, `+${run.xp} xp, +${run.gold} gold${extra}`],
        tone: 'info',
        lastId: run.lastId,
      });
    }
    run = { n: 0, xp: 0, gold: 0, loot: 0, missed: 0, lastId: 0 };
  };

  for (const e of entries) {
    if (e.kind === 'fight') {
      const p = e.payload;
      if (collapse && !isNotable(p)) {
        flushLines();
        run.n += 1;
        run.xp += Number(p.xp ?? 0);
        run.gold += Number(p.gold ?? 0);
        run.loot += Array.isArray(p.loot) ? p.loot.length : 0;
        run.missed += Array.isArray(p.missed) ? p.missed.length : 0;
        run.lastId = e.id;
        continue;
      }
      flushRun();
      flushLines();
      items.push(fightItem(e));
      continue;
    }
    if (collapse && CHATTER.has(e.kind)) continue;
    // In a long catch-up the "bag full" lines are already counted in the fight summaries.
    if (collapse && e.kind === 'bag_full') continue;
    flushRun();
    lines.push(formatFeedEvent({ at: e.at, kind: e.kind, payload: e.payload }));
    if (BAD.has(e.kind)) tone = 'bad';
    else if (GOOD.has(e.kind) && tone !== 'bad') tone = 'good';
    linesLast = e.id;
  }
  flushRun();
  flushLines();

  // Entries that were dropped (collapsed chatter) still count as watched.
  const last = entries[entries.length - 1];
  const tail = items[items.length - 1];
  if (last && tail && tail.lastId < last.id) tail.lastId = last.id;
  return items;
}
