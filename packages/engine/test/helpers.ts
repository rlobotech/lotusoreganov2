import { derive } from '../src/stats.ts';
import type { AIRule, ArenaDef, Point, SkillDef, Team, UnitDef, UnitState } from '../src/types.ts';

export const attrs = { str: 10, dex: 5, int: 10, vit: 10, wis: 10 };

export function unitDef(
  id: string,
  team: Team,
  skills: string[],
  ai: AIRule[],
  over: Partial<UnitDef> = {},
): UnitDef {
  return { id, name: id, team, level: 5, attributes: attrs, move: 3, skills, ai, ...over };
}

export function stateOf(
  def: UnitDef,
  x: number,
  y: number,
  over: Partial<UnitState> = {},
): UnitState {
  const base = derive(def.attributes, def.level, def.move);
  return {
    def,
    id: def.id,
    team: def.team,
    x,
    y,
    hp: base.maxHp,
    mana: base.maxMana,
    alive: true,
    base,
    cooldowns: {},
    statuses: [],
    ...over,
  };
}

export function openArena(width: number, height: number, blocked: Point[] = []): ArenaDef {
  const col = (x: number) => Array.from({ length: height }, (_, y) => ({ x, y }));
  return {
    id: 'test',
    width,
    height,
    blocked,
    spawns: { party: col(0), enemy: col(width - 1) },
  };
}

export const melee: SkillDef = {
  id: 'attack',
  name: 'Attack',
  kind: 'damage',
  damageType: 'physical',
  power: 10,
  range: 1,
  manaCost: 0,
  cooldown: 0,
  side: 'enemy',
};
export const bolt: SkillDef = {
  id: 'bolt',
  name: 'Bolt',
  kind: 'damage',
  damageType: 'magical',
  power: 10,
  range: 5,
  manaCost: 0,
  cooldown: 0,
  side: 'enemy',
};
export const heal: SkillDef = {
  id: 'heal',
  name: 'Heal',
  kind: 'heal',
  damageType: 'magical',
  power: 10,
  range: 4,
  manaCost: 5,
  cooldown: 0,
  side: 'ally',
};
export const bigHeal: SkillDef = {
  id: 'big_heal',
  name: 'Big Heal',
  kind: 'heal',
  damageType: 'magical',
  power: 20,
  range: 4,
  manaCost: 10,
  cooldown: 0,
  side: 'ally',
};
export const nuke: SkillDef = {
  id: 'nuke',
  name: 'Nuke',
  kind: 'damage',
  damageType: 'magical',
  power: 30,
  range: 5,
  manaCost: 5,
  cooldown: 3,
  side: 'enemy',
};
