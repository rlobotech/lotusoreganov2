import type { Member, PartyState } from './types.ts';

/**
 * Gold belongs to characters. A "viewer" is the user acting; leaving it out means no ownership
 * check (rules code and tests). A character without an owner can be used by anyone.
 */
export const canControl = (m: Pick<Member, 'ownerId'>, viewer?: string): boolean =>
  viewer === undefined || m.ownerId === undefined || m.ownerId === viewer;

/** The characters a viewer controls. Solo, that is everyone; in multiplayer, only their own. */
export const controlled = (p: Pick<PartyState, 'members'>, viewer?: string): Member[] =>
  p.members.filter((m) => canControl(m, viewer));

/** Gold the viewer can spend. */
export const spendableGold = (p: Pick<PartyState, 'members'>, viewer?: string): number =>
  controlled(p, viewer).reduce((s, m) => s + m.gold, 0);

/** All gold carried by the party. */
export const partyGold = (p: Pick<PartyState, 'members'>): number =>
  p.members.reduce((s, m) => s + m.gold, 0);

/** Shares `amount` evenly (rounded down); the remainder goes to the first character. */
export function splitGold(members: Member[], amount: number): void {
  if (members.length === 0 || amount <= 0) return;
  const each = Math.floor(amount / members.length);
  for (const m of members) m.gold += each;
  members[0]!.gold += amount - each * members.length;
}

/**
 * Takes `amount` from the characters the viewer controls, richest first. Returns false (and
 * changes nothing) when they cannot cover it.
 */
export function spendGold(
  p: Pick<PartyState, 'members'>,
  viewer: string | undefined,
  amount: number,
) {
  if (amount <= 0) return true;
  if (spendableGold(p, viewer) < amount) return false;
  let left = amount;
  for (const m of [...controlled(p, viewer)].sort((a, b) => b.gold - a.gold)) {
    const take = Math.min(m.gold, left);
    m.gold -= take;
    left -= take;
    if (left === 0) break;
  }
  return true;
}
