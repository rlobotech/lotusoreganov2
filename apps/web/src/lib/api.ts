import type {
  FeedPage,
  LoginInput,
  PartySummary,
  PublicUser,
  RegisterInput,
  ReplayListEntry,
  WorldInfo,
  OrderInfo,
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

  addOrder: (partyId: string, siteId: string) =>
    request<{ orders: OrderInfo[] }>('POST', `/parties/${partyId}/orders`, { siteId }),
  removeOrder: (partyId: string, orderId: string) =>
    request<{ orders: OrderInfo[] }>('DELETE', `/parties/${partyId}/orders/${orderId}`),
};
