import type { Attributes, Derived, StatName, UnitState } from './types.ts';

/**
 * Attributes -> derived stats. These formulas are placeholders to be tuned with the balance
 * simulator (see PLAN.md, "Systems to detail later").
 */
export function derive(a: Attributes, level: number, move: number): Derived {
  return {
    maxHp: 30 + a.vit * 8 + level * 5,
    maxMana: 10 + a.wis * 5 + a.int * 2,
    atk: a.str * 2 + a.dex * 0.5 + level,
    magic: a.int * 2.5 + level,
    def: a.vit + a.str * 0.5,
    res: a.wis + a.int * 0.5,
    speed: 10 + a.dex,
    move,
    crit: 5 + a.dex * 0.3,
    dodge: a.dex * 0.4,
    manaRegen: 1 + Math.round(a.wis * 0.3),
  };
}

export function effectiveStat(u: UnitState, stat: StatName): number {
  let v = u.base[stat];
  for (const s of u.statuses) {
    if (s.def.kind === 'mod' && s.def.stat === stat) v += s.def.amount;
  }
  return stat === 'move' ? Math.max(0, Math.round(v)) : Math.max(1, v);
}

export function hasStatus(u: UnitState, id: string): boolean {
  return u.statuses.some((s) => s.def.id === id);
}
