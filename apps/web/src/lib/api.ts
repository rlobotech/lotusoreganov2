import type {
  AiRuleInfo,
  AttrMap,
  CaravanKindName,
  CityInfo,
  FeedPage,
  LoginInput,
  OrderInfo,
  PetShopInfo,
  PartySummary,
  PublicUser,
  QuestInfo,
  RegisterInput,
  ReplayListEntry,
  SkillInfo,
  SlotName,
  WorldInfo,
} from '@game/shared';
import type { CombatEvent } from '@game/engine';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** All calls go through /api, which the dev server (and later the reverse proxy) maps to the API. */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const code = (data as { error?: string } | null)?.error ?? 'error';
    const message =
      (data as { message?: string } | null)?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, code, message);
  }
  return data as T;
}

export interface ReplayDetail {
  id: number;
  title: string;
  outcome: string;
  pinned: boolean;
  engineVersion: string;
  logFormatVersion: number;
  events: CombatEvent[];
}

export interface CreatePartyBody {
  name: string;
  mode: 'standard' | 'hardcore';
  members: Array<{ name: string; race: string; cls: string }>;
}

export const api = {
  me: () => request<{ user: PublicUser }>('GET', '/auth/me'),
  login: (b: LoginInput) => request<{ user: PublicUser }>('POST', '/auth/login', b),
  register: (b: RegisterInput) => request<{ user: PublicUser }>('POST', '/auth/register', b),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),

  world: () => request<WorldInfo>('GET', '/world'),
  myParty: () => request<{ party: PartySummary | null }>('GET', '/parties/me'),
  createParty: (b: CreatePartyBody) => request<{ party: PartySummary }>('POST', '/parties', b),

  feed: (partyId: string, after?: number, limit = 500) =>
    request<FeedPage>(
      'GET',
      `/parties/${partyId}/feed?limit=${limit}${after === undefined ? '' : `&after=${after}`}`,
    ),
  markSeen: (partyId: string, upTo: number) =>
    request<{ lastSeen: number }>('POST', `/parties/${partyId}/feed/seen`, { upTo }),

  replays: (partyId: string) =>
    request<{ replays: ReplayListEntry[] }>('GET', `/parties/${partyId}/replays`),
  replay: (id: number) => request<ReplayDetail>('GET', `/replays/${id}`),

  skills: () => request<{ skills: SkillInfo[] }>('GET', '/content/skills'),

  quests: (partyId: string) =>
    request<{ quests: QuestInfo[] }>('GET', `/parties/${partyId}/quests`),
  acceptQuest: (partyId: string, questId: string) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/quests/${questId}/accept`),
  abandonQuest: (partyId: string, questId: string) =>
    request<{ party: PartySummary }>('DELETE', `/parties/${partyId}/quests/${questId}`),

  // management: every call answers with the fresh party summary
  equip: (partyId: string, memberId: string, itemId: string) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/equip`, { memberId, itemId }),
  equipCaravan: (partyId: string, itemId: string) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/caravan/equip`, { itemId }),
  unequipCaravan: (partyId: string, kind: CaravanKindName) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/caravan/unequip`, { kind }),
  petShop: (partyId: string) => request<PetShopInfo>('GET', `/parties/${partyId}/pet/shop`),
  sendPet: (partyId: string, itemIds: string[], stockIds: string[]) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/pet/send`, { itemIds, stockIds }),
  learn: (partyId: string, memberId: string, itemId: string) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/learn`, { memberId, itemId }),
  unequip: (partyId: string, memberId: string, slot: SlotName) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/unequip`, { memberId, slot }),
  moveItem: (
    partyId: string,
    itemId: string,
    to:
      | { kind: 'bag' }
      | { kind: 'personal'; memberId: string }
      | { kind: 'equip'; memberId: string; slot?: SlotName },
  ) => request<{ party: PartySummary }>('POST', `/parties/${partyId}/move`, { itemId, to }),
  sendGold: (partyId: string, fromId: string, toId: string, amount: number) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/gold/send`, {
      fromId,
      toId,
      amount,
    }),
  sortBag: (partyId: string) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/sort-bag`),
  favorite: (partyId: string, itemId: string, value: boolean) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/items/${itemId}/favorite`, {
      value,
    }),
  discard: (partyId: string, itemId: string) =>
    request<{ party: PartySummary }>('DELETE', `/parties/${partyId}/items/${itemId}`),
  allocate: (partyId: string, memberId: string, alloc: Partial<AttrMap>) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/members/${memberId}/allocate`, {
      alloc,
    }),
  autoAlloc: (partyId: string, memberId: string, auto: boolean) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/members/${memberId}/auto-alloc`, {
      auto,
    }),
  resetPoints: (partyId: string, memberId: string) =>
    request<{ party: PartySummary }>(
      'POST',
      `/parties/${partyId}/members/${memberId}/reset-points`,
    ),
  setAi: (partyId: string, memberId: string, rules: AiRuleInfo[]) =>
    request<{ party: PartySummary }>('PUT', `/parties/${partyId}/members/${memberId}/ai`, {
      rules,
    }),
  resetAi: (partyId: string, memberId: string) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/members/${memberId}/ai/reset`),
  moveOrder: (partyId: string, orderId: string, dir: -1 | 1) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/orders/${orderId}/move`, { dir }),

  city: (partyId: string) => request<CityInfo>('GET', `/parties/${partyId}/city`),
  sell: (partyId: string, itemIds: string[]) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/city/sell`, { itemIds }),
  buy: (partyId: string, stockId: string) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/city/buy`, { stockId }),
  teleport: (partyId: string, siteId: string) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/city/teleport`, { siteId }),
  leaveTown: (partyId: string) =>
    request<{ party: PartySummary }>('POST', `/parties/${partyId}/town/leave`),

  addOrder: (partyId: string, siteId: string) =>
    request<{ orders: OrderInfo[] }>('POST', `/parties/${partyId}/orders`, { siteId }),
  removeOrder: (partyId: string, orderId: string) =>
    request<{ orders: OrderInfo[] }>('DELETE', `/parties/${partyId}/orders/${orderId}`),
};
