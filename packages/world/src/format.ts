import type { FeedEvent } from './types.ts';

const pad = (n: number) => String(n).padStart(2, '0');

/** "D1 07:42" style timestamp relative to the party's start. */
export function formatClock(at: number, start: number): string {
  const min = Math.max(0, Math.round((at - start) / 60_000));
  const day = Math.floor(min / 1440) + 1;
  return `D${day} ${pad(Math.floor((min % 1440) / 60))}:${pad(min % 60)}`;
}

export function formatFeedEvent(e: FeedEvent): string {
  // The payload shape depends on the event kind; this is display-only text so a loose type is fine.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = e.payload as Record<string, any>;
  switch (e.kind) {
    case 'travel':
      return `Travelled ${p.hexes} hex${p.hexes === 1 ? '' : 'es'}.`;
    case 'arrive':
      return `Arrived at ${p.name}.`;
    case 'fight': {
      const bits = [`${p.title}: ${p.outcome} in ${p.rounds} rounds`];
      if (p.xp) bits.push(`+${p.xp} xp`);
      if (p.gold) bits.push(`+${p.gold} gold`);
      if (p.loot?.length)
        bits.push(`loot: ${p.loot.map((i: { name: string }) => i.name).join(', ')}`);
      if (p.missed?.length) bits.push(`left behind (bag full): ${p.missed.join(', ')}`);
      if (p.fallen?.length) bits.push(`fallen: ${p.fallen.join(', ')}`);
      return bits.join(' | ');
    }
    case 'bag_full':
      return `The bag is full: ${(p.missed as string[]).join(', ')} could not be picked up.`;
    case 'items_delivered':
      return `Delivered to the bag: ${(p.items as string[]).join(', ')}.`;
    case 'level_up':
      return `The party reached level ${p.level}!`;
    case 'rest':
      return `Rested (${p.ticks} min${p.forced ? ', recovering' : ''}).`;
    case 'enter_dungeon':
      return `Entered ${p.name} (${p.stages} stages, recommended level ${p.recommendedLevel}).`;
    case 'dungeon_progress':
      return `${p.name}: stage ${p.stage}/${p.total} cleared.`;
    case 'dungeon_cleared':
      return `${p.name} cleared! +${p.gold} gold, +${p.xp} xp.`;
    case 'zone_unlocked':
      return `New region unlocked: ${p.name}.`;
    case 'defeat': {
      const lost = (p.itemsLost as string[]).length
        ? `, lost ${(p.itemsLost as string[]).join(', ')}`
        : '';
      return `DEFEATED. Back at ${p.city}, lost ${p.goldLost} gold${lost}.`;
    }
    case 'quest_completed': {
      const item = p.item ? `, ${p.item}${p.waiting ? ' (waiting for bag space)' : ''}` : '';
      return `Quest complete: ${p.name}! +${p.gold} gold, +${p.xp} xp${item}.`;
    }
    case 'teleport':
      return `Teleported from ${p.from} to ${p.to} for ${p.cost} gold.`;
    case 'party_lost':
      return `${p.name} has fallen for good at level ${p.level}.`;
    case 'order_failed':
      return `Could not follow the order to ${p.siteId ?? p.questId} (${p.reason}).`;
    default:
      return `${e.kind} ${JSON.stringify(e.payload)}`;
  }
}
