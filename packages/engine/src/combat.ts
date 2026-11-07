import {
  opportunitySkill,
  planAfterMove,
  planKite,
  planRetreat,
  planTurn,
  provokers,
  skillCost,
} from './ai.ts';
import { distance, makeGrid, tileIndex } from './grid.ts';
import { createRng, type Rng } from './rng.ts';
import {
  attrMult,
  derive,
  hitChance,
  resistPct,
  SCALING,
  spellBase,
  weaponRange,
} from './scaling.ts';
import { effectiveStat, pctMult } from './stats.ts';
import {
  ENGINE_VERSION,
  LOG_FORMAT_VERSION,
  MAX_ROUNDS,
  type CombatEvent,
  type CombatInput,
  type CombatResult,
  type DamageType,
  type Outcome,
  type Point,
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
      weapon: def.weapon ?? weaponRange(def.level, 'smash'),
      extraDamage: def.extraDamage ?? [],
      resist: def.resist ?? {},
      cooldowns: {},
      statuses: [],
      reaction: true,
      movesLeft: 0,
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
  const skills = input.skills;

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

  /** Share of damage of `type` that the target's resistance takes off. */
  const resistOf = (target: UnitState, type: DamageType): number =>
    resistPct(target.resist[type] ?? 0, target.def.level);

  function applyStatus(target: UnitState, caster: UnitState, def: StatusDef, skill: SkillDef) {
    if (!target.alive) return;
    const amount =
      def.kind === 'dot' || def.kind === 'hot'
        ? Math.max(
            1,
            Math.round(
              (def.power / 10) *
                spellBase(caster.def.level) *
                attrMult(caster.def.attributes[skill.attr]),
            ),
          )
        : 0;
    const duration = def.duration + (caster.def.skillMods?.[skill.id]?.rounds ?? 0);
    const existing = target.statuses.find((s) => s.def.id === def.id);
    if (existing) {
      existing.remaining = duration;
      existing.amount = amount;
    } else {
      target.statuses.push({ def, remaining: duration, amount, source: caster.id });
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
      return sideOk && distance(u, primary) <= skill.radius!;
    });
  }

  const roll = (min: number, max: number) => min + rng.next() * (max - min);

  /** Applies one part of a hit and returns false when the target died of it. */
  function deal(
    target: UnitState,
    caster: UnitState,
    skill: SkillDef,
    raw: number,
    type: DamageType,
    crit: boolean,
    chance: number | undefined,
    extra: boolean,
  ): boolean {
    const resist = resistOf(target, type);
    const amount = Math.max(1, Math.round(raw * (1 - resist)));
    target.hp = Math.max(0, target.hp - amount);
    events.push({
      t: 'damage',
      target: target.id,
      source: caster.id,
      skill: skill.id,
      amount,
      crit,
      hp: target.hp,
      type,
      resist: Math.round(resist * 100),
      ...(chance !== undefined ? { chance: Math.round(chance) } : {}),
      ...(extra ? { extra: true } : {}),
    });
    if (target.hp === 0) {
      kill(target);
      return false;
    }
    return true;
  }

  function useSkill(caster: UnitState, skill: SkillDef, primary: UnitState, reaction = false) {
    if (!reaction) {
      caster.mana -= skillCost(caster, skill);
      if (skill.cooldown > 0) caster.cooldowns[skill.id] = skill.cooldown;
    }
    events.push({
      t: 'skill',
      unit: caster.id,
      skill: skill.id,
      target: primary.id,
      x: primary.x,
      y: primary.y,
      vfx: skill.vfx ?? null,
      ...(reaction ? { reaction: true } : {}),
    });

    const attr = caster.def.attributes[skill.attr];
    // The unit's own skill and school levels make the skill stronger.
    const strength = caster.def.skillMods?.[skill.id]?.power ?? 1;
    for (const target of targetsOf(caster, skill, primary)) {
      if (skill.kind === 'damage') {
        let chance: number | undefined;
        if (skill.source === 'weapon' || skill.dodgeable) {
          chance = hitChance(
            caster.base.accuracy * pctMult(caster, 'accuracy'),
            target.base.evasion * pctMult(target, 'evasion'),
          );
          if (!rng.chance(chance)) {
            events.push({
              t: 'miss',
              target: target.id,
              skill: skill.id,
              chance: Math.round(chance),
            });
            continue;
          }
        }
        const crit = rng.chance(caster.base.crit);
        const critMult = crit ? SCALING.critMultiplier : 1;
        const dmgMult = attrMult(attr) * pctMult(caster, 'damage') * critMult;
        let base: number;
        let type: DamageType;
        if (skill.source === 'weapon') {
          base = roll(caster.weapon.min, caster.weapon.max);
          type = skill.damageType ?? caster.weapon.type;
        } else {
          const s = SCALING.rollSpread;
          base = spellBase(caster.def.level) * roll(1 - s, 1 + s);
          type = skill.damageType ?? 'smash';
        }
        if (
          !deal(
            target,
            caster,
            skill,
            base * (skill.power / 10) * strength * dmgMult,
            type,
            crit,
            chance,
            false,
          )
        ) {
          continue;
        }
        if (skill.source === 'weapon') {
          for (const x of caster.extraDamage) {
            const extra = roll(x.min, x.max) * pctMult(caster, 'damage') * critMult;
            if (!deal(target, caster, skill, extra, x.type, crit, chance, true)) break;
          }
        }
      } else if (skill.kind === 'heal') {
        const s = SCALING.rollSpread;
        const wanted = Math.max(
          1,
          Math.round(
            spellBase(caster.def.level) *
              roll(1 - s, 1 + s) *
              (skill.power / 10) *
              strength *
              attrMult(attr),
          ),
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
        applyStatus(target, caster, skill.status, skill);
      }
    }
  }

  /**
   * Walks the unit along `path`. Stepping out of an enemy's reach gives that enemy an opportunity
   * attack (its once-per-round reaction) unless the move is a disengage. A walk is logged in
   * pieces, split where an attack interrupts it. Returns false if the walker died on the way.
   */
  function walk(
    unit: UnitState,
    path: Point[],
    o: { disengage?: boolean; retreat?: boolean } = {},
  ): boolean {
    let seg: Point[] = [];
    const flush = () => {
      if (seg.length === 0) return;
      events.push({
        t: 'move',
        unit: unit.id,
        path: seg,
        ...(o.retreat ? { retreat: true } : {}),
      });
      seg = [];
    };
    for (const step of path) {
      if (!o.disengage) {
        for (const e of provokers(units, skills, unit, unit, step)) {
          e.reaction = false;
          flush();
          useSkill(e, opportunitySkill(e, skills)!, unit, true);
          if (!unit.alive) return false;
        }
        unit.movesLeft = Math.max(0, unit.movesLeft - 1);
      }
      unit.x = step.x;
      unit.y = step.y;
      seg.push({ x: step.x, y: step.y });
    }
    flush();
    return true;
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
    unit.movesLeft = effectiveStat(unit, 'move');
    // Free skills do not use the action, so a unit can chain a few of them before its real action.
    for (let step = 0; step < 4 && unit.alive; step++) {
      const plan = planTurn(grid, units, skills, unit);
      if (plan.kind === 'wait') {
        if (step === 0) events.push({ t: 'skip', unit: unit.id, reason: 'wait' });
        return;
      }
      if (plan.path.length > 0 && !walk(unit, plan.path)) return;
      if (plan.kind === 'approach') return;
      useSkill(unit, plan.skill, plan.target);
      if (!unit.alive) return;
      if (plan.skill.free) continue;
      // Movement left over is used to get clear of enemies, or a retreat skill does it for free.
      const move = plan.rule?.move;
      if (plan.skill.retreat) {
        const path = planRetreat(grid, units, unit, plan.skill.retreat);
        if (path) walk(unit, path, { disengage: true, retreat: true });
      } else if (move?.when === 'after') {
        const path = planAfterMove(grid, units, skills, unit, move.mode, plan.skill, plan.target);
        if (path) walk(unit, path, { retreat: move.mode !== 'toward' });
      } else if (plan.rule?.move?.mode === 'stay') {
        // The rule asked the unit to hold its ground.
      } else if (plan.skill.range > 1 && plan.skill.side !== 'self') {
        const path = planKite(grid, units, skills, unit);
        if (path) walk(unit, path, { retreat: true });
      }
      return;
    }
  }

  function endOfRound() {
    for (const u of units) {
      if (!u.alive) continue;
      for (const s of [...u.statuses]) {
        if (s.def.kind === 'dot') {
          const resist = resistOf(u, s.def.damageType);
          const amount = Math.max(1, Math.round(s.amount * (1 - resist)));
          u.hp = Math.max(0, u.hp - amount);
          events.push({
            t: 'damage',
            target: u.id,
            source: s.def.id,
            skill: s.def.id,
            amount,
            crit: false,
            hp: u.hp,
            type: s.def.damageType,
            resist: Math.round(resist * 100),
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
    for (const u of units) u.reaction = true;
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
