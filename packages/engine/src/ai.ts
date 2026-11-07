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
import {
  WEAPON_ATTACK,
  type AIRule,
  type MoveMode,
  type Point,
  type SkillDef,
  type UnitState,
} from './types.ts';

/**
 * What a unit does this turn.
 * - act: walk `path` (may be empty), then use `skill` on `target`.
 * - approach: walk `path` toward `target` but cannot use the skill yet (out of reach this turn).
 * - wait: nothing possible.
 */
export type Plan =
  | { kind: 'act'; skill: SkillDef; target: UnitState; path: Point[]; rule?: AIRule }
  | { kind: 'approach'; target: UnitState; path: Point[] }
  | { kind: 'wait' };

const hpPct = (u: UnitState) => (u.hp / u.base.maxHp) * 100;
const manaPct = (u: UnitState) => (u.base.maxMana > 0 ? (u.mana / u.base.maxMana) * 100 : 0);

/** Mana a skill costs this unit (costs grow with level, like mana). */
export const skillCost = (unit: UnitState, skill: SkillDef): number =>
  Math.round(skill.manaCost * manaCostMult(unit.def.level));

/** How many summons of the skill's kind the unit may have out at once (default one). */
export const summonLimit = (unit: UnitState, skill: SkillDef): number =>
  skill.summon ? (unit.def.summonLimits?.[skill.summon.group] ?? 1) : 0;

/** The free tile beside `unit` that is closest to the enemy, where a summon appears (or null). */
export function summonTile(grid: Grid, units: readonly UnitState[], unit: UnitState): Point | null {
  const taken = occupiedTiles(grid, units, unit);
  taken.add(unit.y * grid.width + unit.x);
  let best: Point | null = null;
  let bestScore = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = unit.x + dx;
      const y = unit.y + dy;
      if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) continue;
      const i = y * grid.width + x;
      if (grid.blocked[i] || taken.has(i)) continue;
      const score = nearestEnemy(units, unit, { x, y }) * 100 + i;
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

/** Can the unit call up another summon with this skill: below its limit, and room beside it? */
export function canSummon(
  grid: Grid,
  units: readonly UnitState[],
  unit: UnitState,
  skill: SkillDef,
): boolean {
  if (!skill.summon) return true;
  const out = units.filter(
    (u) => u.alive && u.owner === unit.id && u.group === skill.summon!.group,
  ).length;
  return out < summonLimit(unit, skill) && summonTile(grid, units, unit) !== null;
}

/** Does the unit hold the weapon the skill asks for (if it asks for one)? */
export function holdsWeaponFor(unit: UnitState, skill: SkillDef): boolean {
  if (!skill.weapons) return true;
  const kind = unit.def.weaponKind;
  return !!kind && skill.weapons.includes(kind);
}

/** The unit's basic weapon attack: its first free damage skill that uses the weapon. */
export function basicAttack(unit: UnitState, skills: Record<string, SkillDef>): SkillDef | null {
  for (const id of unit.def.skills) {
    const s = skills[id];
    if (
      s &&
      s.kind === 'damage' &&
      s.source === 'weapon' &&
      s.manaCost === 0 &&
      s.cooldown === 0 &&
      holdsWeaponFor(unit, s)
    ) {
      return s;
    }
  }
  return null;
}

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
      s.cooldown === 0 &&
      holdsWeaponFor(unit, s)
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
  if (when.selfHpAbovePct !== undefined && !(hpPct(unit) > when.selfHpAbovePct)) return false;
  if (when.selfHasStatus !== undefined && !hasStatus(unit, when.selfHasStatus)) return false;
  if (when.selfLacksStatus !== undefined && hasStatus(unit, when.selfLacksStatus)) return false;
  if (when.enemiesAtLeast !== undefined) {
    const n = units.filter((u) => u.alive && u.team !== unit.team).length;
    if (n < when.enemiesAtLeast) return false;
  }
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
      if (f.fullHealth && u.hp < u.base.maxHp) return false;
      if (f.lacksStatus !== undefined && hasStatus(u, f.lacksStatus)) return false;
      if (f.hasStatus !== undefined && !hasStatus(u, f.hasStatus)) return false;
      return true;
    });
  }

  const key = (u: UnitState): number => {
    switch (rule.order ?? 'nearest') {
      case 'nearest':
        return distance(unit, u);
      case 'farthest':
        return -distance(unit, u);
      case 'crowded':
        // The unit with the most of its own side within two tiles (best for area spells).
        return -units.filter((o) => o.alive && o.team === u.team && distance(o, u) <= 2).length;
      case 'strongest':
        return -u.def.attributes.str;
      case 'least_armor':
        return Object.values(u.resist).reduce((sum, v) => sum + v, 0);
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
    unit.mana >= skillCost(unit, s) &&
    (unit.cooldowns[s.id] ?? 0) === 0 &&
    holdsWeaponFor(unit, s) &&
    canSummon(grid, units, unit, s);

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

  function reachPlan(skill: SkillDef, target: UnitState, rule: AIRule): Plan | null {
    if (skill.side === 'self') return { kind: 'act', skill, target: unit, path: [], rule };
    const before = rule.move?.when === 'before' ? rule.move.mode : undefined;
    // 'stay': the rule only applies from where the unit already stands.
    if (before === 'stay') {
      return canHitFrom(unit, target, skill)
        ? { kind: 'act', skill, target, path: [], rule }
        : null;
    }
    // A retreat skill gets clear for free afterwards, so it fires from where the unit stands.
    if (skill.retreat && canHitFrom(unit, target, skill)) {
      return { kind: 'act', skill, target, path: [], rule };
    }
    const r = getReach();
    const ranged = before ? before !== 'toward' : skill.range > 1;
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
        rule,
      };
    if (nearest < 0 || move <= 0) return null;
    return { kind: 'approach', target, path: pathTo(grid, r, nearest).slice(0, move) };
  }

  const tileOf = (p: Point) => p.y * grid.width + p.x;

  function tryRule(skill: SkillDef, rule: AIRule): Plan | null {
    for (const target of candidates(units, unit, skill, rule)) {
      const plan = reachPlan(skill, target, rule);
      if (plan) return plan;
    }
    return null;
  }

  for (const rule of unit.def.ai) {
    const skill = rule.skill === WEAPON_ATTACK ? basicAttack(unit, skills) : skills[rule.skill];
    if (!skill || !unit.def.skills.includes(skill.id) || !usable(skill)) continue;
    if (!whenOk(units, unit, rule.when)) continue;
    const plan = tryRule(skill, rule);
    if (plan) return plan;
  }

  // Fallback: a free basic attack on the nearest enemy.
  const fallback = basicAttack(unit, skills);
  if (fallback) {
    const plan = tryRule(fallback, { skill: fallback.id });
    if (plan) return plan;
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

/**
 * The walk a rule's `after` move asks for once its skill is done, or null to stay put.
 * toward: closer to the target. away: clear of enemies, weighing opportunity attacks.
 * range: like away, but the target must stay within the skill's reach.
 */
export function planAfterMove(
  grid: Grid,
  units: UnitState[],
  skills: Record<string, SkillDef>,
  unit: UnitState,
  mode: MoveMode,
  skill: SkillDef,
  target: UnitState,
): Point[] | null {
  if (mode === 'stay' || unit.movesLeft < 1) return null;
  const r = reach(grid, unit, occupiedTiles(grid, units, unit));
  const inReach = (tile: Point) =>
    distance(tile, target) <= skill.range &&
    (skill.range <= 1 || hasLineOfSight(grid, tile, target));
  let best = -1;
  let bestScore =
    mode === 'toward'
      ? -distance(unit, target)
      : Math.min(nearestEnemy(units, unit, unit), SAFETY_CAP) * SAFETY_WEIGHT;
  for (let i = 0; i < r.dist.length; i++) {
    const d = r.dist[i]!;
    if (d < 1 || d > unit.movesLeft) continue;
    const tile = { x: i % grid.width, y: Math.floor(i / grid.width) };
    if (mode === 'range' && target.alive && skill.side !== 'self' && !inReach(tile)) continue;
    const path = pathTo(grid, r, i);
    let score: number;
    if (mode === 'toward') {
      score = -distance(tile, target) - d * MOVE_WEIGHT;
    } else {
      let from: Point = unit;
      let threats = 0;
      for (const p of path) {
        threats += provokers(units, skills, unit, from, p).length;
        from = p;
      }
      score =
        Math.min(nearestEnemy(units, unit, tile), SAFETY_CAP) * SAFETY_WEIGHT -
        threats * THREAT_WEIGHT -
        d * MOVE_WEIGHT;
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best < 0 ? null : pathTo(grid, r, best);
}
