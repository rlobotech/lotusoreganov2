import type { OrderInfo, PartySummary, QuestInfo, SkillInfo, WorldInfo } from '@game/shared';
import {
  activeQuest,
  DEFAULT_BAG_SIZE,
  memberBreakdown,
  memberDerived,
  MONSTERS,
  objectiveTarget,
  PERSONAL_BAG_SIZE,
  questAvailability,
  questTargetSite,
  shopItem,
  SKILLS,
  usableCity,
  xpToNext,
  type PartyState,
  type QuestDef,
  type WorldDef,
} from '@game/world';

function objectiveLabel(def: QuestDef['objectives'][number], world: WorldDef): string {
  if (def.type === 'kill') {
    const name = MONSTERS[def.template]?.name ?? def.template;
    return `Defeat ${def.count} ${name}${def.count === 1 ? '' : 's'}`;
  }
  const site = world.sites[def.siteId]?.name ?? def.siteId;
  return def.type === 'visit' ? `Travel to ${site}` : `Clear ${site}`;
}

/** One quest as the player sees it: status, objectives with progress, and the reward. */
export function questInfo(state: PartyState, world: WorldDef, def: QuestDef): QuestInfo {
  const a = questAvailability(state, world, def);
  const prog = activeQuest(state, def.id);
  const item = def.reward.item
    ? shopItem(def.reward.item.base, def.reward.item.itemLevel, def.reward.item.rarity)
    : null;
  const opens = Object.values(world.sites).find((s) => s.requiresQuest === def.id);
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    minLevel: def.minLevel,
    repeatable: !!def.repeatable,
    status: a.status,
    ...(a.reason ? { reason: a.reason } : {}),
    objectives: def.objectives.map((o, i) => {
      const target = objectiveTarget(o);
      const progress = Math.min(target, prog?.progress[i] ?? 0);
      return { label: objectiveLabel(o, world), progress, target, done: progress >= target };
    }),
    reward: {
      gold: def.reward.gold,
      xp: def.reward.xp,
      ...(item ? { item: { name: item.name, rarity: item.rarity } } : {}),
    },
    ...(opens ? { opens: opens.name } : {}),
  };
}

export function orderInfo(state: PartyState, world: WorldDef): OrderInfo[] {
  return state.orders.map((o) => {
    if (o.kind === 'quest') {
      const q = o.questId ? world.quests[o.questId] : undefined;
      return {
        id: o.id,
        kind: 'quest' as const,
        questId: o.questId,
        label: `Quest: ${q?.name ?? o.questId}`,
        targetSiteId: o.questId ? questTargetSite(world, state, o.questId) : null,
      };
    }
    return {
      id: o.id,
      kind: 'goto' as const,
      siteId: o.siteId,
      label: `Go to ${world.sites[o.siteId ?? '']?.name ?? o.siteId}`,
      targetSiteId: o.siteId ?? null,
    };
  });
}

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
        bag: m.bag,
        skills: m.skills,
        ai: m.ai,
      };
    }),
    bag: state.bag,
    bagSize: state.bagSize ?? DEFAULT_BAG_SIZE,
    personalBagSize: PERSONAL_BAG_SIZE,
    orders: orderInfo(state, world),
    quests: {
      active: state.quests.active.flatMap((q) => {
        const def = world.quests[q.id];
        return def ? [questInfo(state, world, def)] : [];
      }),
      completedCount: state.quests.completed.length,
    },
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
      ...(s.requiresQuest
        ? {
            requiresQuest: {
              id: s.requiresQuest,
              name: world.quests[s.requiresQuest]?.name ?? s.requiresQuest,
            },
          }
        : {}),
    })),
  };
}
