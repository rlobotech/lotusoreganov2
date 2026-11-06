import { runCombat } from '../combat.ts';
import * as samples from '../samples.ts';

// Usage: pnpm --filter @game/engine balance [--fights N]
const args = process.argv.slice(2);
const at = args.indexOf('--fights');
const fights = at >= 0 ? Number(args[at + 1]) : 1000;

const tally = { victory: 0, defeat: 0, draw: 0 };
let rounds = 0;
let survivors = 0;
let logBytes = 0;
const started = performance.now();

for (let seed = 1; seed <= fights; seed++) {
  const r = runCombat(samples.input(seed));
  tally[r.outcome]++;
  rounds += r.rounds;
  survivors += r.units.filter((u) => u.team === 'party' && u.alive).length;
  logBytes += JSON.stringify(r.events).length;
}

const ms = performance.now() - started;
const pct = (n: number) => `${((n / fights) * 100).toFixed(1)}%`;
console.log(`${fights} fights in ${ms.toFixed(0)} ms (${(ms / fights).toFixed(2)} ms/fight)`);
console.log(`Victory ${pct(tally.victory)}  Defeat ${pct(tally.defeat)}  Draw ${pct(tally.draw)}`);
console.log(
  `Avg rounds ${(rounds / fights).toFixed(1)}  Avg party survivors ${(survivors / fights).toFixed(2)}/4`,
);
console.log(`Avg raw JSON log ${(logBytes / fights / 1024).toFixed(1)} KB`);
