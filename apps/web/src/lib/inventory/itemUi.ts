import type {
  AttrName,
  DamageRange,
  DamageTypeName,
  GearInfo,
  ItemInfo,
  SlotName,
} from '@game/shared';
import { ATTRS } from '../labels.ts';

/** Where an item can be dropped. Matches the `move` endpoint of the API. */
export type DropTarget =
  | { kind: 'bag' }
  | { kind: 'personal'; memberId: string }
  | { kind: 'equip'; memberId: string; slot?: SlotName };

/** Where an item currently is (an equip place always knows its slot). */
export type ItemPlace =
  | { kind: 'bag' }
  | { kind: 'personal'; memberId: string }
  | { kind: 'equip'; memberId: string; slot: SlotName };

export const RARITY_COLORS: Record<ItemInfo['rarity'], string> = {
  common: '#8a8494',
  uncommon: '#5ab85a',
  rare: '#4a8ae0',
  epic: '#b070f0',
};

/** One letter per slot for the placeholder icons, until the real item sprites exist. */
export const SLOT_GLYPHS: Record<SlotName, string> = {
  weapon: 'W',
  offhand: 'O',
  head: 'H',
  body: 'B',
  feet: 'F',
  ring: 'R',
  charm: 'C',
};

/** "Rusty Sword" -> "rusty-sword". */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Where the 32x32 sprite of an item lives. A missing file falls back to the placeholder. */
export function spriteUrl(item: Pick<ItemInfo, 'name'>): string {
  return `/sprites/items/${slug(item.name)}.png`;
}

export interface BonusDiff {
  attr: AttrName;
  /** Bonus of the item being looked at. */
  value: number;
  /** Change against the worn item: positive is better. Absent when there is nothing to compare. */
  diff?: number;
}

/** The attribute lines of an item, each with its difference against the item worn in that slot. */
export function compareItems(item: ItemInfo, worn?: ItemInfo | null): BonusDiff[] {
  const out: BonusDiff[] = [];
  for (const attr of ATTRS) {
    const value = item.bonuses?.[attr] ?? 0;
    const other = worn?.bonuses?.[attr] ?? 0;
    if (!value && !other) continue;
    out.push(worn ? { attr, value, diff: value - other } : { attr, value });
  }
  return out;
}

/** Can this item be dropped on that target? (Bags take anything, slots only their own kind.) */
export function canDrop(
  item: Pick<ItemInfo, 'slot'> & Partial<Pick<ItemInfo, 'hands'>>,
  target: DropTarget,
): boolean {
  if (target.kind !== 'equip') return true;
  if (!item.slot) return false;
  // A one-handed weapon may also go in the off hand (dual wielding).
  if (target.slot === 'offhand' && item.slot === 'weapon' && item.hands === 1) return true;
  return target.slot === undefined || target.slot === item.slot;
}

/** Is dropping the item where it already is? Such drops do nothing. */
export function samePlace(from: ItemPlace, to: DropTarget): boolean {
  if (from.kind === 'bag') return to.kind === 'bag';
  if (from.kind === 'personal') return to.kind === 'personal' && to.memberId === from.memberId;
  return to.kind === 'equip' && to.memberId === from.memberId;
}

export function encodeTarget(t: DropTarget): string {
  return JSON.stringify(t);
}

/** Reads a `data-drop` attribute back; anything unexpected is not a target. */
export function decodeTarget(raw: string | null | undefined): DropTarget | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as DropTarget;
    if (t.kind === 'bag') return t;
    if ((t.kind === 'personal' || t.kind === 'equip') && typeof t.memberId === 'string') return t;
  } catch {
    /* not ours */
  }
  return null;
}

/** Whole-pixel icon size that fits `room` pixels, in multiples of the 32px sprite where possible. */
export function iconSize(room: number): number {
  if (room >= 64) return 64;
  if (room >= 48) return 48;
  if (room >= 32) return 32;
  return Math.max(16, Math.floor(room / 8) * 8);
}

export const DAMAGE_LABELS: Record<DamageTypeName, string> = {
  piercing: 'Piercing',
  smash: 'Smash',
  cut: 'Cut',
  blood: 'Blood',
  fire: 'Fire',
  water: 'Water',
  electric: 'Electric',
  earth: 'Earth',
  dark: 'Dark',
  light: 'Light',
};

export const DAMAGE_TYPE_ORDER = Object.keys(DAMAGE_LABELS) as DamageTypeName[];

const range = (d: DamageRange) => `${d.min}-${d.max} ${DAMAGE_LABELS[d.type].toLowerCase()}`;

/** The combat lines of an item: weapon damage, extra damage, resistances and requirements. */
export function gearLines(g: GearInfo): string[] {
  const out: string[] = [];
  if (g.weapon) {
    const hands = g.hands === 2 ? 'two-handed' : 'one-handed';
    out.push(`${range(g.weapon)} damage · ${hands}${g.kind ? ` ${g.kind}` : ''}`);
  }
  for (const e of g.extra ?? []) out.push(`+${range(e)} damage`);
  const res = DAMAGE_TYPE_ORDER.filter((t) => g.resist?.[t]).map(
    (t) => `${DAMAGE_LABELS[t]} ${g.resist![t]}`,
  );
  if (res.length) out.push(`Resists ${res.join(', ')}`);
  const need = ATTRS.filter((a) => g.requires?.[a]).map(
    (a) => `${g.requires![a]} ${a.toUpperCase()}`,
  );
  if (need.length) out.push(`Needs ${need.join(', ')}`);
  return out;
}
