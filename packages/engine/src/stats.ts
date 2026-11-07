import type { StatName, UnitState } from './types.ts';

export { derive } from './scaling.ts';

/** Sum of the active status modifiers for a stat. */
function modSum(u: UnitState, stat: StatName): number {
  let v = 0;
  for (const s of u.statuses) {
    if (s.def.kind === 'mod' && s.def.stat === stat) v += s.def.amount;
  }
  return v;
}

/** Speed and move with their modifiers applied (flat). */
export function effectiveStat(u: UnitState, stat: 'speed' | 'move'): number {
  const v = u.base[stat] + modSum(u, stat);
  return stat === 'move' ? Math.max(0, Math.round(v)) : Math.max(1, v);
}

/** Multiplier from percentage modifiers (damage, accuracy, evasion): +25 gives 1.25. */
export function pctMult(u: UnitState, stat: 'damage' | 'accuracy' | 'evasion'): number {
  return Math.max(0.1, 1 + modSum(u, stat) / 100);
}

export function hasStatus(u: UnitState, id: string): boolean {
  return u.statuses.some((s) => s.def.id === id);
}

export const isStunned = (u: UnitState): boolean => u.statuses.some((s) => s.def.kind === 'stun');
