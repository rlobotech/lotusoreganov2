import type { PartySummary, WorldInfo } from '@game/shared';
import { memberDerived, xpToNext, type PartyState, type WorldDef } from '@game/world';

/** What the client sees of a party. Deliberately leaves out a running fight's result. */
export function summarize(state: PartyState, world: WorldDef): PartySummary {
  const a = state.activity;
  let label = 'Idle';
  if (a.kind === 'travel') {
    const site = a.toSite ? world.sites[a.toSite] : null;
    label = site ? `Travelling to ${site.name}` : 'Travelling to a hunting ground';
  } else if (a.kind === 'fight') label = `Fighting: ${a.title}`;
  else if (a.kind === 'rest') label = a.forced ? 'Recovering' : 'Resting';
  else if (a.kind === 'dead') label = 'Fallen';

  return {
    id: state.id,
    name: state.name,
    mode: state.mode,
    status: state.status,
    level: state.level,
    xp: state.xp,
    xpToNext: xpToNext(state.level),
    gold: state.gold,
    pos: state.pos,
    lastCity: state.lastCity,
    members: state.members.map((m) => {
      const d = memberDerived(m, state.level);
      return {
        id: m.id,
        name: m.name,
        race: m.race,
        cls: m.cls,
        alive: m.alive,
        hp: m.hp,
        maxHp: d.maxHp,
        mana: m.mana,
        maxMana: d.maxMana,
      };
    }),
    bag: state.bag,
    orders: state.orders,
    cleared: state.cleared,
    dungeon: state.dungeon
      ? {
          ...state.dungeon,
          name: world.sites[state.dungeon.siteId]?.name,
          stages: world.sites[state.dungeon.siteId]?.dungeon?.stages.length,
        }
      : null,
    activity: { kind: a.kind, label, endsAt: state.nextAt },
    stats: state.stats,
  };
}

/** The map and sites, without anything the player should not know yet. */
export function publicWorld(world: WorldDef): WorldInfo {
  return {
    id: world.id,
    width: world.width,
    height: world.height,
    terrain: world.terrain,
    zoneOf: world.zoneOf,
    startCity: world.startCity,
    zones: Object.values(world.zones).map((z) => ({
      id: z.id,
      name: z.name,
      minLevel: z.minLevel,
      maxLevel: z.maxLevel,
      unlockedBy: z.unlockedBy ?? null,
    })),
    sites: Object.values(world.sites).map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      col: s.col,
      row: s.row,
      ...(s.dungeon
        ? {
            dungeon: {
              recommendedLevel: s.dungeon.level,
              stages: s.dungeon.stages.length,
              restPolicy: s.dungeon.restPolicy,
            },
          }
        : {}),
    })),
  };
}
