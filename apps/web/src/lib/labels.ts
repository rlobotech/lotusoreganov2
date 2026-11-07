import {
  WEAPON_ATTACK_ID,
  type AiRuleInfo,
  type AttrMap,
  type AttrName,
  type ItemInfo,
  type SkillInfo,
  type SlotName,
} from '@game/shared';

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
  nearest: 'closest',
  farthest: 'farthest',
  crowded: 'most crowded (most friends around it)',
  lowest_hp: 'lowest health',
  highest_hp: 'highest health',
  lowest_hp_pct: 'lowest health %',
  strongest: 'strongest (most Strength)',
  least_armor: 'least armor (lowest resistances)',
};

export const MOVE_LABELS: Record<NonNullable<AiRuleInfo['move']>['mode'], string> = {
  toward: 'move closer to the target',
  away: 'step away from enemies',
  range: 'keep distance but stay in reach',
  stay: 'hold position',
};

export const STATUS_LABELS: Record<string, string> = {
  poison: 'Poison',
  stun: 'Stun',
  war_cry: 'War Cry',
};

/** A plain-language summary of one rule, e.g. "Heal an ally (lowest health % first) with health below 75%". */
export function describeRule(rule: AiRuleInfo, skills: SkillInfo[]): string {
  const weapon = rule.skill === WEAPON_ATTACK_ID;
  const skill = skills.find((s) => s.id === rule.skill);
  const name = weapon ? 'Weapon attack' : (skill?.name ?? rule.skill);
  const self = !weapon && skill?.side === 'self';
  const who = self ? 'yourself' : !weapon && skill?.side === 'ally' ? 'an ally' : 'an enemy';
  const status = (id: string) => STATUS_LABELS[id] ?? id;
  const bits: string[] = [];
  const f = rule.filter;
  if (!self) {
    if (f?.fullHealth) bits.push('full health');
    if (f?.hpBelowPct !== undefined) bits.push(`health below ${f.hpBelowPct}%`);
    if (f?.hpAbovePct !== undefined) bits.push(`health above ${f.hpAbovePct}%`);
    if (f?.lacksStatus) bits.push(`without ${status(f.lacksStatus)}`);
    if (f?.hasStatus) bits.push(`with ${status(f.hasStatus)}`);
  }
  const w = rule.when;
  const mine: string[] = [];
  if (w?.selfHpBelowPct !== undefined) mine.push(`your health is below ${w.selfHpBelowPct}%`);
  if (w?.selfHpAbovePct !== undefined) mine.push(`your health is above ${w.selfHpAbovePct}%`);
  if (w?.selfManaAbovePct !== undefined) mine.push(`your mana is above ${w.selfManaAbovePct}%`);
  if (w?.selfManaBelowPct !== undefined) mine.push(`your mana is below ${w.selfManaBelowPct}%`);
  if (w?.selfHasStatus) mine.push(`you have ${status(w.selfHasStatus)}`);
  if (w?.selfLacksStatus) mine.push(`you lack ${status(w.selfLacksStatus)}`);
  if (w?.enemyAdjacent !== undefined) {
    mine.push(w.enemyAdjacent ? 'an enemy is next to you' : 'no enemy is next to you');
  }
  if (w?.enemiesAtLeast !== undefined) mine.push(`at least ${w.enemiesAtLeast} enemies remain`);
  const pick = !self ? ` (${ORDER_LABELS[rule.order ?? 'nearest'].split(' (')[0]} first)` : '';
  let text = `${name} on ${who}`;
  if (bits.length) text += ` with ${bits.join(' and ')}`;
  text += pick;
  if (mine.length) text += `, only when ${mine.join(' and ')}`;
  if (rule.move)
    text += `; ${rule.move.when === 'before' ? 'first' : 'then'} ${MOVE_LABELS[rule.move.mode]}`;
  return text;
}

export function itemLine(i: ItemInfo): string {
  return `${i.name} (L${i.itemLevel}) ${fmtBonuses(i.bonuses)}`.trim();
}
