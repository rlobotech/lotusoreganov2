import type { AIRule, Attributes } from '@game/engine';
import { hexDistance, siteAt } from './hex.ts';
import { addToBag } from './loot.ts';
import { ATTRS, CLASSES, memberDerived, SKILLS, spentPoints } from './progression.ts';
import { activeQuest, MAX_ACTIVE_QUESTS, newProgress, questAvailability } from './quests.ts';
import {
  SLOTS,
  type FeedEvent,
  type Item,
  type Member,
  type PartyState,
  type SimConfig,
  type SiteDef,
  type Slot,
  type WorldDef,
} from './types.ts';

/**
 * Player actions on a party. Each one validates first and only then changes the state, so a
 * rejected action leaves the party untouched. The server runs them on the locked party row.
 */
export type ActionResult =
  { ok: true; events?: FeedEvent[] } | { ok: false; code: string; error: string };

const fail = (code: string, error: string): ActionResult => ({ ok: false, code, error });
const OK: ActionResult = { ok: true };

function findMember(p: PartyState, id: string): Member | null {
  return p.members.find((m) => m.id === id) ?? null;
}

/** Keeps health and mana within the (possibly changed) maximum. */
function clampVitals(p: PartyState, m: Member) {
  const d = memberDerived(m, p.level);
  m.hp = Math.min(m.hp, d.maxHp);
  m.mana = Math.min(m.mana, d.maxMana);
}

// ---------- gear ----------

export function equipItem(p: PartyState, memberId: string, itemId: string): ActionResult {
  const m = findMember(p, memberId);
  if (!m) return fail('no_member', 'No such party member');
  const idx = p.bag.findIndex((i) => i.id === itemId);
  if (idx === -1) return fail('no_item', 'That item is not in the bag');
  const item = p.bag[idx]!;
  if (!item.slot) return fail('not_equippable', 'That item cannot be worn');
  const old = m.equipment[item.slot];
  m.equipment[item.slot] = item;
  p.bag.splice(idx, 1);
  if (old) p.bag.push(old);
  clampVitals(p, m);
  return OK;
}

export function unequipItem(
  p: PartyState,
  memberId: string,
  slot: Slot,
  cfg: Pick<SimConfig, 'bagSize'>,
): ActionResult {
  const m = findMember(p, memberId);
  if (!m) return fail('no_member', 'No such party member');
  if (!SLOTS.includes(slot)) return fail('bad_slot', 'Unknown slot');
  const item = m.equipment[slot];
  if (!item) return fail('empty_slot', 'Nothing is worn there');
  if (p.bag.length >= cfg.bagSize) return fail('bag_full', 'The bag is full');
  delete m.equipment[slot];
  p.bag.push(item);
  clampVitals(p, m);
  return OK;
}

export function setFavorite(p: PartyState, itemId: string, favorite: boolean): ActionResult {
  const item = p.bag.find((i) => i.id === itemId);
  if (!item) return fail('no_item', 'That item is not in the bag');
  item.favorite = favorite;
  return OK;
}

export function discardItem(p: PartyState, itemId: string): ActionResult {
  const idx = p.bag.findIndex((i) => i.id === itemId);
  if (idx === -1) return fail('no_item', 'That item is not in the bag');
  if (p.bag[idx]!.favorite) return fail('favorite', 'Remove the favorite mark first');
  p.bag.splice(idx, 1);
  return OK;
}

// ---------- attribute points ----------

/** Spends unspent points: `add` maps attributes to how many more points to put in. */
export function allocatePoints(
  p: PartyState,
  memberId: string,
  add: Partial<Attributes>,
): ActionResult {
  const m = findMember(p, memberId);
  if (!m) return fail('no_member', 'No such party member');
  let total = 0;
  for (const [k, v] of Object.entries(add)) {
    if (!ATTRS.includes(k as keyof Attributes))
      return fail('bad_attribute', `Unknown attribute ${k}`);
    if (!Number.isInteger(v) || (v as number) < 0)
      return fail('bad_amount', 'Points must be whole numbers');
    total += v as number;
  }
  if (total === 0) return fail('bad_amount', 'Nothing to spend');
  if (total > m.points) return fail('not_enough_points', 'Not enough unspent points');
  for (const k of ATTRS) m.alloc[k] += add[k] ?? 0;
  m.points -= total;
  clampVitals(p, m);
  return OK;
}

export function setAutoAlloc(p: PartyState, memberId: string, auto: boolean): ActionResult {
  const m = findMember(p, memberId);
  if (!m) return fail('no_member', 'No such party member');
  m.autoAlloc = auto;
  return OK;
}

/** Takes all spent points back so they can be placed again (free for now). */
export function resetPoints(p: PartyState, memberId: string): ActionResult {
  const m = findMember(p, memberId);
  if (!m) return fail('no_member', 'No such party member');
  m.points += spentPoints(m);
  for (const k of ATTRS) m.alloc[k] = 0;
  clampVitals(p, m);
  return OK;
}

// ---------- combat AI ----------

export const MAX_AI_RULES = 16;
const ORDERS = new Set(['nearest', 'lowest_hp', 'highest_hp', 'lowest_hp_pct']);

const isPct = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

/** Returns a message if the rules are not acceptable, or null. */
export function validateAiRules(rules: unknown, known: readonly string[]): string | null {
  if (!Array.isArray(rules)) return 'Rules must be a list';
  if (rules.length > MAX_AI_RULES) return `At most ${MAX_AI_RULES} rules`;
  for (const [i, r] of rules.entries()) {
    const at = `Rule ${i + 1}`;
    if (!r || typeof r !== 'object') return `${at} is not valid`;
    const rule = r as AIRule;
    if (typeof rule.skill !== 'string' || !SKILLS[rule.skill]) return `${at}: unknown skill`;
    if (!known.includes(rule.skill)) return `${at}: this character does not know ${rule.skill}`;
    if (rule.order !== undefined && !ORDERS.has(rule.order)) return `${at}: unknown target order`;
    const f = rule.filter;
    if (f !== undefined) {
      if (typeof f !== 'object' || f === null) return `${at}: bad filter`;
      if (f.hpBelowPct !== undefined && !isPct(f.hpBelowPct))
        return `${at}: percentages are 0 to 100`;
      if (f.hpAbovePct !== undefined && !isPct(f.hpAbovePct))
        return `${at}: percentages are 0 to 100`;
      for (const s of [f.lacksStatus, f.hasStatus]) {
        if (s !== undefined && (typeof s !== 'string' || s.length > 30)) return `${at}: bad status`;
      }
    }
    const w = rule.when;
    if (w !== undefined) {
      if (typeof w !== 'object' || w === null) return `${at}: bad condition`;
      for (const v of [w.selfHpBelowPct, w.selfManaAbovePct, w.selfManaBelowPct]) {
        if (v !== undefined && !isPct(v)) return `${at}: percentages are 0 to 100`;
      }
    }
  }
  return null;
}

/** Keeps only the fields the engine understands, so nothing unexpected is stored. */
function cleanRule(r: AIRule): AIRule {
  const out: AIRule = { skill: r.skill };
  if (r.order) out.order = r.order;
  if (r.filter) {
    const f: NonNullable<AIRule['filter']> = {};
    if (r.filter.hpBelowPct !== undefined) f.hpBelowPct = r.filter.hpBelowPct;
    if (r.filter.hpAbovePct !== undefined) f.hpAbovePct = r.filter.hpAbovePct;
    if (r.filter.lacksStatus) f.lacksStatus = r.filter.lacksStatus;
    if (r.filter.hasStatus) f.hasStatus = r.filter.hasStatus;
    if (Object.keys(f).length) out.filter = f;
  }
  if (r.when) {
    const w: NonNullable<AIRule['when']> = {};
    if (r.when.selfHpBelowPct !== undefined) w.selfHpBelowPct = r.when.selfHpBelowPct;
    if (r.when.selfManaAbovePct !== undefined) w.selfManaAbovePct = r.when.selfManaAbovePct;
    if (r.when.selfManaBelowPct !== undefined) w.selfManaBelowPct = r.when.selfManaBelowPct;
    if (Object.keys(w).length) out.when = w;
  }
  return out;
}

export function setMemberAi(p: PartyState, memberId: string, rules: unknown): ActionResult {
  const m = findMember(p, memberId);
  if (!m) return fail('no_member', 'No such party member');
  const problem = validateAiRules(rules, m.skills);
  if (problem) return fail('bad_rules', problem);
  m.ai = (rules as AIRule[]).map(cleanRule);
  return OK;
}

export function resetMemberAi(p: PartyState, memberId: string): ActionResult {
  const m = findMember(p, memberId);
  if (!m) return fail('no_member', 'No such party member');
  m.ai = structuredClone(CLASSES[m.cls].ai);
  return OK;
}

// ---------- orders ----------

export function moveOrder(p: PartyState, orderId: string, dir: -1 | 1): ActionResult {
  const i = p.orders.findIndex((o) => o.id === orderId);
  if (i === -1) return fail('no_order', 'Order not found');
  const j = i + dir;
  if (j < 0 || j >= p.orders.length) return OK;
  [p.orders[i], p.orders[j]] = [p.orders[j]!, p.orders[i]!];
  return OK;
}

export const MAX_ORDERS = 10;

/** Adds a "go to" order after checking the place exists and may be visited. */
export function addGotoOrder(
  p: PartyState,
  world: WorldDef,
  siteId: string,
  orderId: string,
  now: number,
): ActionResult {
  const site = world.sites[siteId];
  if (!site) return fail('no_site', 'No such place');
  if (p.status !== 'active') return fail('party_dead', 'The party has fallen');
  if (p.orders.length >= MAX_ORDERS) return fail('too_many_orders', 'Order queue is full');
  if (p.orders.some((o) => o.kind === 'goto' && o.siteId === siteId)) {
    return fail('duplicate_order', 'Already ordered');
  }
  if (site.requiresQuest && !activeQuest(p, site.requiresQuest) && !p.cleared.includes(site.id)) {
    const q = world.quests[site.requiresQuest];
    return fail('quest_required', `Take the quest "${q?.name ?? site.requiresQuest}" first`);
  }
  p.orders.push({ id: orderId, kind: 'goto', siteId });
  wakeFromTown(p, now);
  return OK;
}

// ---------- quests ----------

export function acceptQuest(
  p: PartyState,
  world: WorldDef,
  questId: string,
  orderId: string,
  now: number,
): ActionResult {
  const def = world.quests[questId];
  if (!def) return fail('no_quest', 'No such quest');
  if (p.status !== 'active') return fail('party_dead', 'The party has fallen');
  const a = questAvailability(p, world, def);
  if (a.status === 'active') return fail('already_active', 'That quest is already active');
  if (a.status === 'completed') return fail('already_done', 'That quest is already completed');
  if (a.status === 'locked') return fail('quest_locked', a.reason ?? 'Not available yet');
  if (p.quests.active.length >= MAX_ACTIVE_QUESTS) {
    return fail('too_many_quests', `At most ${MAX_ACTIVE_QUESTS} active quests`);
  }
  if (p.orders.length >= MAX_ORDERS) return fail('too_many_orders', 'Order queue is full');
  p.quests.active.push(newProgress(def));
  p.orders.push({ id: orderId, kind: 'quest', questId });
  wakeFromTown(p, now);
  return OK;
}

export function abandonQuest(p: PartyState, questId: string): ActionResult {
  if (!activeQuest(p, questId)) return fail('no_quest', 'That quest is not active');
  p.quests.active = p.quests.active.filter((q) => q.id !== questId);
  p.orders = p.orders.filter((o) => !(o.kind === 'quest' && o.questId === questId));
  return OK;
}

/** A party waiting in town starts moving again as soon as it gets new orders. */
export function wakeFromTown(p: PartyState, now: number): void {
  if (p.activity.kind === 'town' && p.status === 'active') p.nextAt = now;
}

export function leaveTown(p: PartyState, now: number): ActionResult {
  if (p.activity.kind !== 'town') return fail('not_in_town', 'The party is not waiting in town');
  p.nextAt = now;
  return OK;
}

// ---------- city ----------

/** The city the party is standing in and can use, or null (travelling, fighting, in the wild). */
export function usableCity(p: PartyState, world: WorldDef): SiteDef | null {
  if (p.status !== 'active') return null;
  if (!['town', 'rest', 'start'].includes(p.activity.kind)) return null;
  const site = siteAt(world, p.pos);
  return site && site.kind === 'city' ? site : null;
}

export function sellPrice(item: Item): number {
  return item.value;
}

export function sellItems(p: PartyState, world: WorldDef, itemIds: string[]): ActionResult {
  if (!usableCity(p, world)) return fail('not_in_city', 'The party is not in a city');
  const ids = new Set(itemIds);
  if (ids.size === 0) return fail('no_item', 'Nothing selected');
  const chosen = p.bag.filter((i) => ids.has(i.id));
  if (chosen.length !== ids.size) return fail('no_item', 'Some items are not in the bag');
  if (chosen.some((i) => i.favorite)) return fail('favorite', 'Favorites cannot be sold');
  p.gold += chosen.reduce((s, i) => s + sellPrice(i), 0);
  p.bag = p.bag.filter((i) => !ids.has(i.id));
  return OK;
}

export function buyItem(
  p: PartyState,
  world: WorldDef,
  stockId: string,
  cfg: Pick<SimConfig, 'bagSize'>,
): ActionResult {
  const city = usableCity(p, world);
  if (!city) return fail('not_in_city', 'The party is not in a city');
  const stock = city.shop?.find((s) => s.id === stockId);
  if (!stock) return fail('no_stock', 'The shop does not sell that');
  if (p.gold < stock.price) return fail('no_gold', 'Not enough gold');
  if (p.bag.length >= cfg.bagSize) return fail('bag_full', 'The bag is full');
  p.counter += 1;
  p.gold -= stock.price;
  const item: Item = {
    id: `b${p.counter}_${stock.id}`,
    name: stock.name,
    rarity: stock.rarity,
    itemLevel: stock.itemLevel,
    value: stock.value,
    favorite: false,
    slot: stock.slot,
    bonuses: { ...stock.bonuses },
  };
  addToBag(p.bag, item, cfg.bagSize);
  return OK;
}

export interface TeleportOption {
  siteId: string;
  name: string;
  cost: number;
}

export function teleportOptions(p: PartyState, world: WorldDef, cfg: SimConfig): TeleportOption[] {
  const here = usableCity(p, world);
  if (!here) return [];
  return p.visited
    .filter((id) => id !== here.id && world.sites[id]?.kind === 'city')
    .map((id) => {
      const site = world.sites[id]!;
      return {
        siteId: id,
        name: site.name,
        cost: cfg.teleportBaseCost + cfg.teleportCostPerHex * hexDistance(here, site),
      };
    });
}

export function teleport(
  p: PartyState,
  world: WorldDef,
  cfg: SimConfig,
  siteId: string,
  now: number,
): ActionResult {
  const here = usableCity(p, world);
  if (!here) return fail('not_in_city', 'The party is not in a city');
  const option = teleportOptions(p, world, cfg).find((o) => o.siteId === siteId);
  if (!option)
    return fail('no_destination', 'You can only teleport to other cities you have visited');
  if (p.gold < option.cost) return fail('no_gold', 'Not enough gold');
  const dest = world.sites[siteId]!;
  p.gold -= option.cost;
  p.pos = { col: dest.col, row: dest.row };
  p.lastCity = dest.id;
  p.dungeon = null;
  p.activity = { kind: 'town', startedAt: now, ticks: cfg.teleportTicks };
  p.nextAt = now + cfg.teleportTicks * cfg.tickMs;
  return {
    ok: true,
    events: [
      { at: now, kind: 'teleport', payload: { from: here.name, to: dest.name, cost: option.cost } },
    ],
  };
}
