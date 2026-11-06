import { advance, createParty, defaultConfig } from '../sim.ts';
import { formatClock, formatFeedEvent } from '../format.ts';
import { STARTER_WORLD } from '../starter-world.ts';

// Usage: pnpm --filter @game/world simulate [--hours 12] [--seed 1] [--order goblin_warren] [--hardcore]
const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? def) : def;
};
const hours = Number(opt('hours', '12'));
const seed = Number(opt('seed', '1'));
const order = opt('order', '');
const hardcore = args.includes('--hardcore');

const start = 0;
let party = createParty({
  id: 'demo',
  name: 'The Wanderers',
  mode: hardcore ? 'hardcore' : 'standard',
  seed,
  now: start,
  world: STARTER_WORLD,
  members: [
    { name: 'Brann', race: 'dwarf', cls: 'warrior' },
    { name: 'Lyra', race: 'elf', cls: 'mage' },
    { name: 'Odo', race: 'human', cls: 'priest' },
    { name: 'Kesh', race: 'orc', cls: 'ranger' },
  ],
});
if (order) party.orders.push({ id: 'o1', kind: 'goto', siteId: order });

const cfg = defaultConfig(60_000);
const lines: string[] = [];
const end = start + hours * 3_600_000;
// Advance in 10 minute slices, like a worker waking up periodically.
for (let t = start; t <= end; t += 600_000) {
  const r = advance(party, t, STARTER_WORLD, cfg);
  party = r.party;
  for (const e of r.events) lines.push(`${formatClock(e.at, start)}  ${formatFeedEvent(e)}`);
}
console.log(lines.join('\n'));
console.log(
  `\nAfter ${hours}h: level ${party.level} (${party.xp} xp), ${party.gold} gold, ${party.bag.length} items, ` +
    `${party.stats.fights} fights (${party.stats.wins}W ${party.stats.defeats}L ${party.stats.draws}D), status ${party.status}`,
);
