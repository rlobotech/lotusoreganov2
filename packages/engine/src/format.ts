import type { CombatEvent } from './types.ts';

/** Human-readable log, used by the CLI and handy when debugging replays. */
export function formatLog(events: CombatEvent[]): string[] {
  const names = new Map<string, string>();
  const lines: string[] = [];
  const name = (id: string) => names.get(id) ?? id;

  for (const e of events) {
    switch (e.t) {
      case 'start':
        for (const u of e.units) names.set(u.id, u.name);
        lines.push(
          `Fight start (seed ${e.seed}, arena ${e.arena.id} ${e.arena.width}x${e.arena.height}, ` +
            `format v${e.formatVersion}, engine ${e.engineVersion})`,
        );
        for (const u of e.units) {
          lines.push(
            `  ${u.team === 'party' ? 'P' : 'E'} ${u.name} L${u.level} HP ${u.maxHp} MP ${u.maxMana} at ${u.x},${u.y}`,
          );
        }
        break;
      case 'round':
        lines.push(`-- Round ${e.n}: ${e.order.map(name).join(', ')}`);
        break;
      case 'turn':
        break;
      case 'move': {
        const end = e.path[e.path.length - 1]!;
        lines.push(
          `${name(e.unit)} ${e.retreat ? 'steps back' : 'moves'} ${e.path.length} to ${end.x},${end.y}`,
        );
        break;
      }
      case 'skill':
        lines.push(
          `${name(e.unit)} ${e.reaction ? 'strikes as a reaction with' : 'uses'} ${e.skill} on ${name(e.target)}`,
        );
        break;
      case 'miss':
        lines.push(`  ${name(e.target)} dodges ${e.skill} (${e.chance}% to hit)`);
        break;
      case 'damage':
        lines.push(
          `  ${name(e.target)} takes ${e.amount} ${e.type}${e.crit ? ' (crit)' : ''}` +
            `${e.resist ? ` (${e.resist}% resisted)` : ''} from ${e.skill}${e.extra ? ' (extra)' : ''} -> HP ${e.hp}`,
        );
        break;
      case 'heal':
        lines.push(`  ${name(e.target)} heals ${e.amount} from ${e.skill} -> HP ${e.hp}`);
        break;
      case 'status':
        lines.push(`  ${name(e.unit)} ${e.on ? 'gains' : 'loses'} ${e.status}`);
        break;
      case 'skip':
        lines.push(`${name(e.unit)} ${e.reason === 'stun' ? 'is stunned' : 'waits'}`);
        break;
      case 'death':
        lines.push(`  ${name(e.unit)} is defeated`);
        break;
      case 'end':
        lines.push(`Result: ${e.outcome} after ${e.rounds} rounds`);
        break;
    }
  }
  return lines;
}
