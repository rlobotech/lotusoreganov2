import { runCombat, samples, type CombatEvent, type Outcome } from '@game/engine';

export type FeedItem =
  | {
      kind: 'fight';
      title: string;
      subtitle: string;
      events: CombatEvent[];
      outcome: Outcome;
    }
  | { kind: 'card'; title: string; lines: string[]; tone: 'info' | 'good' | 'bad' };

export function fight(title: string, seed: number): FeedItem {
  const r = runCombat(samples.input(seed));
  return {
    kind: 'fight',
    title,
    subtitle: `${r.outcome === 'victory' ? 'Victory' : r.outcome === 'defeat' ? 'Defeat' : 'Draw'} in ${r.rounds} rounds`,
    events: r.events,
    outcome: r.outcome,
  };
}

/** Fake "while you were away" feed used until the server produces a real one (M3). */
export function buildDemoFeed(): FeedItem[] {
  return [
    {
      kind: 'card',
      title: 'On the road',
      lines: ['Travelled 4 hexes through the Whispering Wood.', 'Rested once (12 minutes).'],
      tone: 'info',
    },
    fight('Goblin ambush', 3),
    {
      kind: 'card',
      title: 'Spoils',
      lines: ['Found 38 gold, Rusty Axe, 2 Healing Herbs.', 'The party reached level 6.'],
      tone: 'good',
    },
    fight('Orc patrol', 11),
    {
      kind: 'card',
      title: 'Camp',
      lines: ['The party rested to full health before moving on.'],
      tone: 'info',
    },
  ];
}
