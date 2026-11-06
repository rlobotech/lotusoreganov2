import { formatLog } from '../format.ts';
import { runCombat } from '../combat.ts';
import * as samples from '../samples.ts';

// Usage: pnpm --filter @game/engine simulate [--seed N] [--json]
const args = process.argv.slice(2);
const flag = (name: string) => args.indexOf(`--${name}`);
const seedAt = flag('seed');
const seed = seedAt >= 0 ? Number(args[seedAt + 1]) : 1;

const result = runCombat(samples.input(seed));

if (flag('json') >= 0) {
  console.log(JSON.stringify(result.events));
} else {
  console.log(formatLog(result.events).join('\n'));
  console.log(
    `\nEvents: ${result.events.length}, JSON size: ${JSON.stringify(result.events).length} bytes`,
  );
}
