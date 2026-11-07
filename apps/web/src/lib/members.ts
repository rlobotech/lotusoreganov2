import type { MemberInfo } from '@game/shared';

/** The viewer's own characters come first, in their party order; everyone else follows. */
export function mineFirst<T extends Pick<MemberInfo, 'mine'>>(members: readonly T[]): T[] {
  return [...members.filter((m) => m.mine), ...members.filter((m) => !m.mine)];
}
