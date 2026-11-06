import { planTurn } from './ai.ts';
import { makeGrid, manhattan, tileIndex } from './grid.ts';
import { createRng, type Rng } from './rng.ts';
import { derive, effectiveStat } from './stats.ts';
import {
  ENGINE_VERSION,
  LOG_FORMAT_VERSION,
  MAX_ROUNDS,
  type CombatEvent,
  type CombatInput,
  type CombatResult,
  type Outcome,
  type SkillDef,
  type StatusDef,
  type UnitState,
} from './types.ts';

function spawnUnits(input: CombatInput): UnitState[] {
  const { arena } = input;
  const taken = new Set<number>();
  const used = { party: 0, enemy: 0 };
  const ids = new Set<string>();
  const grid = makeGrid(arena);

  return input.units.map((def) => {
    if (ids.has(def.id)) throw new Error(`Duplicate unit id: ${def.id}`);
    ids.add(def.id);
    const spot = arena.spawns[def.team][used[def.team]++];
    if (!spot) throw new Error(`Arena ${arena.id} has no free ${def.team} spawn for ${def.id}`);
    const i = tileIndex(grid, spot.x, spot.y);
    if (grid.blocked[i] || taken.has(i)) throw new Error(`Bad spawn tile ${spot.x},${spot.y}`);
    taken.add(i);
    const base = derive(def.attributes, def.level, def.move);
    return {
      def,
      id: def.id,
      team: def.team,
      x: spot.x,
      y: spot.y,
      // Fights can start from partial health/mana (the party carries damage between fights).
      hp: Math.min(base.maxHp, Math.max(1, Math.round(def.hp ?? base.maxHp))),
      mana: Math.min(base.maxMana, Math.max(0, Math.round(def.mana ?? base.maxMana))),
      alive: true,
      base,
      cooldowns: {},
      statuses: [],
    };
  });
}

/**
 * Runs one complete fight and returns the event log. Pure and deterministic:
 * the same input (including seed) always produces the same result.
 */
export function runCombat(input: CombatInput): CombatResult {
  const rng: Rng = createRng(input.seed);
  const grid = makeGrid(input.arena);
  const units = spawnUnits(input);
  const events: CombatEvent[] = [];

  events.push({
    t: 'start',
    formatVersion: LOG_FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    seed: input.seed,
    arena: {
      id: input.arena.id,
      width: input.arena.width,
      height: input.arena.height,
      blocked: input.arena.blocked.map((p) => ({ x: p.x, y: p.y })),
    },
    units: units.map((u) => ({
      id: u.id,
      name: u.def.name,
      team: u.team,
      level: u.def.level,
      sprite: u.def.sprite ?? null,
      x: u.x,
      y: u.y,
      hp: u.hp,
      maxHp: u.base.maxHp,
      mana: u.mana,
      maxMana: u.base.maxMana,
    })),
  });

  const alive = (team: 'party' | 'enemy') => units.some((u) => u.alive && u.team === team);

  function currentOutcome(): Outcome | null {
    if (!alive('party')) return 'defeat';
    if (!alive('enemy')) return 'victory';
    return null;
  }

  function kill(u: UnitState) {
    u.alive = false;
    events.push({ t: 'death', unit: u.id });
  }

  function applyStatus(target: UnitState, caster: UnitState, def: StatusDef) {
    if (!target.alive) return;
    const amount =
      def.kind === 'dot' || def.kind === 'hot'
        ? Math.max(1, Math.round((def.power / 10) * effectiveStat(caster, 'magic')))
        : 0;
    const existing = target.statuses.find((s) => s.def.id === def.id);
    if (existing) {
      existing.remaining = def.duration;
      existing.amount = amount;
    } else {
      target.statuses.push({ def, remaining: def.duration, amount, source: caster.id });
      events.push({ t: 'status', unit: target.id, status: def.id, on: true });
    }
  }

  function targetsOf(caster: UnitState, skill: SkillDef, primary: UnitState): UnitState[] {
    if (!skill.radius) return [primary];
    return units.filter((u) => {
      if (!u.alive) return false;
      const sideOk =
        skill.side === 'ally'
          ? u.team === caster.team
          : skill.side === 'enemy'
            ? u.team !== caster.team
            : u === caster;
      return sideOk && manhattan(u, primary) <= skill.radius!;
    });
  }

  function useSkill(caster: UnitState, skill: SkillDef, primary: UnitState) {
    caster.mana -= skill.manaCost;
    if (skill.cooldown > 0) caster.cooldowns[skill.id] = skill.cooldown;
    events.push({
      t: 'skill',
      unit: caster.id,
      skill: skill.id,
      target: primary.id,
      x: primary.x,
      y: primary.y,
      vfx: skill.vfx ?? null,
    });

    const physical = skill.damageType === 'physical';
    for (const target of targetsOf(caster, skill, primary)) {
      if (skill.kind === 'damage') {
        if (physical) {
          const hit = Math.min(95, Math.max(50, 95 - target.base.dodge));
          if (!rng.chance(hit)) {
            events.push({ t: 'miss', target: target.id, skill: skill.id });
            continue;
          }
        }
        const offense = effectiveStat(caster, physical ? 'atk' : 'magic');
        const defense = effectiveStat(target, physical ? 'def' : 'res');
        const variance = 0.9 + rng.next() * 0.2;
        const crit = rng.chance(caster.base.crit);
        const raw = (skill.power / 10) * offense * variance * (crit ? 1.5 : 1);
        const amount = Math.max(1, Math.round((raw * 100) / (100 + defense * 2)));
        target.hp = Math.max(0, target.hp - amount);
        events.push({
          t: 'damage',
          target: target.id,
          source: caster.id,
          skill: skill.id,
          amount,
          crit,
          hp: target.hp,
        });
        if (target.hp === 0) kill(target);
      } else if (skill.kind === 'heal') {
        const variance = 0.9 + rng.next() * 0.2;
        const wanted = Math.max(
          1,
          Math.round((skill.power / 10) * effectiveStat(caster, 'magic') * variance),
        );
        const amount = Math.min(wanted, target.base.maxHp - target.hp);
        target.hp += amount;
        events.push({
          t: 'heal',
          target: target.id,
          source: caster.id,
          skill: skill.id,
          amount,
          hp: target.hp,
        });
      }
      if (skill.status && target.alive && rng.chance(skill.statusChance ?? 100)) {
        applyStatus(target, caster, skill.status);
      }
    }
  }

  function takeTurn(unit: UnitState) {
    events.push({ t: 'turn', unit: unit.id });
    // Stun is counted in skipped turns (not rounds), so a stun applied after the target
    // already acted this round still costs it its next turn.
    const stun = unit.statuses.find((s) => s.def.kind === 'stun');
    if (stun) {
      events.push({ t: 'skip', unit: unit.id, reason: 'stun' });
      stun.remaining -= 1;
      if (stun.remaining <= 0) {
        unit.statuses.splice(unit.statuses.indexOf(stun), 1);
        events.push({ t: 'status', unit: unit.id, status: stun.def.id, on: false });
      }
      return;
    }
    const plan = planTurn(grid, units, input.skills, unit);
    if (plan.kind === 'wait') {
      events.push({ t: 'skip', unit: unit.id, reason: 'wait' });
      return;
    }
    if (plan.path.length > 0) {
      const end = plan.path[plan.path.length - 1]!;
      unit.x = end.x;
      unit.y = end.y;
      events.push({ t: 'move', unit: unit.id, path: plan.path.map((p) => ({ x: p.x, y: p.y })) });
    }
    if (plan.kind === 'act') useSkill(unit, plan.skill, plan.target);
  }

  function endOfRound() {
    for (const u of units) {
      if (!u.alive) continue;
      for (const s of [...u.statuses]) {
        if (s.def.kind === 'dot') {
          u.hp = Math.max(0, u.hp - s.amount);
          events.push({
            t: 'damage',
            target: u.id,
            source: s.def.id,
            skill: s.def.id,
            amount: s.amount,
            crit: false,
            hp: u.hp,
          });
          if (u.hp === 0) {
            kill(u);
            break;
          }
        } else if (s.def.kind === 'hot') {
          const amount = Math.min(s.amount, u.base.maxHp - u.hp);
          u.hp += amount;
          events.push({
            t: 'heal',
            target: u.id,
            source: s.def.id,
            skill: s.def.id,
            amount,
            hp: u.hp,
          });
        }
      }
      if (!u.alive) continue;
      for (const s of [...u.statuses]) {
        if (s.def.kind === 'stun') continue;
        s.remaining -= 1;
        if (s.remaining <= 0) {
          u.statuses.splice(u.statuses.indexOf(s), 1);
          events.push({ t: 'status', unit: u.id, status: s.def.id, on: false });
        }
      }
      for (const id of Object.keys(u.cooldowns)) {
        const left = (u.cooldowns[id] ?? 0) - 1;
        if (left <= 0) delete u.cooldowns[id];
        else u.cooldowns[id] = left;
      }
      u.mana = Math.min(u.base.maxMana, u.mana + u.base.manaRegen);
    }
  }

  let outcome: Outcome | null = null;
  let round = 0;
  while (outcome === null && round < MAX_ROUNDS) {
    round += 1;
    const order = units
      .filter((u) => u.alive)
      .map((u) => ({ u, speed: effectiveStat(u, 'speed'), tie: rng.next() }))
      .sort((a, b) => b.speed - a.speed || a.tie - b.tie)
      .map((e) => e.u);
    events.push({ t: 'round', n: round, order: order.map((u) => u.id) });

    for (const unit of order) {
      if (!unit.alive) continue;
      takeTurn(unit);
      outcome = currentOutcome();
      if (outcome) break;
    }
    if (outcome) break;
    endOfRound();
    outcome = currentOutcome();
  }
  outcome ??= 'draw';

  events.push({ t: 'end', outcome, rounds: round });
  return {
    outcome,
    rounds: round,
    events,
    units: units.map((u) => ({ id: u.id, team: u.team, hp: u.hp, mana: u.mana, alive: u.alive })),
  };
}
