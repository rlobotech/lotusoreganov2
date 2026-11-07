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

/**
 * Pays `cost` for a purchase made by `viewer` when a sale is being shared out at the same time
 * (`shares` is each character's even share of the sale, in member order). The shares of the
 * characters the viewer controls pay first; the rest comes from the viewer's spendable gold.
 * Returns false and changes nothing when that is not enough. On success `shares` holds what is
 * still to be paid out to each character.
 */
export function payWithShares(
  p: Pick<PartyState, 'members'>,
  shares: number[],
  cost: number,
  viewer: string | undefined,
): boolean {
  const mine = p.members.map((m, i) => (canControl(m, viewer) ? i : -1)).filter((i) => i >= 0);
  let fromSale = Math.min(
    cost,
    mine.reduce((s, i) => s + shares[i]!, 0),
  );
  const fromGold = cost - fromSale;
  if (fromGold > spendableGold(p, viewer)) return false;
  for (const i of mine) {
    const use = Math.min(fromSale, shares[i]!);
    shares[i]! -= use;
    fromSale -= use;
  }
  spendGold(p, viewer, fromGold);
  return true;
}
