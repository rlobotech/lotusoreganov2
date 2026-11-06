import type { PartySummary, PublicUser, WorldInfo } from '@game/shared';
import { api, ApiError } from './api.ts';

/** Who is logged in and what they are playing. Shared by every screen. */
export const session = $state<{
  status: 'loading' | 'anon' | 'ready';
  user: PublicUser | null;
  party: PartySummary | null;
  world: WorldInfo | null;
}>({ status: 'loading', user: null, party: null, world: null });

async function loadGame() {
  session.world ??= await api.world();
  session.party = (await api.myParty()).party;
}

/** Called once at startup: restores the session from the cookie if there is one. */
export async function boot() {
  try {
    const { user } = await api.me();
    session.user = user;
    await loadGame();
    session.status = 'ready';
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      session.status = 'anon';
      return;
    }
    throw err;
  }
}

export async function signedIn(user: PublicUser) {
  session.user = user;
  await loadGame();
  session.status = 'ready';
}

export async function refreshParty() {
  session.party = (await api.myParty()).party;
}

export async function logout() {
  await api.logout().catch(() => undefined);
  session.user = null;
  session.party = null;
  session.status = 'anon';
}
