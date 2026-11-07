import { resistPct, type DamageType } from '@game/engine';
import type { OrderInfo, PartySummary, QuestInfo, SkillInfo, WorldInfo } from '@game/shared';
import {
  activeQuest,
  canControl,
  DEFAULT_BAG_SIZE,
  memberBreakdown,
  memberDerived,
  MAX_SCHOOL_LEVEL,
  memberGear,
  MONSTERS,
  objectiveTarget,
  partyGold,
  PERSONAL_BAG_SIZE,
  questAvailability,
  questTargetSite,
  shopItem,
  SCHOOL_NAMES,
  schoolLevel,
  schoolXpForLevel,
  SKILLS,
  unlockProblem,
  type SchoolId,
  spendableGold,
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
export function summarize(state: PartyState, world: WorldDef, viewer?: string): PartySummary {
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
    gold: partyGold(state),
    spendableGold: spendableGold(state, viewer),
    pos: state.pos,
    lastCity: state.lastCity,
    members: state.members.map((m) => {
      const d = memberDerived(m, state.level);
      const gear = memberGear(m);
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
          speed: d.speed,
          move: d.move,
          accuracy: Math.round(d.accuracy),
          evasion: Math.round(d.evasion),
          crit: Math.round(d.crit * 10) / 10,
        },
        combat: {
          weapon: gear.weapon ?? null,
          extra: gear.extra,
          resist: Object.fromEntries(
            Object.entries(gear.resist).map(([type, points]) => [
              type,
              {
                points,
                pct: Math.round(resistPct(points, state.level) * 100),
              },
            ]),
          ) as Partial<Record<DamageType, { points: number; pct: number }>>,
        },
        points: m.points,
        autoAlloc: m.autoAlloc,
        equipment: m.equipment,
        bag: m.bag,
        gold: m.gold,
        mine: canControl(m, viewer),
        skills: m.skills,
        schools: Object.entries(m.schools).map(([id, xp]) => {
          const level = schoolLevel(xp);
          return {
            id,
            name: SCHOOL_NAMES[id as SchoolId] ?? id,
            level,
            xp,
            levelXp: schoolXpForLevel(level),
            nextXp: level >= MAX_SCHOOL_LEVEL ? null : schoolXpForLevel(level + 1),
          };
        }),
        locked: Object.values(SKILLS).flatMap((s) => {
          const why = unlockProblem(m, s);
          return why && s.school && m.schools[s.school] !== undefined && !m.skills.includes(s.id)
            ? [{ skill: s.id, missing: why }]
            : [];
        }),
        ai: m.ai,
      };
    }),
    bag: state.bag,
    pendingItems: state.pendingItems ?? [],
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
    source: s.source,
    damageType: s.damageType ?? null,
    attr: s.attr,
    power: s.power,
    range: s.range,
    manaCost: s.manaCost,
    cooldown: s.cooldown,
    side: s.side,
    ...(s.radius ? { radius: s.radius } : {}),
    ...(s.retreat ? { retreat: s.retreat } : {}),
    ...(s.free ? { free: true } : {}),
    ...(s.school ? { school: s.school } : {}),
    ...(s.unlock ? { unlock: s.unlock } : {}),
    ...(s.bookOnly ? { bookOnly: true } : {}),
    ...(s.weapons ? { weapons: s.weapons } : {}),
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
