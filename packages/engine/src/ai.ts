import {
  adjacent,
  distance,
  hasLineOfSight,
  pathTo,
  reach,
  type Grid,
  type Reach,
} from './grid.ts';
import { manaCostMult } from './scaling.ts';
import { hasStatus, isStunned } from './stats.ts';
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

/** Mana a skill costs this unit (costs grow with level, like mana). */
export const skillCost = (unit: UnitState, skill: SkillDef): number =>
  Math.round(skill.manaCost * manaCostMult(unit.def.level));

/** The melee weapon attack a unit uses for opportunity attacks, if it has one. */
export function opportunitySkill(
  unit: UnitState,
  skills: Record<string, SkillDef>,
): SkillDef | null {
  for (const id of unit.def.skills) {
    const s = skills[id];
    if (
      s &&
      s.kind === 'damage' &&
      s.source === 'weapon' &&
      s.range === 1 &&
      s.side === 'enemy' &&
      !s.radius &&
      s.manaCost === 0 &&
      s.cooldown === 0
    ) {
      return s;
    }
  }
  return null;
}

/** Enemies that get an opportunity attack when `mover` steps from `from` to `to`. */
export function provokers(
  units: readonly UnitState[],
  skills: Record<string, SkillDef>,
  mover: UnitState,
  from: Point,
  to: Point,
): UnitState[] {
  return units.filter(
    (e) =>
      e.alive &&
      e.team !== mover.team &&
      e.reaction &&
      !isStunned(e) &&
      adjacent(e, from) &&
      !adjacent(e, to) &&
      opportunitySkill(e, skills) !== null,
  );
}

function whenOk(units: readonly UnitState[], unit: UnitState, when: AIRule['when']): boolean {
  if (!when) return true;
  if (when.selfHpBelowPct !== undefined && !(hpPct(unit) < when.selfHpBelowPct)) return false;
  if (when.selfManaAbovePct !== undefined && !(manaPct(unit) > when.selfManaAbovePct)) return false;
  if (when.selfManaBelowPct !== undefined && !(manaPct(unit) < when.selfManaBelowPct)) return false;
  if (when.enemyAdjacent !== undefined) {
    const next = units.some((u) => u.alive && u.team !== unit.team && adjacent(u, unit));
    if (next !== when.enemyAdjacent) return false;
  }
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
        return distance(unit, u);
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
    const dist = distance(unit, a) - distance(unit, b);
    if (dist !== 0) return dist;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// How much a tile's safety and the opportunity attacks on the way matter when a ranged unit picks
// where to stand. Moving away from an adjacent enemy is worth it when the gain in distance beats
// the cost of the free hits it provokes.
const SAFETY_WEIGHT = 2;
const SAFETY_CAP = 4;
const THREAT_WEIGHT = 3;
const MOVE_WEIGHT = 0.05;

function nearestEnemy(units: readonly UnitState[], unit: UnitState, tile: Point): number {
  let best = Infinity;
  for (const u of units) {
    if (u.alive && u.team !== unit.team) best = Math.min(best, distance(u, tile));
  }
  return best;
}

export function planTurn(
  grid: Grid,
  units: UnitState[],
  skills: Record<string, SkillDef>,
  unit: UnitState,
): Plan {
  const occupied = occupiedTiles(grid, units, unit);
  let cached: Reach | undefined;
  const getReach = (): Reach => (cached ??= reach(grid, unit, occupied));
  const move = unit.movesLeft;

  const usable = (s: SkillDef) =>
    unit.mana >= skillCost(unit, s) && (unit.cooldowns[s.id] ?? 0) === 0;

  function canHitFrom(tile: Point, target: UnitState, skill: SkillDef): boolean {
    if (distance(tile, target) > skill.range) return false;
    return skill.range <= 1 || hasLineOfSight(grid, tile, target);
  }

  /** Opportunity attacks the walk along `path` would provoke. */
  function threatsOn(path: Point[]): number {
    let from: Point = unit;
    let n = 0;
    for (const p of path) {
      n += provokers(units, skills, unit, from, p).length;
      from = p;
    }
    return n;
  }

  function reachPlan(skill: SkillDef, target: UnitState): Plan | null {
    if (skill.side === 'self') return { kind: 'act', skill, target: unit, path: [] };
    // A retreat skill gets clear for free afterwards, so it fires from where the unit stands.
    if (skill.retreat && canHitFrom(unit, target, skill)) {
      return { kind: 'act', skill, target, path: [] };
    }
    const r = getReach();
    const ranged = skill.range > 1;
    let best = -1;
    let bestScore = -Infinity;
    let nearest = -1;
    let nearestDist = Infinity;
    for (let i = 0; i < r.dist.length; i++) {
      const d = r.dist[i]!;
      if (d < 0) continue;
      const tile = { x: i % grid.width, y: Math.floor(i / grid.width) };
      if (!canHitFrom(tile, target, skill)) continue;
      if (d < nearestDist) {
        nearest = i;
        nearestDist = d;
      }
      if (d > move) continue;
      const path = d === 0 ? [] : pathTo(grid, r, i);
      const threats = threatsOn(path);
      const score = ranged
        ? Math.min(nearestEnemy(units, unit, tile), SAFETY_CAP) * SAFETY_WEIGHT -
          threats * THREAT_WEIGHT -
          d * MOVE_WEIGHT
        : -d - threats * THREAT_WEIGHT;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best >= 0)
      return {
        kind: 'act',
        skill,
        target,
        path: best === tileOf(unit) ? [] : pathTo(grid, r, best),
      };
    if (nearest < 0 || move <= 0) return null;
    return { kind: 'approach', target, path: pathTo(grid, r, nearest).slice(0, move) };
  }

  const tileOf = (p: Point) => p.y * grid.width + p.x;

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
    if (!whenOk(units, unit, rule.when)) continue;
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

function occupiedTiles(grid: Grid, units: readonly UnitState[], except: UnitState): Set<number> {
  const occupied = new Set<number>();
  for (const u of units) {
    if (u.alive && u !== except) occupied.add(u.y * grid.width + u.x);
  }
  return occupied;
}

/**
 * After a ranged attack, a unit with an enemy next to it and movement left steps away if that
 * gets it clear by more than the opportunity attacks cost. Returns the path, or null to stay.
 */
export function planKite(
  grid: Grid,
  units: UnitState[],
  skills: Record<string, SkillDef>,
  unit: UnitState,
): Point[] | null {
  if (unit.movesLeft < 1) return null;
  if (!units.some((u) => u.alive && u.team !== unit.team && adjacent(u, unit))) return null;
  const r = reach(grid, unit, occupiedTiles(grid, units, unit));
  const stayScore = Math.min(nearestEnemy(units, unit, unit), SAFETY_CAP) * SAFETY_WEIGHT;
  let best = -1;
  let bestScore = stayScore;
  for (let i = 0; i < r.dist.length; i++) {
    const d = r.dist[i]!;
    if (d < 1 || d > unit.movesLeft) continue;
    const path = pathTo(grid, r, i);
    let from: Point = unit;
    let threats = 0;
    for (const p of path) {
      threats += provokers(units, skills, unit, from, p).length;
      from = p;
    }
    const tile = { x: i % grid.width, y: Math.floor(i / grid.width) };
    const score =
      Math.min(nearestEnemy(units, unit, tile), SAFETY_CAP) * SAFETY_WEIGHT -
      threats * THREAT_WEIGHT -
      d * MOVE_WEIGHT;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best < 0 ? null : pathTo(grid, r, best);
}

/** The tile (within `steps`) farthest from every enemy, for skills that retreat. Never provokes. */
export function planRetreat(
  grid: Grid,
  units: UnitState[],
  unit: UnitState,
  steps: number,
): Point[] | null {
  const r = reach(grid, unit, occupiedTiles(grid, units, unit));
  let best = -1;
  let bestDist = nearestEnemy(units, unit, unit);
  let bestCost = 0;
  for (let i = 0; i < r.dist.length; i++) {
    const d = r.dist[i]!;
    if (d < 1 || d > steps) continue;
    const tile = { x: i % grid.width, y: Math.floor(i / grid.width) };
    const away = nearestEnemy(units, unit, tile);
    if (away > bestDist || (away === bestDist && best >= 0 && d < bestCost)) {
      best = i;
      bestDist = away;
      bestCost = d;
    }
  }
  return best < 0 ? null : pathTo(grid, r, best);
}
