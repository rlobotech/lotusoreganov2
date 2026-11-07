import { resistPct, type DamageType } from '@game/engine';
import type { OrderInfo, PartySummary, QuestInfo, SkillInfo, WorldInfo } from '@game/shared';
import {
  activeQuest,
  canControl,
  DEFAULT_BAG_SIZE,
  memberBreakdown,
  memberDerived,
  MAX_RING_SCHOOL_LEVEL,
  equippedLimit,
  levelUpCost,
  memberSchools,
  memberSchoolLevel,
  RING_NAMES,
  SKILL_TREE,
  BAG_SLOTS,
  bagCapacity,
  caravanBagSlots,
  MOUNT_SPEED,
  PET_BAG,
  PET_SALE_RATE,
  PET_SPEED,
  TENT_HEAL,
  memberGear,
  mountSpeed,
  petBag,
  petSaleRate,
  petSpeed,
  petTier,
  tentHealing,
  MONSTERS,
  objectiveTarget,
  partyGold,
  PERSONAL_BAG_SIZE,
  questAvailability,
  questTargetSite,
  shopItem,
  SKILLS,
  unlockProblem,
  type RingSchool,
  spendableGold,
  tradeCity,
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

function petInfo(state: PartyState, world: WorldDef): PartySummary['pet'] {
  const tier = petTier(state);
  const trip = state.pet?.trip;
  return {
    equipped: tier > 0,
    tier,
    capacity: tier ? petBag(tier) : 0,
    saleRate: tier ? petSaleRate(tier) : 0,
    speed: tier ? petSpeed(tier) : 0,
    abilities: state.caravan?.pet?.caravan?.abilities ?? [],
    trip: trip
      ? {
          phase: trip.phase,
          city: world.sites[trip.cityId]?.name ?? trip.cityId,
          items: trip.phase === 'out' ? trip.items.length : 0,
          buying: trip.shopping.length,
          arriveAt: trip.arriveAt,
          endsAt: trip.returnAt,
        }
      : null,
    waiting: state.pet?.waiting ?? [],
  };
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
  const city = tradeCity(state, world);

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
        schools: Object.entries(memberSchools(m)).map(([id, level]) => ({
          id,
          name: RING_NAMES[id as RingSchool] ?? id,
          level: level ?? 0,
          max: MAX_RING_SCHOOL_LEVEL,
        })),
        skillLevels: Object.fromEntries(
          Object.entries(m.skillLevels).map(([id, level]) => {
            const node = SKILL_TREE[id];
            const cost = node ? levelUpCost(node, level) : 0;
            return [id, { level, xp: m.skillXp[id] ?? 0, next: cost > 0 ? cost : null }];
          }),
        ),
        equipped: m.equipped,
        equipLimit: equippedLimit(state.level),
        locked: Object.values(SKILL_TREE).flatMap((n) => {
          // Skills of schools the character has, that it cannot learn yet.
          const why = unlockProblem(m, state.level, n);
          const open = n.schools.some((sc) => memberSchoolLevel(m, sc) > 0);
          return why && open && !m.skills.includes(n.id) && !/starting skill/.test(why)
            ? [{ skill: n.id, missing: why }]
            : [];
        }),
        ai: m.ai,
      };
    }),
    bag: state.bag,
    pendingItems: state.pendingItems ?? [],
    bagSize: bagCapacity(state, { bagSize: DEFAULT_BAG_SIZE }),
    personalBagSize: PERSONAL_BAG_SIZE,
    caravan: state.caravan ?? {},
    caravanEffects: {
      mountSpeed: mountSpeed(state),
      bagSlots: caravanBagSlots(state),
      tentHealing: tentHealing(state),
    },
    caravanTiers: {
      mountSpeed: [...MOUNT_SPEED],
      bagSlots: [...BAG_SLOTS],
      tentHealing: [...TENT_HEAL],
      petSaleRate: [...PET_SALE_RATE],
      petBag: [...PET_BAG],
      petSpeed: [...PET_SPEED],
    },
    pet: petInfo(state, world),
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
  const fromCombat = Object.values(SKILLS).map((s): SkillInfo => {
    const node = SKILL_TREE[s.id];
    return {
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
      schools: node ? [...node.schools] : [],
      ...(node?.bookOnly ? { bookOnly: true } : {}),
      usable: true,
      ...(s.weapons ? { weapons: s.weapons } : {}),
      ...(s.status
        ? { status: { id: s.status.id, kind: s.status.kind, duration: s.status.duration } }
        : {}),
    };
  });
  // Skills of the tree without a combat definition yet: the masteries (passive), the summons and Dash.
  const fromTree = Object.values(SKILL_TREE)
    .filter((n) => !SKILLS[n.id])
    .map((n): SkillInfo => ({
      id: n.id,
      name: n.name,
      kind: 'status',
      source: 'spell',
      damageType: null,
      attr: 'int',
      power: 0,
      range: 0,
      manaCost: 0,
      cooldown: 0,
      side: 'self',
      schools: [...n.schools],
      ...(n.passive ? { passive: true } : {}),
      usable: false,
    }));
  return [...fromCombat, ...fromTree];
}

/** The map and sites, without anything the player should not know yet. */
export function publicWorld(world: WorldDef): WorldInfo {
  return {
    id: world.id,
    width: world.width,
    height: world.height,
    terrain: world.terrain,
    overlay: world.overlay,
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
