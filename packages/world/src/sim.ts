import { createRng, runCombat, type Rng, type UnitDef } from '@game/engine';
import { ARENAS } from './arenas.ts';
import {
  findPath,
  hexDistance,
  inWorld,
  isPassable,
  sameHex,
  siteAt,
  zoneAt,
  type PathStep,
} from './hex.ts';
import { addToBag, rollDrop } from './loot.ts';
import { MONSTERS, monsterUnit } from './monsters.ts';
import {
  addXp,
  CLASSES,
  createMember,
  memberAttributes,
  memberDerived,
  monsterGold,
  monsterXp,
  SKILLS,
} from './progression.ts';
import type {
  Activity,
  AdvanceResult,
  EncounterDef,
  FeedEvent,
  Hex,
  Item,
  Member,
  MemberTemplate,
  PartyState,
  ReplayOut,
  SimConfig,
  WorldDef,
} from './types.ts';

export function defaultConfig(tickMs = 60_000): SimConfig {
  return {
    tickMs,
    ticksPerRound: 5,
    jitterMs: Math.min(3000, Math.floor(tickMs / 4)),
    maxSteps: 1000,
    defeatGoldLossPct: 15,
    defeatItemLossPct: 7,
    reviveHpPct: 25,
    bagSize: 40,
    restMinTicks: 10,
    restExtraTicks: 10,
    travelTicksPerHex: 10,
  };
}

export interface CreatePartyOptions {
  id: string;
  name: string;
  mode?: 'standard' | 'hardcore';
  members: MemberTemplate[];
  seed: number;
  now: number;
  world: WorldDef;
}

export function createParty(o: CreatePartyOptions): PartyState {
  if (o.members.length < 2 || o.members.length > 6) {
    throw new Error('A party has 2 to 6 members');
  }
  const city = o.world.sites[o.world.startCity];
  if (!city) throw new Error('World has no start city');
  return {
    id: o.id,
    name: o.name,
    mode: o.mode ?? 'standard',
    status: 'active',
    seed: o.seed >>> 0,
    counter: 0,
    level: 1,
    xp: 0,
    gold: 0,
    pos: { col: city.col, row: city.row },
    lastCity: city.id,
    members: o.members.map((t, i) => createMember(i, t, 1)),
    bag: [],
    orders: [],
    activity: { kind: 'start' },
    nextAt: o.now,
    dungeon: null,
    cleared: [],
    forcedRest: false,
    settings: { restBelowPct: 55 },
    stats: { fights: 0, wins: 0, defeats: 0, draws: 0 },
  };
}

// ---------- helpers ----------

interface Ctx {
  party: PartyState;
  world: WorldDef;
  cfg: SimConfig;
  rng: Rng;
  at: number;
  events: FeedEvent[];
  replays: ReplayOut[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function emit(ctx: Ctx, kind: string, payload: Record<string, unknown>, replayKey?: string) {
  ctx.events.push({ at: ctx.at, kind, payload, ...(replayKey ? { replayKey } : {}) });
}

function schedule(ctx: Ctx, ticks: number) {
  const jitter = ctx.cfg.jitterMs > 0 ? ctx.rng.int(0, ctx.cfg.jitterMs) : 0;
  ctx.party.nextAt = ctx.at + ticks * ctx.cfg.tickMs + jitter;
}

function maxes(p: PartyState, m: Member) {
  return memberDerived(m, p.level);
}

/** Share of the party's total health that is left (0..1). */
export function hpFraction(p: PartyState): number {
  let hp = 0;
  let max = 0;
  for (const m of p.members) {
    hp += m.alive ? m.hp : 0;
    max += maxes(p, m).maxHp;
  }
  return max > 0 ? hp / max : 0;
}

function memberUnit(p: PartyState, m: Member): UnitDef {
  const cls = CLASSES[m.cls];
  return {
    id: m.id,
    name: m.name,
    team: 'party',
    level: p.level,
    attributes: memberAttributes(m, p.level),
    move: cls.move,
    skills: cls.skills,
    ai: cls.ai,
    sprite: `${m.race}_${m.cls}`,
    hp: m.hp,
    mana: m.mana,
  };
}

function pickWeighted(rng: Rng, list: EncounterDef[]): EncounterDef {
  const total = list.reduce((s, e) => s + e.weight, 0);
  let r = rng.next() * total;
  for (const e of list) {
    r -= e.weight;
    if (r < 0) return e;
  }
  return list[list.length - 1]!;
}

// ---------- completing the current activity ----------

function applyFight(ctx: Ctx, a: Extract<Activity, { kind: 'fight' }>) {
  const p = ctx.party;
  const r = a.result;
  p.stats.fights += 1;
  for (const s of r.survivors) {
    const m = p.members.find((x) => x.id === s.id);
    if (m) {
      m.hp = s.hp;
      m.mana = s.mana;
      m.alive = s.alive;
    }
  }

  const replayKey = `f${p.stats.fights}`;
  const payload: Record<string, unknown> = {
    title: a.title,
    context: a.context,
    outcome: r.outcome,
    rounds: r.rounds,
    level: a.level,
    boss: a.boss,
    fallen: p.members.filter((m) => !m.alive).map((m) => m.name),
  };
  let pinned = a.boss;
  let levelsGained = 0;

  if (r.outcome === 'victory') {
    p.stats.wins += 1;
    p.gold += r.gold;
    const discarded: string[] = [];
    for (const item of r.loot) {
      if (item.rarity === 'epic') pinned = true;
      const { discarded: out } = addToBag(p.bag, item, ctx.cfg.bagSize);
      if (out) discarded.push(out.name);
    }
    levelsGained = addXp(p, r.xp);
    payload.xp = r.xp;
    payload.gold = r.gold;
    payload.loot = r.loot.map((i) => ({ name: i.name, rarity: i.rarity, itemLevel: i.itemLevel }));
    if (discarded.length) payload.discarded = discarded;
  } else if (r.outcome === 'draw') {
    p.stats.draws += 1;
    p.forcedRest = true;
  } else {
    p.stats.defeats += 1;
    pinned = true;
  }

  ctx.replays.push({
    key: replayKey,
    title: a.title,
    outcome: r.outcome,
    pinned,
    events: r.events,
  });
  emit(ctx, 'fight', payload, replayKey);
  if (levelsGained > 0) emit(ctx, 'level_up', { level: p.level, gained: levelsGained });

  if (r.outcome === 'defeat') return handleDefeat(ctx);

  // Survivors carry on; the fallen are revived hurt and the party must rest.
  const fallen = p.members.filter((m) => !m.alive);
  for (const m of fallen) {
    m.alive = true;
    m.hp = Math.max(1, Math.ceil((maxes(p, m).maxHp * ctx.cfg.reviveHpPct) / 100));
  }
  if (fallen.length) p.forcedRest = true;

  if (r.outcome === 'victory' && p.dungeon) advanceDungeon(ctx);
}

function advanceDungeon(ctx: Ctx) {
  const p = ctx.party;
  const d = p.dungeon!;
  const site = ctx.world.sites[d.siteId]!;
  const def = site.dungeon!;
  d.stage += 1;
  if (d.stage < def.stages.length) {
    emit(ctx, 'dungeon_progress', {
      siteId: site.id,
      name: site.name,
      stage: d.stage,
      total: def.stages.length,
    });
    return;
  }
  p.gold += def.rewardGold;
  const levelsGained = addXp(p, def.rewardXp);
  p.cleared.push(site.id);
  p.dungeon = null;
  p.orders = p.orders.filter((o) => o.siteId !== site.id);
  emit(ctx, 'dungeon_cleared', {
    siteId: site.id,
    name: site.name,
    gold: def.rewardGold,
    xp: def.rewardXp,
  });
  if (levelsGained > 0) emit(ctx, 'level_up', { level: p.level, gained: levelsGained });
  for (const z of Object.values(ctx.world.zones)) {
    if (z.unlockedBy === site.id) emit(ctx, 'zone_unlocked', { zoneId: z.id, name: z.name });
  }
}

function handleDefeat(ctx: Ctx) {
  const p = ctx.party;
  if (p.mode === 'hardcore') {
    p.status = 'dead';
    p.nextAt = null;
    p.activity = { kind: 'dead' };
    emit(ctx, 'party_lost', { name: p.name, level: p.level, gold: p.gold });
    return;
  }
  const goldLost = Math.floor((p.gold * ctx.cfg.defeatGoldLossPct) / 100);
  p.gold -= goldLost;
  const lost: Item[] = [];
  p.bag = p.bag.filter((item) => {
    if (item.favorite || !ctx.rng.chance(ctx.cfg.defeatItemLossPct)) return true;
    lost.push(item);
    return false;
  });
  const city = ctx.world.sites[p.lastCity]!;
  p.pos = { col: city.col, row: city.row };
  p.dungeon = null;
  for (const m of p.members) {
    m.alive = true;
    m.hp = Math.max(1, Math.ceil((maxes(p, m).maxHp * ctx.cfg.reviveHpPct) / 100));
  }
  p.forcedRest = true;
  emit(ctx, 'defeat', {
    goldLost,
    itemsLost: lost.map((i) => i.name),
    city: city.name,
  });
}

function applyRest(ctx: Ctx) {
  const p = ctx.party;
  for (const m of p.members) {
    const d = maxes(p, m);
    m.hp = d.maxHp;
    m.mana = d.maxMana;
    m.alive = true;
  }
  p.forcedRest = false;
  const a = p.activity as Extract<Activity, { kind: 'rest' }>;
  emit(ctx, 'rest', { ticks: a.ticks, forced: a.forced });
}

/** Returns true when a new activity was already scheduled (still travelling). */
function completeActivity(ctx: Ctx): boolean {
  const p = ctx.party;
  const a = p.activity;
  switch (a.kind) {
    case 'travel': {
      const step = a.path[a.i]!;
      p.pos = { col: step.col, row: step.row };
      a.i += 1;
      if (a.i < a.path.length) {
        schedule(ctx, a.path[a.i]!.ticks);
        return true;
      }
      emit(ctx, 'travel', { from: a.from, to: p.pos, hexes: a.path.length });
      const site = siteAt(ctx.world, p.pos);
      if (site) {
        emit(ctx, 'arrive', { siteId: site.id, name: site.name, kind: site.kind });
        if (site.kind === 'city') {
          p.lastCity = site.id;
          p.orders = p.orders.filter((o) => o.siteId !== site.id);
        }
      }
      return false;
    }
    case 'fight':
      applyFight(ctx, a);
      return false;
    case 'rest':
      applyRest(ctx);
      return false;
    default:
      return false;
  }
}

// ---------- starting the next activity ----------

function restAllowed(ctx: Ctx): boolean {
  const d = ctx.party.dungeon;
  if (!d) return true;
  const def = ctx.world.sites[d.siteId]!.dungeon!;
  if (def.restPolicy === 'free') return true;
  if (def.restPolicy === 'limited') return d.restsUsed < (def.restLimit ?? 0);
  return false;
}

function startRest(ctx: Ctx, forced: boolean) {
  const p = ctx.party;
  const missing = 1 - hpFraction(p);
  const ticks = ctx.cfg.restMinTicks + Math.round(ctx.cfg.restExtraTicks * clamp(missing, 0, 1));
  if (p.dungeon && !forced) p.dungeon.restsUsed += 1;
  p.activity = { kind: 'rest', startedAt: ctx.at, ticks, forced };
  schedule(ctx, ticks);
}

function startTravel(ctx: Ctx, path: PathStep[], toSite: string | null) {
  const p = ctx.party;
  p.activity = { kind: 'travel', from: { ...p.pos }, toSite, path, i: 0 };
  schedule(ctx, path[0]!.ticks);
}

interface FightSpec {
  encounter: EncounterDef;
  level: number;
  context: 'wild' | 'dungeon';
  title: string;
  boss: boolean;
  xpMult: number;
}

function startFight(ctx: Ctx, f: FightSpec) {
  const p = ctx.party;
  const size = p.members.length;
  const adj = size >= 5 ? 1 : size <= 2 ? -1 : 0;
  const enemies: UnitDef[] = [];
  const levels: number[] = [];
  for (const spawn of f.encounter.monsters) {
    const t = MONSTERS[spawn.template];
    if (!t) throw new Error(`Unknown monster ${spawn.template}`);
    const count = clamp(ctx.rng.int(spawn.min, spawn.max) + (spawn.max > 1 ? adj : 0), 1, 6);
    for (let i = 0; i < count; i++) {
      enemies.push(monsterUnit(t, `e${enemies.length}`, f.level));
      levels.push(f.level);
    }
  }
  enemies.length = Math.min(enemies.length, 6);

  const arena = ARENAS[f.encounter.arena];
  if (!arena) throw new Error(`Unknown arena ${f.encounter.arena}`);
  const result = runCombat({
    seed: ctx.rng.int(1, 0x7fffffff),
    arena,
    units: [...p.members.map((m) => memberUnit(p, m)), ...enemies],
    skills: SKILLS,
  });

  let xp = 0;
  let gold = 0;
  const loot: Item[] = [];
  enemies.forEach((e, i) => {
    xp += Math.round(monsterXp(e.level) * f.xpMult);
    gold += monsterGold(e.level) + ctx.rng.int(0, 2);
    const drop = rollDrop(ctx.rng, e.level, `i${p.stats.fights}_${i}_${ctx.at}`);
    if (drop) loot.push(drop);
  });

  p.activity = {
    kind: 'fight',
    context: f.context,
    title: f.title,
    boss: f.boss,
    level: f.level,
    startedAt: ctx.at,
    result: {
      outcome: result.outcome,
      rounds: result.rounds,
      survivors: result.units
        .filter((u) => u.team === 'party')
        .map((u) => ({ id: u.id, hp: u.hp, mana: u.mana, alive: u.alive })),
      xp,
      gold,
      loot,
      events: result.events,
    },
  };
  schedule(ctx, Math.max(1, result.rounds) * ctx.cfg.ticksPerRound);
}

function startDungeonFight(ctx: Ctx) {
  const p = ctx.party;
  const d = p.dungeon!;
  const site = ctx.world.sites[d.siteId]!;
  const def = site.dungeon!;
  const stage = def.stages[d.stage]!;
  startFight(ctx, {
    encounter: stage.encounter,
    level: def.level + stage.levelOffset,
    context: 'dungeon',
    title: `${site.name}: ${stage.name}`,
    boss: !!stage.boss,
    xpMult: 1,
  });
}

function startWildFight(ctx: Ctx) {
  const p = ctx.party;
  const zone = ctx.world.zones[zoneAt(ctx.world, p.pos)]!;
  const encounter = pickWeighted(ctx.rng, zone.encounters);
  const level = clamp(p.level + ctx.rng.int(-1, 1), zone.minLevel, zone.maxLevel);
  // Hunting far below your level pays less, nudging players onward.
  const xpMult = Math.max(0.1, 1 - 0.15 * Math.max(0, p.level - zone.maxLevel));
  startFight(ctx, {
    encounter,
    level,
    context: 'wild',
    title: `${zone.name}: ${encounter.name}`,
    boss: false,
    xpMult,
  });
}

/** A nearby wild hex whose zone suits the party's level, reachable at the least travel time. */
export function findHuntingSpot(
  world: WorldDef,
  from: Hex,
  level: number,
  cleared: readonly string[],
  ticksPerHex: number,
): { hex: Hex; path: PathStep[] } | null {
  let best: { hex: Hex; path: PathStep[]; score: number } | null = null;
  for (let row = 0; row < world.height; row++) {
    for (let col = 0; col < world.width; col++) {
      const hex = { col, row };
      if (hexDistance(from, hex) > 5 || sameHex(from, hex)) continue;
      if (!isPassable(world, hex, cleared) || siteAt(world, hex)) continue;
      const zone = world.zones[zoneAt(world, hex)]!;
      const path = findPath(world, from, hex, cleared, ticksPerHex);
      if (!path) continue;
      const ticks = path.reduce((s, st) => s + st.ticks, 0);
      const score =
        ticks +
        20 * Math.max(0, zone.minLevel - 1 - level) +
        5 * Math.max(0, level - zone.maxLevel);
      if (!best || score < best.score) best = { hex, path, score };
    }
  }
  return best ? { hex: best.hex, path: best.path } : null;
}

function startHunting(ctx: Ctx) {
  const p = ctx.party;
  if (siteAt(ctx.world, p.pos)) {
    const spot = findHuntingSpot(ctx.world, p.pos, p.level, p.cleared, ctx.cfg.travelTicksPerHex);
    if (spot && spot.path.length > 0) return startTravel(ctx, spot.path, null);
  }
  startWildFight(ctx);
}

/** 'started' = an activity is running, 'retry' = the order is gone, decide again. */
function handleOrder(ctx: Ctx): 'started' | 'retry' | 'none' {
  const p = ctx.party;
  const order = p.orders[0];
  if (!order) return 'none';
  const drop = (reason?: string) => {
    p.orders.shift();
    if (reason) emit(ctx, 'order_failed', { siteId: order.siteId, reason });
    return 'retry' as const;
  };
  const site = ctx.world.sites[order.siteId];
  if (!site) return drop('unknown_site');

  if (p.pos.col === site.col && p.pos.row === site.row) {
    if (site.kind === 'city' || p.cleared.includes(site.id)) return drop();
    p.dungeon = { siteId: site.id, stage: 0, restsUsed: 0 };
    emit(ctx, 'enter_dungeon', {
      siteId: site.id,
      name: site.name,
      stages: site.dungeon!.stages.length,
      recommendedLevel: site.dungeon!.level,
    });
    startDungeonFight(ctx);
    return 'started';
  }
  const path = findPath(
    ctx.world,
    p.pos,
    { col: site.col, row: site.row },
    p.cleared,
    ctx.cfg.travelTicksPerHex,
  );
  if (!path || path.length === 0) return drop('unreachable');
  startTravel(ctx, path, site.id);
  return 'started';
}

function decide(ctx: Ctx) {
  const p = ctx.party;
  for (let guard = 0; guard < 8; guard++) {
    if (p.forcedRest) return startRest(ctx, true);
    if (hpFraction(p) * 100 < p.settings.restBelowPct && restAllowed(ctx)) {
      return startRest(ctx, false);
    }
    if (p.dungeon) return startDungeonFight(ctx);
    const r = handleOrder(ctx);
    if (r === 'started') return;
    if (r === 'retry') continue;
    return startHunting(ctx);
  }
  startHunting(ctx);
}

// ---------- public entry point ----------

function stepRng(p: PartyState): Rng {
  return createRng((p.seed ^ Math.imul(p.counter + 1, 0x9e3779b1)) >>> 0);
}

/**
 * Advances a party up to `now`, completing every activity that finished since its last update
 * (bounded by cfg.maxSteps). Pure and deterministic: nothing is mutated and the same inputs always
 * give the same results. Returns the new state, the feed events and the replays produced.
 */
export function advance(
  input: PartyState,
  now: number,
  world: WorldDef,
  cfg: SimConfig,
): AdvanceResult {
  const party = structuredClone(input);
  const events: FeedEvent[] = [];
  const replays: ReplayOut[] = [];
  let steps = 0;
  while (
    party.status === 'active' &&
    party.nextAt !== null &&
    party.nextAt <= now &&
    steps < cfg.maxSteps
  ) {
    steps += 1;
    const ctx: Ctx = { party, world, cfg, rng: stepRng(party), at: party.nextAt, events, replays };
    party.counter += 1;
    const rescheduled = completeActivity(ctx);
    if (!rescheduled && party.status === 'active') decide(ctx);
  }
  return { party, events, replays };
}

export { inWorld };
