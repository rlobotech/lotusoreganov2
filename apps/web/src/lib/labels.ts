import type { AiRuleInfo, AttrMap, AttrName, ItemInfo, SkillInfo, SlotName } from '@game/shared';

export const ATTRS: AttrName[] = ['str', 'dex', 'int', 'vit', 'wis'];
export const ATTR_LABELS: Record<AttrName, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  int: 'Intelligence',
  vit: 'Vitality',
  wis: 'Wisdom',
};
export const ATTR_HINTS: Record<AttrName, string> = {
  str: 'Physical attack and defense',
  dex: 'Speed, crit and dodge',
  int: 'Magic power and mana',
  vit: 'Health and defense',
  wis: 'Mana, regeneration and magic defense',
};

export const SLOTS: SlotName[] = ['weapon', 'offhand', 'head', 'body', 'feet', 'ring', 'charm'];
export const SLOT_LABELS: Record<SlotName, string> = {
  weapon: 'Weapon',
  offhand: 'Off-hand',
  head: 'Head',
  body: 'Body',
  feet: 'Feet',
  ring: 'Ring',
  charm: 'Charm',
};

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "+3 STR, +1 DEX" */
export function fmtBonuses(b: Partial<AttrMap> | undefined): string {
  if (!b) return '';
  return ATTRS.filter((k) => b[k])
    .map((k) => `+${b[k]} ${k.toUpperCase()}`)
    .join(', ');
}

export const ORDER_LABELS: Record<NonNullable<AiRuleInfo['order']>, string> = {
  nearest: 'nearest',
  lowest_hp: 'lowest health',
  highest_hp: 'highest health',
  lowest_hp_pct: 'lowest health %',
};

export const STATUS_LABELS: Record<string, string> = {
  poison: 'Poison',
  stun: 'Stun',
  war_cry: 'War Cry',
};

/** A plain-language summary of one rule, e.g. "Heal the ally with the lowest health % (below 75%)". */
export function describeRule(rule: AiRuleInfo, skills: SkillInfo[]): string {
  const skill = skills.find((s) => s.id === rule.skill);
  const name = skill?.name ?? rule.skill;
  const who = skill?.side === 'self' ? 'yourself' : skill?.side === 'ally' ? 'an ally' : 'an enemy';
  const bits: string[] = [];
  const f = rule.filter;
  if (skill && skill.side !== 'self') {
    if (f?.hpBelowPct !== undefined) bits.push(`health below ${f.hpBelowPct}%`);
    if (f?.hpAbovePct !== undefined) bits.push(`health above ${f.hpAbovePct}%`);
    if (f?.lacksStatus) bits.push(`without ${STATUS_LABELS[f.lacksStatus] ?? f.lacksStatus}`);
    if (f?.hasStatus) bits.push(`with ${STATUS_LABELS[f.hasStatus] ?? f.hasStatus}`);
  }
  const w = rule.when;
  const mine: string[] = [];
  if (w?.selfHpBelowPct !== undefined) mine.push(`your health is below ${w.selfHpBelowPct}%`);
  if (w?.selfManaAbovePct !== undefined) mine.push(`your mana is above ${w.selfManaAbovePct}%`);
  if (w?.selfManaBelowPct !== undefined) mine.push(`your mana is below ${w.selfManaBelowPct}%`);
  const pick =
    skill && skill.side !== 'self' ? ` (${ORDER_LABELS[rule.order ?? 'nearest']} first)` : '';
  let text = `${name} on ${who}`;
  if (bits.length) text += ` with ${bits.join(' and ')}`;
  text += pick;
  if (mine.length) text += `, only when ${mine.join(' and ')}`;
  return text;
}

export function itemLine(i: ItemInfo): string {
  return `${i.name} (L${i.itemLevel}) ${fmtBonuses(i.bonuses)}`.trim();
}
