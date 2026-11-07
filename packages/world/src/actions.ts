import { SKILLS } from './skills.ts';
import {
  MOVE_MODES,
  TARGET_ORDERS,
  WEAPON_ATTACK,
  type AIRule,
  type Attributes,
} from '@game/engine';
import { hexDistance, siteAt } from './hex.ts';
import { canControl, spendableGold, spendGold, splitGold } from './gold.ts';
import { bookProblem } from './learning.ts';
import { addToBag, bagCapacity, gearOf } from './loot.ts';
import { ATTRS, CLASSES, memberDerived, spentPoints, unmetRequirements } from './progression.ts';
import { activeQuest, MAX_ACTIVE_QUESTS, newProgress, questAvailability } from './quests.ts';
import {
  PERSONAL_BAG_SIZE,
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

// ---------- gear and bags ----------

/** Where an item is: the shared bag, a member's personal bag, or a member's worn slot. */
export type ItemPlace =
  | { kind: 'bag' }
  | { kind: 'personal'; memberId: string }
  | { kind: 'equip'; memberId: string; slot: Slot };

/** Where an item can be put. An `equip` target without a slot uses the item's own slot. */
export type ItemTarget =
  | { kind: 'bag' }
  | { kind: 'personal'; memberId: string }
  | { kind: 'equip'; memberId: string; slot?: Slot };

function locate(p: PartyState, itemId: string): { item: Item; place: ItemPlace } | null {
  const shared = p.bag.find((i) => i.id === itemId);
  if (shared) return { item: shared, place: { kind: 'bag' } };
  for (const m of p.members) {
    const mine = m.bag.find((i) => i.id === itemId);
    if (mine) return { item: mine, place: { kind: 'personal', memberId: m.id } };
    for (const slot of SLOTS) {
      const worn = m.equipment[slot];
      if (worn?.id === itemId)
        return { item: worn, place: { kind: 'equip', memberId: m.id, slot } };
    }
  }
  return null;
}

const NOT_YOURS = 'That character is not yours';

/** Shared things belong to everyone; a personal bag or worn slot belongs to its character. */
function placeIsYours(p: PartyState, place: ItemPlace, viewer?: string): boolean {
  if (place.kind === 'bag') return true;
  const m = findMember(p, place.memberId);
  return !m || canControl(m, viewer);
}

/** The character exists and the viewer may act for it. */
function ownMember(p: PartyState, memberId: string, viewer?: string): Member | ActionResult {
  const m = findMember(p, memberId);
  if (!m) return fail('no_member', 'No such party member');
  if (!canControl(m, viewer)) return fail('not_yours', NOT_YOURS);
  return m;
}
const isFail = (r: Member | ActionResult): r is ActionResult => 'ok' in r;

function container(p: PartyState, place: ItemPlace): Item[] | null {
  if (place.kind === 'bag') return p.bag;
  if (place.kind === 'personal') return findMember(p, place.memberId)?.bag ?? null;
  return null;
}

function removeFrom(p: PartyState, from: ItemPlace, item: Item) {
  if (from.kind === 'equip') {
    delete findMember(p, from.memberId)!.equipment[from.slot];
    return;
  }
  const list = container(p, from)!;
  list.splice(list.indexOf(item), 1);
}

const ATTR_NAMES = {
  str: 'Strength',
  dex: 'Dexterity',
  int: 'Intelligence',
  vit: 'Vitality',
  wis: 'Wisdom',
};

/** Why `m` cannot wear `item` in `slot` right now (requirements, hands), or null if it can. */
function cannotWear(p: PartyState, m: Member, item: Item, slot: Slot): ActionResult | null {
  const unmet = unmetRequirements(m, p.level, item);
  if (unmet.length) {
    const text = unmet.map((u) => `${u.need} ${ATTR_NAMES[u.attr]} (has ${u.have})`).join(', ');
    return fail('requirements', `${m.name} needs ${text}`);
  }
  if (slot === 'weapon' && item.hands === 2 && m.equipment.offhand) {
    return fail('two_handed', 'A two-handed weapon needs a free off hand');
  }
  if (slot === 'offhand' && m.equipment.weapon?.hands === 2) {
    return fail('two_handed', 'The two-handed weapon takes both hands');
  }
  return null;
}

/**
 * Moves an item between the shared bag, personal bags and worn slots. Wearing an item over another
 * one swaps them: the old item goes where the new one came from (and into the other member's slot
 * when two members trade gear). Rejected moves change nothing.
 */
export function moveItem(
  p: PartyState,
  itemId: string,
  to: ItemTarget,
  cfg: Pick<SimConfig, 'bagSize'>,
  viewer?: string,
): ActionResult {
  const found = locate(p, itemId);
  if (!found) return fail('no_item', 'No such item');
  const { item, place: from } = found;

  const owner = to.kind === 'bag' ? null : findMember(p, to.memberId);
  if (to.kind !== 'bag' && !owner) return fail('no_member', 'No such party member');
  // Both ends must be the viewer's own: you cannot take from or hand things to someone else's gear.
  if (!placeIsYours(p, from, viewer) || (owner && !canControl(owner, viewer)))
    return fail('not_yours', NOT_YOURS);

  if (to.kind === 'equip') {
    if (!item.slot) return fail('not_equippable', 'That item cannot be worn');
    const slot = to.slot ?? item.slot;
    if (slot !== item.slot) return fail('wrong_slot', 'That item does not go in that slot');
    if (from.kind === 'equip' && from.memberId === to.memberId) return OK;
    const old = owner!.equipment[slot];
    const blocked = cannotWear(p, owner!, item, slot);
    if (blocked) return blocked;
    if (old && from.kind === 'equip') {
      const other = cannotWear(p, findMember(p, from.memberId)!, old, from.slot);
      if (other) return other;
    }
    removeFrom(p, from, item);
    owner!.equipment[slot] = item;
    if (old) {
      if (from.kind === 'equip') findMember(p, from.memberId)!.equipment[from.slot] = old;
      else container(p, from)!.push(old);
    }
    clampVitals(p, owner!);
    if (from.kind === 'equip') clampVitals(p, findMember(p, from.memberId)!);
    return OK;
  }

  const dest = container(p, to)!;
  if (from.kind !== 'equip' && dest === container(p, from)) return OK;
  const cap = to.kind === 'bag' ? bagCapacity(p, cfg) : PERSONAL_BAG_SIZE;
  if (dest.length >= cap) {
    return to.kind === 'bag'
      ? fail('bag_full', 'The bag is full')
      : fail('personal_full', 'That personal bag is full');
  }
  removeFrom(p, from, item);
  dest.push(item);
  if (from.kind === 'equip') clampVitals(p, findMember(p, from.memberId)!);
  return OK;
}

/** Wears an item from any bag on a member (swapping with what is worn). */
export function equipItem(
  p: PartyState,
  memberId: string,
  itemId: string,
  viewer?: string,
): ActionResult {
  const found = locate(p, itemId);
  if (!found || found.place.kind === 'equip') return fail('no_item', 'That item is not in a bag');
  if (!findMember(p, memberId)) return fail('no_member', 'No such party member');
  return moveItem(p, itemId, { kind: 'equip', memberId }, { bagSize: 0 }, viewer);
}

export function unequipItem(
  p: PartyState,
  memberId: string,
  slot: Slot,
  cfg: Pick<SimConfig, 'bagSize'>,
  viewer?: string,
): ActionResult {
  const m = findMember(p, memberId);
  if (!m) return fail('no_member', 'No such party member');
  if (!canControl(m, viewer)) return fail('not_yours', NOT_YOURS);
  if (!SLOTS.includes(slot)) return fail('bad_slot', 'Unknown slot');
  const item = m.equipment[slot];
  if (!item) return fail('empty_slot', 'Nothing is worn there');
  return moveItem(p, item.id, { kind: 'bag' }, cfg, viewer);
}

/** Reads a skill book: the character learns the skill and the book is used up. */
export function learnFromBook(
  p: PartyState,
  memberId: string,
  itemId: string,
  viewer?: string,
): ActionResult {
  const m = ownMember(p, memberId, viewer);
  if (isFail(m)) return m;
  const found = locate(p, itemId);
  if (!found || found.place.kind === 'equip') return fail('no_item', 'That item is not in a bag');
  if (!placeIsYours(p, found.place, viewer)) return fail('not_yours', NOT_YOURS);
  if (!found.item.teaches) return fail('not_a_book', 'That is not a skill book');
  const problem = bookProblem(m, found.item);
  if (problem) return fail('cannot_learn', problem);
  m.skills.push(found.item.teaches);
  const school = SKILLS[found.item.teaches]?.school;
  if (school) m.schools[school] ??= 0;
  removeFrom(p, found.place, found.item);
  return OK;
}

export function setFavorite(
  p: PartyState,
  itemId: string,
  favorite: boolean,
  viewer?: string,
): ActionResult {
  const found = locate(p, itemId);
  if (!found) return fail('no_item', 'That item is not in a bag');
  if (!placeIsYours(p, found.place, viewer)) return fail('not_yours', NOT_YOURS);
  found.item.favorite = favorite;
  return OK;
}

export function discardItem(p: PartyState, itemId: string, viewer?: string): ActionResult {
  const found = locate(p, itemId);
  if (!found || found.place.kind === 'equip') return fail('no_item', 'That item is not in a bag');
  if (!placeIsYours(p, found.place, viewer)) return fail('not_yours', NOT_YOURS);
  if (found.item.favorite) return fail('favorite', 'Remove the favorite mark first');
  removeFrom(p, found.place, found.item);
  return OK;
}

/** Sorts the shared bag: favorites first, then rarity, item level, slot and name. */
export function sortBag(p: PartyState): ActionResult {
  const rank = { epic: 3, rare: 2, uncommon: 1, common: 0 } as const;
  const slotOrder = (i: Item) => (i.slot ? SLOTS.indexOf(i.slot) : SLOTS.length);
  p.bag.sort(
    (a, b) =>
      Number(b.favorite) - Number(a.favorite) ||
      rank[b.rarity] - rank[a.rarity] ||
      b.itemLevel - a.itemLevel ||
      slotOrder(a) - slotOrder(b) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
  return OK;
}

// ---------- attribute points ----------

/** Spends unspent points: `add` maps attributes to how many more points to put in. */
export function allocatePoints(
  p: PartyState,
  memberId: string,
  add: Partial<Attributes>,
  viewer?: string,
): ActionResult {
  const m = ownMember(p, memberId, viewer);
  if (isFail(m)) return m;
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

export function setAutoAlloc(
  p: PartyState,
  memberId: string,
  auto: boolean,
  viewer?: string,
): ActionResult {
  const m = ownMember(p, memberId, viewer);
  if (isFail(m)) return m;
  m.autoAlloc = auto;
  return OK;
}

/** Takes all spent points back so they can be placed again (free for now). */
export function resetPoints(p: PartyState, memberId: string, viewer?: string): ActionResult {
  const m = ownMember(p, memberId, viewer);
  if (isFail(m)) return m;
  m.points += spentPoints(m);
  for (const k of ATTRS) m.alloc[k] = 0;
  clampVitals(p, m);
  return OK;
}

// ---------- combat AI ----------

export const MAX_AI_RULES = 16;
const ORDERS = new Set<string>(TARGET_ORDERS);
const MODES = new Set<string>(MOVE_MODES);

const isPct = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const isName = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 30;

const FILTER_PCTS = ['hpBelowPct', 'hpAbovePct'] as const;
const FILTER_NAMES = ['lacksStatus', 'hasStatus'] as const;
const WHEN_PCTS = [
  'selfHpBelowPct',
  'selfHpAbovePct',
  'selfManaAbovePct',
  'selfManaBelowPct',
] as const;
const WHEN_NAMES = ['selfHasStatus', 'selfLacksStatus'] as const;

/** Returns a message if the rules are not acceptable, or null. */
export function validateAiRules(rules: unknown, known: readonly string[]): string | null {
  if (!Array.isArray(rules)) return 'Rules must be a list';
  if (rules.length > MAX_AI_RULES) return `At most ${MAX_AI_RULES} rules`;
  for (const [i, r] of rules.entries()) {
    const at = `Rule ${i + 1}`;
    if (!r || typeof r !== 'object') return `${at} is not valid`;
    const rule = r as AIRule;
    if (rule.skill !== WEAPON_ATTACK) {
      if (typeof rule.skill !== 'string' || !SKILLS[rule.skill]) return `${at}: unknown skill`;
      if (!known.includes(rule.skill)) return `${at}: this character does not know ${rule.skill}`;
    }
    if (rule.order !== undefined && !ORDERS.has(rule.order)) return `${at}: unknown target order`;
    const f = rule.filter;
    if (f !== undefined) {
      if (typeof f !== 'object' || f === null) return `${at}: bad filter`;
      for (const k of FILTER_PCTS) {
        if (f[k] !== undefined && !isPct(f[k])) return `${at}: percentages are 0 to 100`;
      }
      for (const k of FILTER_NAMES) {
        if (f[k] !== undefined && !isName(f[k])) return `${at}: bad status`;
      }
      if (f.fullHealth !== undefined && typeof f.fullHealth !== 'boolean')
        return `${at}: bad filter`;
    }
    const w = rule.when;
    if (w !== undefined) {
      if (typeof w !== 'object' || w === null) return `${at}: bad condition`;
      for (const k of WHEN_PCTS) {
        if (w[k] !== undefined && !isPct(w[k])) return `${at}: percentages are 0 to 100`;
      }
      for (const k of WHEN_NAMES) {
        if (w[k] !== undefined && !isName(w[k])) return `${at}: bad status`;
      }
      if (w.enemyAdjacent !== undefined && typeof w.enemyAdjacent !== 'boolean')
        return `${at}: bad condition`;
      const n = w.enemiesAtLeast;
      if (n !== undefined && !(Number.isInteger(n) && n >= 1 && n <= 12))
        return `${at}: enemy count is 1 to 12`;
    }
    const mv = rule.move;
    if (mv !== undefined) {
      if (typeof mv !== 'object' || mv === null) return `${at}: bad move`;
      if (mv.when !== 'before' && mv.when !== 'after') return `${at}: a move goes before or after`;
      if (!MODES.has(mv.mode)) return `${at}: unknown move`;
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
    for (const k of FILTER_PCTS) if (r.filter[k] !== undefined) f[k] = r.filter[k];
    for (const k of FILTER_NAMES) if (r.filter[k]) f[k] = r.filter[k];
    if (r.filter.fullHealth) f.fullHealth = true;
    if (Object.keys(f).length) out.filter = f;
  }
  if (r.when) {
    const w: NonNullable<AIRule['when']> = {};
    for (const k of WHEN_PCTS) if (r.when[k] !== undefined) w[k] = r.when[k];
    for (const k of WHEN_NAMES) if (r.when[k]) w[k] = r.when[k];
    if (r.when.enemyAdjacent !== undefined) w.enemyAdjacent = r.when.enemyAdjacent;
    if (r.when.enemiesAtLeast !== undefined) w.enemiesAtLeast = r.when.enemiesAtLeast;
    if (Object.keys(w).length) out.when = w;
  }
  if (r.move) out.move = { when: r.move.when, mode: r.move.mode };
  return out;
}

export function setMemberAi(
  p: PartyState,
  memberId: string,
  rules: unknown,
  viewer?: string,
): ActionResult {
  const m = ownMember(p, memberId, viewer);
  if (isFail(m)) return m;
  const problem = validateAiRules(rules, m.skills);
  if (problem) return fail('bad_rules', problem);
  m.ai = (rules as AIRule[]).map(cleanRule);
  return OK;
}

export function resetMemberAi(p: PartyState, memberId: string, viewer?: string): ActionResult {
  const m = ownMember(p, memberId, viewer);
  if (isFail(m)) return m;
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

export function sellItems(
  p: PartyState,
  world: WorldDef,
  itemIds: string[],
  viewer?: string,
): ActionResult {
  if (!usableCity(p, world)) return fail('not_in_city', 'The party is not in a city');
  const ids = new Set(itemIds);
  if (ids.size === 0) return fail('no_item', 'Nothing selected');
  const lists = [p.bag, ...p.members.map((m) => m.bag)];
  const chosen = lists.flatMap((l) => l.filter((i) => ids.has(i.id)));
  if (chosen.length !== ids.size) return fail('no_item', 'Some items are not in a bag');
  if (chosen.some((i) => i.favorite)) return fail('favorite', 'Favorites cannot be sold');
  const others = p.members.filter((m) => !canControl(m, viewer));
  if (others.some((m) => m.bag.some((i) => ids.has(i.id)))) return fail('not_yours', NOT_YOURS);
  // The money is shared by every character, rounded down.
  splitGold(
    p.members,
    chosen.reduce((s, i) => s + sellPrice(i), 0),
  );
  p.bag = p.bag.filter((i) => !ids.has(i.id));
  for (const m of p.members) m.bag = m.bag.filter((i) => !ids.has(i.id));
  return OK;
}

export function buyItem(
  p: PartyState,
  world: WorldDef,
  stockId: string,
  cfg: Pick<SimConfig, 'bagSize'>,
  viewer?: string,
): ActionResult {
  const city = usableCity(p, world);
  if (!city) return fail('not_in_city', 'The party is not in a city');
  const stock = city.shop?.find((s) => s.id === stockId);
  if (!stock) return fail('no_stock', 'The shop does not sell that');
  if (spendableGold(p, viewer) < stock.price) return fail('no_gold', 'Not enough gold');
  if (p.bag.length >= bagCapacity(p, cfg)) return fail('bag_full', 'The bag is full');
  p.counter += 1;
  spendGold(p, viewer, stock.price);
  const item: Item = {
    id: `b${p.counter}_${stock.id}`,
    name: stock.name,
    rarity: stock.rarity,
    itemLevel: stock.itemLevel,
    value: stock.value,
    favorite: false,
    slot: stock.slot,
    bonuses: { ...stock.bonuses },
    ...gearOf(stock),
  };
  addToBag(p.bag, item, bagCapacity(p, cfg));
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
  viewer?: string,
): ActionResult {
  const here = usableCity(p, world);
  if (!here) return fail('not_in_city', 'The party is not in a city');
  const option = teleportOptions(p, world, cfg).find((o) => o.siteId === siteId);
  if (!option)
    return fail('no_destination', 'You can only teleport to other cities you have visited');
  if (spendableGold(p, viewer) < option.cost) return fail('no_gold', 'Not enough gold');
  const dest = world.sites[siteId]!;
  spendGold(p, viewer, option.cost);
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

/** Gives gold from one of the viewer's characters to any character in the party. */
export function sendGold(
  p: PartyState,
  fromId: string,
  toId: string,
  amount: number,
  viewer?: string,
): ActionResult {
  const from = findMember(p, fromId);
  const to = findMember(p, toId);
  if (!from || !to) return fail('no_member', 'No such character');
  if (!canControl(from, viewer)) return fail('not_yours', 'That character is not yours');
  if (from.id === to.id) return fail('bad_target', 'Pick another character');
  if (!Number.isInteger(amount) || amount < 1) return fail('bad_amount', 'Send at least 1 gold');
  if (from.gold < amount) return fail('no_gold', 'Not enough gold');
  from.gold -= amount;
  to.gold += amount;
  return OK;
}
