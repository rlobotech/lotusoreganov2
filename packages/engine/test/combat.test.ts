import { describe, expect, it } from 'vitest';
import { runCombat } from '../src/combat.ts';
import { formatLog } from '../src/format.ts';
import * as samples from '../src/samples.ts';
import {
  LOG_FORMAT_VERSION,
  MAX_ROUNDS,
  type CombatEvent,
  type CombatInput,
} from '../src/types.ts';
import { melee, openArena, unitDef } from './helpers.ts';

describe('determinism', () => {
  it('same input and seed give an identical log', () => {
    const a = runCombat(samples.input(99));
    const b = runCombat(samples.input(99));
    expect(a).toEqual(b);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  it('different seeds give different fights', () => {
    const logs = new Set<string>();
    for (let seed = 1; seed <= 20; seed++)
      logs.add(JSON.stringify(runCombat(samples.input(seed)).events));
    expect(logs.size).toBeGreaterThan(15);
  });

  it('does not mutate its input', () => {
    const input = samples.input(5);
    const copy = JSON.parse(JSON.stringify(input));
    runCombat(input);
    expect(input).toEqual(copy);
  });

  it('log is JSON-serialisable and survives a round trip', () => {
    const r = runCombat(samples.input(3));
    expect(JSON.parse(JSON.stringify(r.events))).toEqual(r.events);
  });
});

describe('log structure', () => {
  it('starts with a versioned start event and ends with exactly one end event', () => {
    const { events } = runCombat(samples.input(1));
    const first = events[0]!;
    expect(first.t).toBe('start');
    if (first.t === 'start') expect(first.formatVersion).toBe(LOG_FORMAT_VERSION);
    expect(events.filter((e) => e.t === 'end')).toHaveLength(1);
    expect(events[events.length - 1]!.t).toBe('end');
  });

  it('formats into readable text', () => {
    const lines = formatLog(runCombat(samples.input(1)).events);
    expect(lines[0]).toContain('Fight start');
    expect(lines[lines.length - 1]).toMatch(/^Result: (victory|defeat|draw)/);
  });
});

/** Replays the log independently and checks the engine never contradicts itself. */
function checkInvariants(
  input: CombatInput,
  events: CombatEvent[],
  finalHp: Record<string, number>,
) {
  const start = events[0]!;
  if (start.t !== 'start') throw new Error('no start');
  const hp = new Map(start.units.map((u) => [u.id, u.hp]));
  const maxHp = new Map(start.units.map((u) => [u.id, u.maxHp]));
  const pos = new Map(start.units.map((u) => [u.id, { x: u.x, y: u.y }]));
  const dead = new Set<string>();
  const blocked = new Set(start.arena.blocked.map((p) => `${p.x},${p.y}`));

  for (const e of events) {
    switch (e.t) {
      case 'turn':
      case 'skip':
        expect(dead.has(e.unit)).toBe(false);
        break;
      case 'move': {
        expect(dead.has(e.unit)).toBe(false);
        for (const p of e.path) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThan(start.arena.width);
          expect(p.y).toBeLessThan(start.arena.height);
          expect(blocked.has(`${p.x},${p.y}`)).toBe(false);
        }
        const end = e.path[e.path.length - 1]!;
        pos.set(e.unit, { x: end.x, y: end.y });
        const tiles = [...pos.entries()]
          .filter(([id]) => !dead.has(id))
          .map(([, p]) => `${p.x},${p.y}`);
        expect(new Set(tiles).size).toBe(tiles.length);
        break;
      }
      case 'skill':
        expect(dead.has(e.unit)).toBe(false);
        break;
      case 'damage': {
        const before = hp.get(e.target)!;
        expect(e.hp).toBe(Math.max(0, before - e.amount));
        expect(e.amount).toBeGreaterThan(0);
        hp.set(e.target, e.hp);
        break;
      }
      case 'heal': {
        const before = hp.get(e.target)!;
        expect(e.hp).toBe(before + e.amount);
        expect(e.hp).toBeLessThanOrEqual(maxHp.get(e.target)!);
        hp.set(e.target, e.hp);
        break;
      }
      case 'death':
        expect(hp.get(e.unit)).toBe(0);
        dead.add(e.unit);
        break;
      default:
        break;
    }
  }
  for (const [id, v] of hp) expect(finalHp[id]).toBe(v);
  expect(input.units.length).toBe(hp.size);
}

describe('invariants over many seeds', () => {
  it('hp, positions, deaths and the log stay consistent for 150 fights', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const input = samples.input(seed);
      const r = runCombat(input);
      expect(['victory', 'defeat', 'draw']).toContain(r.outcome);
      expect(r.rounds).toBeLessThanOrEqual(MAX_ROUNDS);
      checkInvariants(input, r.events, Object.fromEntries(r.units.map((u) => [u.id, u.hp])));
      const alive = (team: string) => r.units.some((u) => u.team === team && u.alive);
      if (r.outcome === 'victory') expect(alive('enemy')).toBe(false);
      if (r.outcome === 'defeat') expect(alive('party')).toBe(false);
    }
  });
});

describe('starting hp and mana', () => {
  it('units can enter a fight hurt and the log starts from that hp', () => {
    const input = samples.input(2);
    input.units[0] = { ...input.units[0]!, hp: 17, mana: 3 };
    const r = runCombat(input);
    const start = r.events[0]!;
    if (start.t !== 'start') throw new Error('no start');
    const first = start.units[0]!;
    expect(first.hp).toBe(17);
    expect(first.mana).toBe(3);
  });

  it('clamps absurd values into the valid range', () => {
    const input = samples.input(2);
    input.units[0] = { ...input.units[0]!, hp: 99999, mana: -5 };
    const start = runCombat(input).events[0]!;
    if (start.t !== 'start') throw new Error('no start');
    expect(start.units[0]!.hp).toBe(start.units[0]!.maxHp);
    expect(start.units[0]!.mana).toBe(0);
  });
});

describe('edge cases', () => {
  it('ends in a draw at the round cap when the sides cannot reach each other', () => {
    const sealed = openArena(5, 3, [
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ]);
    const r = runCombat({
      seed: 1,
      arena: sealed,
      skills: { attack: melee },
      units: [
        unitDef('hero', 'party', ['attack'], [{ skill: 'attack' }]),
        unitDef('orc', 'enemy', ['attack'], [{ skill: 'attack' }]),
      ],
    });
    expect(r.outcome).toBe('draw');
    expect(r.rounds).toBe(MAX_ROUNDS);
  });

  it('rejects a unit that has no free spawn tile', () => {
    const arena = openArena(3, 1);
    expect(() =>
      runCombat({
        seed: 1,
        arena: { ...arena, spawns: { party: [], enemy: [{ x: 2, y: 0 }] } },
        skills: { attack: melee },
        units: [unitDef('hero', 'party', ['attack'], []), unitDef('orc', 'enemy', ['attack'], [])],
      }),
    ).toThrow(/spawn/);
  });

  it('rejects duplicate unit ids', () => {
    expect(() =>
      runCombat({
        seed: 1,
        arena: openArena(5, 3),
        skills: { attack: melee },
        units: [unitDef('a', 'party', ['attack'], []), unitDef('a', 'enemy', ['attack'], [])],
      }),
    ).toThrow(/Duplicate/);
  });

  it('stun costs the target its next turn even if applied after it acted', () => {
    const stunner = {
      ...melee,
      id: 'bash',
      status: { id: 'stun', kind: 'stun' as const, duration: 1 },
      statusChance: 100,
    };
    // Fast attacker stuns a slower target adjacent to it; the target must skip a turn.
    const fast = unitDef('fast', 'party', ['bash'], [{ skill: 'bash' }], {
      attributes: { str: 10, dex: 30, int: 5, vit: 30, wis: 5 },
    });
    const slow = unitDef('slow', 'enemy', ['attack'], [{ skill: 'attack' }], {
      attributes: { str: 5, dex: 1, int: 5, vit: 30, wis: 5 },
    });
    const r = runCombat({
      seed: 4,
      arena: { ...openArena(3, 1), spawns: { party: [{ x: 0, y: 0 }], enemy: [{ x: 1, y: 0 }] } },
      skills: { bash: stunner, attack: melee },
      units: [fast, slow],
    });
    const stunnedTurn = r.events.find((e) => e.t === 'skip' && e.reason === 'stun');
    expect(stunnedTurn).toBeDefined();
    const gained = r.events.findIndex((e) => e.t === 'status' && e.status === 'stun' && e.on);
    const lost = r.events.findIndex((e) => e.t === 'status' && e.status === 'stun' && !e.on);
    const skipped = r.events.findIndex((e) => e.t === 'skip' && e.reason === 'stun');
    expect(gained).toBeLessThan(skipped);
    expect(skipped).toBeLessThan(lost);
  });
});
