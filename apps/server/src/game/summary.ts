import type { PartySummary, SkillInfo, WorldInfo } from '@game/shared';
import {
  memberBreakdown,
  memberDerived,
  SKILLS,
  usableCity,
  xpToNext,
  type PartyState,
  type WorldDef,
} from '@game/world';

/** What the client sees of a party. Deliberately leaves out a running fight's result. */
export function summarize(state: PartyState, world: WorldDef): PartySummary {
  const a = state.activity;
  let label = 'Idle';
  if (a.kind === 'travel') {
    const site = a.toSite ? world.sites[a.toSite] : null;
    label = site ? `Travelling to ${site.name}` : 'Travelling to a hunting ground';
  } else if (a.kind === 'fight') label = `Fighting: ${a.title}`;
  else if (a.kind === 'rest') label = a.forced ? 'Recovering' : 'Resting';
  else if (a.kind === 'town') label = 'Resting in town';
  else if (a.kind === 'dead') label = 'Fallen';
  const city = usableCity(state, world);

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
        attributes: memberBreakdown(m, state.level),
        derived: {
          atk: d.atk,
          magic: d.magic,
          def: d.def,
          res: d.res,
          speed: d.speed,
          move: d.move,
        },
        points: m.points,
        autoAlloc: m.autoAlloc,
        equipment: m.equipment,
        skills: m.skills,
        ai: m.ai,
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
    city: city ? { id: city.id, name: city.name } : null,
    inTown: a.kind === 'town',
    stats: state.stats,
  };
}

/** Skill definitions the AI editor and character sheet show. */
export function skillCatalog(): SkillInfo[] {
  return Object.values(SKILLS).map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    damageType: s.damageType,
    power: s.power,
    range: s.range,
    manaCost: s.manaCost,
    cooldown: s.cooldown,
    side: s.side,
    ...(s.radius ? { radius: s.radius } : {}),
    ...(s.status
      ? { status: { id: s.status.id, kind: s.status.kind, duration: s.status.duration } }
      : {}),
  }));
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
