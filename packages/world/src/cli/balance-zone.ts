import { acceptQuest } from '../actions.ts';
import { questAvailability } from '../quests.ts';
import { advance, createParty, defaultConfig } from '../sim.ts';
import { STARTER_WORLD } from '../starter-world.ts';

// Usage: pnpm --filter @game/world balance [--parties 40] [--hours 48]
// Plays many parties through the starter world and reports pace and difficulty by party level.
const args = process.argv.slice(2);
const opt = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const parties = opt('parties', 40);
const hours = opt('hours', 48);
const cfg = defaultConfig(60_000);

const byLevel = new Map<number, { win: number; loss: number; draw: number }>();
let fights = 0;
let defeats = 0;
const levelAt = { h6: 0, h12: 0, h24: 0, h48: 0 };
const started = performance.now();

for (let s = 1; s <= parties; s++) {
  let party = createParty({
    id: `p${s}`,
    name: `Party ${s}`,
    seed: s * 7919,
    now: 0,
    world: STARTER_WORLD,
    members: [
      { name: 'W', race: 'dwarf', cls: 'warrior' },
      { name: 'M', race: 'elf', cls: 'mage' },
      { name: 'P', race: 'human', cls: 'priest' },
      { name: 'R', race: 'orc', cls: 'ranger' },
    ],
  });
  // Players who check in: with nothing queued, take the easiest quest that is available.
  for (let m = 0; m <= hours * 6; m++) {
    const t = m * 600_000;
    if (party.orders.length === 0) {
      const next = Object.values(STARTER_WORLD.quests)
        .filter(
          (q) => !q.repeatable && questAvailability(party, STARTER_WORLD, q).status === 'available',
        )
        .sort((a, b) => a.minLevel - b.minLevel)[0];
      if (next) acceptQuest(party, STARTER_WORLD, next.id, `q${m}`, t);
    }
    const r = advance(party, t, STARTER_WORLD, cfg);
    party = r.party;
    for (const e of r.events) {
      if (e.kind !== 'fight') continue;
      const p = e.payload as { outcome: string };
      const lv = party.level;
      const row = byLevel.get(lv) ?? { win: 0, loss: 0, draw: 0 };
      if (p.outcome === 'victory') row.win++;
      else if (p.outcome === 'defeat') row.loss++;
      else row.draw++;
      byLevel.set(lv, row);
      fights++;
      if (p.outcome === 'defeat') defeats++;
    }
    if (m === 36) levelAt.h6 += party.level;
    if (m === 72) levelAt.h12 += party.level;
    if (m === 144) levelAt.h24 += party.level;
    if (m === 288) levelAt.h48 += party.level;
  }
}

console.log(
  `${parties} parties x ${hours}h in ${(performance.now() - started).toFixed(0)} ms, ${fights} fights, ${defeats} defeats`,
);
console.log(
  `Average level after 6h ${(levelAt.h6 / parties).toFixed(1)}, 12h ${(levelAt.h12 / parties).toFixed(1)}, ` +
    `24h ${(levelAt.h24 / parties).toFixed(1)}, 48h ${(levelAt.h48 / parties).toFixed(1)}`,
);
console.log('Party level -> fights, win %, defeat %');
for (const [lv, r] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
  const n = r.win + r.loss + r.draw;
  console.log(
    `  L${String(lv).padStart(2)}  ${String(n).padStart(5)}  win ${((r.win / n) * 100).toFixed(0).padStart(3)}%  defeat ${((r.loss / n) * 100).toFixed(0).padStart(3)}%`,
  );
}
