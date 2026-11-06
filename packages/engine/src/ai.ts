import { hasLineOfSight, manhattan, pathTo, reach, type Grid, type Reach } from './grid.ts';
import { effectiveStat, hasStatus } from './stats.ts';
import type { AIRule, Point, SkillDef, UnitState } from './types.ts';

/**
 * What a unit does this turn.
 * - act: walk `path` (may be empty), then use `skill` on `target`.
 * - approach: walk `path` toward `target` but cannot use the skill yet (out of reach this turn).
 * - wait: nothing possible.
 */
export type Plan =
  | { kind: 'act'; skill: SkillDef; target: UnitState; path: Point[] }
  | { kind: 'approach'; target: UnitState; path: Point[] }
  | { kind: 'wait' };

const hpPct = (u: UnitState) => (u.hp / u.base.maxHp) * 100;
const manaPct = (u: UnitState) => (u.base.maxMana > 0 ? (u.mana / u.base.maxMana) * 100 : 0);

function whenOk(unit: UnitState, when: AIRule['when']): boolean {
  if (!when) return true;
  if (when.selfHpBelowPct !== undefined && !(hpPct(unit) < when.selfHpBelowPct)) return false;
  if (when.selfManaAbovePct !== undefined && !(manaPct(unit) > when.selfManaAbovePct)) return false;
  if (when.selfManaBelowPct !== undefined && !(manaPct(unit) < when.selfManaBelowPct)) return false;
  return true;
}

function candidates(
  units: UnitState[],
  unit: UnitState,
  skill: SkillDef,
  rule: AIRule,
): UnitState[] {
  let pool = units.filter((u) => {
    if (!u.alive) return false;
    if (skill.side === 'self') return u === unit;
    return skill.side === 'ally' ? u.team === unit.team : u.team !== unit.team;
  });

  // Sensible implicit filters so units do not waste turns.
  if (skill.kind === 'heal') pool = pool.filter((u) => u.hp < u.base.maxHp);
  if (skill.kind === 'status' && skill.status) {
    const id = skill.status.id;
    pool = pool.filter((u) => !hasStatus(u, id));
  }

  const f = rule.filter;
  if (f) {
    pool = pool.filter((u) => {
      if (f.hpBelowPct !== undefined && !(hpPct(u) < f.hpBelowPct)) return false;
      if (f.hpAbovePct !== undefined && !(hpPct(u) > f.hpAbovePct)) return false;
      if (f.lacksStatus !== undefined && hasStatus(u, f.lacksStatus)) return false;
      if (f.hasStatus !== undefined && !hasStatus(u, f.hasStatus)) return false;
      return true;
    });
  }

  const key = (u: UnitState): number => {
    switch (rule.order ?? 'nearest') {
      case 'nearest':
        return manhattan(unit, u);
      case 'lowest_hp':
        return u.hp;
      case 'highest_hp':
        return -u.hp;
      case 'lowest_hp_pct':
        return hpPct(u);
    }
  };
  return pool.sort((a, b) => {
    const d = key(a) - key(b);
    if (d !== 0) return d;
    const dist = manhattan(unit, a) - manhattan(unit, b);
    if (dist !== 0) return dist;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function planTurn(
  grid: Grid,
  units: UnitState[],
  skills: Record<string, SkillDef>,
  unit: UnitState,
): Plan {
  const occupied = new Set<number>();
  for (const u of units) {
    if (u.alive && u !== unit) occupied.add(u.y * grid.width + u.x);
  }
  let cached: Reach | undefined;
  const getReach = (): Reach => (cached ??= reach(grid, unit, occupied));
  const move = effectiveStat(unit, 'move');

  const usable = (s: SkillDef) => unit.mana >= s.manaCost && (unit.cooldowns[s.id] ?? 0) === 0;

  function canHitFrom(tile: Point, target: UnitState, skill: SkillDef): boolean {
    if (manhattan(tile, target) > skill.range) return false;
    return skill.range <= 1 || hasLineOfSight(grid, tile, target);
  }

  function reachPlan(skill: SkillDef, target: UnitState): Plan | null {
    if (skill.side === 'self') return { kind: 'act', skill, target: unit, path: [] };
    const r = getReach();
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < r.dist.length; i++) {
      const d = r.dist[i]!;
      if (d < 0 || d >= bestDist) continue;
      const tile = { x: i % grid.width, y: Math.floor(i / grid.width) };
      if (canHitFrom(tile, target, skill)) {
        best = i;
        bestDist = d;
      }
    }
    if (best < 0) return null;
    const path = pathTo(grid, r, best);
    if (bestDist <= move) return { kind: 'act', skill, target, path };
    if (move <= 0) return null;
    return { kind: 'approach', target, path: path.slice(0, move) };
  }

  function tryRule(skill: SkillDef, rule: AIRule): Plan | null {
    for (const target of candidates(units, unit, skill, rule)) {
      const plan = reachPlan(skill, target);
      if (plan) return plan;
    }
    return null;
  }

  for (const rule of unit.def.ai) {
    const skill = skills[rule.skill];
    if (!skill || !unit.def.skills.includes(skill.id) || !usable(skill)) continue;
    if (!whenOk(unit, rule.when)) continue;
    const plan = tryRule(skill, rule);
    if (plan) return plan;
  }

  // Fallback: a free basic attack on the nearest enemy.
  for (const id of unit.def.skills) {
    const skill = skills[id];
    if (skill && skill.kind === 'damage' && skill.manaCost === 0 && skill.cooldown === 0) {
      const plan = tryRule(skill, { skill: id });
      if (plan) return plan;
      break;
    }
  }
  return { kind: 'wait' };
}
