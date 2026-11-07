import type { CaravanItemInfo, PartySummary } from '@game/shared';

const pct = (v: number | undefined) => `${Math.round((v ?? 0) * 100)}%`;

/** What a caravan accessory does, from the tier tables the server sends with the party. */
export function caravanEffect(c: CaravanItemInfo, tiers: PartySummary['caravanTiers']): string {
  const i = c.tier - 1;
  switch (c.kind) {
    case 'mount':
      return `+${pct(tiers.mountSpeed[i])} travel speed`;
    case 'bag':
      return `+${tiers.bagSlots[i]} shared bag slots`;
    case 'tent':
      return `+${pct(tiers.tentHealing[i])} faster recovery`;
    case 'pet': {
      const abilities =
        c.abilities?.map((a) => (a === 'scavenger' ? 'may find items' : 'fast return')) ?? [];
      return [
        `carries ${tiers.petBag[i]} items`,
        `sells for ${pct(tiers.petSaleRate[i])} of the price`,
        `speed x${tiers.petSpeed[i]}`,
        ...abilities,
      ].join(' · ');
    }
  }
}
