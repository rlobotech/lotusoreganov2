import type { CombatEvent, Outcome, Point } from '@game/engine';
import { gridToScreen } from './iso.ts';

export interface UnitView {
  id: string;
  name: string;
  team: 'party' | 'enemy';
  sprite: string | null;
  level: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  statuses: string[];
  /** The art is drawn facing south-east; the west-facing version is the same sprite flipped. */
  faceLeft: boolean;
}

export interface ViewState {
  arena: { id: string; width: number; height: number; blocked: Point[] };
  units: Record<string, UnitView>;
  /** Stable unit order (same as the start event). */
  order: string[];
  round: number;
  active: string | null;
  outcome: Outcome | null;
}

/** How long each event plays at 1x speed, in milliseconds. */
export const DURATION = {
  round: 500,
  turn: 120,
  movePerTile: 200,
  skill: 500,
  miss: 450,
  damage: 550,
  heal: 550,
  status: 250,
  skip: 350,
  death: 700,
  end: 1500,
} as const;

export function eventDuration(e: CombatEvent): number {
  switch (e.t) {
    case 'start':
      return 0;
    case 'round':
      return DURATION.round;
    case 'turn':
      return DURATION.turn;
    case 'move':
      return DURATION.movePerTile * Math.max(1, e.path.length);
    case 'skill':
      return DURATION.skill;
    case 'miss':
      return DURATION.miss;
    case 'damage':
      return DURATION.damage;
    case 'heal':
      return DURATION.heal;
    case 'status':
      return DURATION.status;
    case 'skip':
      return DURATION.skip;
    case 'death':
      return DURATION.death;
    case 'end':
      return DURATION.end;
  }
}

export function initialState(start: Extract<CombatEvent, { t: 'start' }>): ViewState {
  const units: Record<string, UnitView> = {};
  for (const u of start.units) {
    units[u.id] = {
      id: u.id,
      name: u.name,
      team: u.team,
      sprite: u.sprite,
      level: u.level,
      x: u.x,
      y: u.y,
      hp: u.hp,
      maxHp: u.maxHp,
      alive: true,
      statuses: [],
      // Parties start on the left of the screen facing right; enemies face left.
      faceLeft: u.team === 'enemy',
    };
  }
  return {
    arena: start.arena,
    units,
    order: start.units.map((u) => u.id),
    round: 0,
    active: null,
    outcome: null,
  };
}

function screenDx(from: Point, to: Point): number {
  return gridToScreen(to.x, to.y).x - gridToScreen(from.x, from.y).x;
}

/** Pure reducer: returns the state after `e`. Never mutates `s`. */
export function applyEvent(s: ViewState, e: CombatEvent): ViewState {
  if (e.t === 'start') return initialState(e);
  const next = structuredClone(s);
  const unit = (id: string) => next.units[id]!;

  switch (e.t) {
    case 'round':
      next.round = e.n;
      break;
    case 'turn':
      next.active = e.unit;
      break;
    case 'move': {
      const u = unit(e.unit);
      const end = e.path[e.path.length - 1]!;
      const dx = screenDx(u, end);
      if (dx !== 0) u.faceLeft = dx < 0;
      u.x = end.x;
      u.y = end.y;
      break;
    }
    case 'skill': {
      const u = unit(e.unit);
      const dx = screenDx(u, e);
      if (dx !== 0) u.faceLeft = dx < 0;
      break;
    }
    case 'damage':
    case 'heal':
      unit(e.target).hp = e.hp;
      break;
    case 'status': {
      const u = unit(e.unit);
      u.statuses = e.on
        ? [...new Set([...u.statuses, e.status])]
        : u.statuses.filter((id) => id !== e.status);
      break;
    }
    case 'death':
      unit(e.unit).alive = false;
      unit(e.unit).statuses = [];
      break;
    case 'end':
      next.outcome = e.outcome;
      next.active = null;
      break;
    default:
      break;
  }
  return next;
}

/**
 * states[i] is the state BEFORE steps[i] plays; states[steps.length] is the final state.
 * `steps` is the log without its start event, which only initialises the state.
 */
export function buildTimeline(events: CombatEvent[]): {
  steps: CombatEvent[];
  states: ViewState[];
} {
  const start = events[0];
  if (!start || start.t !== 'start') throw new Error('Replay must begin with a start event');
  const steps = events.slice(1);
  const states: ViewState[] = [initialState(start)];
  for (const e of steps) states.push(applyEvent(states[states.length - 1]!, e));
  return { steps, states };
}
