import { type CombatEvent } from '@game/engine';
import { describe, expect, it } from 'vitest';
import { isUsable, trainFromFight } from '../src/learning.ts';
import { starterGear } from '../src/loot.ts';
import { CLASSES, createMember } from '../src/progression.ts';
import { CLASS_START_SKILLS } from '../src/skill-tree.ts';
import { SKILLS } from '../src/skills.ts';
import type { ClassId } from '../src/types.ts';

const ids = Object.keys(CLASSES) as ClassId[];

describe('the eleven classes of the sheet', () => {
  it('are all there, with the ids the sprites use', () => {
    expect([...ids].sort()).toEqual(
      [
        'barbarian',
        'druid',
        'mage',
        'necromancer',
        'paladin',
        'priest',
        'ranger',
        'rogue',
        'shaman',
        'warlock',
        'warrior',
      ].sort(),
    );
    for (const id of ids) {
      expect(CLASSES[id].id).toBe(id);
      expect(id).toMatch(/^[a-z]+$/);
    }
    expect(Object.keys(CLASS_START_SKILLS).sort()).toEqual([...ids].sort());
  });

  it.each(ids)(
    'a %s starts with its skills from the sheet, the basic Attack and a real kit',
    (id) => {
      const cls = CLASSES[id];
      expect(cls.skills).toEqual(['attack', ...CLASS_START_SKILLS[id]!]);
      const gear = starterGear(cls.kit, 'm1', 1);
      expect(gear.weapon).toBeDefined();
      expect(gear.weapon!.weapon!.max).toBeGreaterThan(0);
      const m = createMember(0, { name: 'X', race: 'human', cls: id });
      expect(m.hp).toBeGreaterThan(0);
      expect(m.mana).toBeGreaterThanOrEqual(0);
      // Everything the default AI uses is carried (or the basic Attack).
      for (const rule of cls.ai) {
        if (rule.skill !== 'attack')
          expect(m.equipped, `${id}: ${rule.skill}`).toContain(rule.skill);
      }
    },
  );

  it('start with the weapon the sheet gives them', () => {
    const kind = (id: ClassId) => {
      const g = starterGear(CLASSES[id].kit, 'm', 1).weapon!;
      return `${g.kind}/${g.hands}`;
    };
    expect(kind('warrior')).toBe('sword/1');
    expect(kind('barbarian')).toBe('axe/2'); // two handed; dual wield comes with its engine feature
    expect(kind('paladin')).toBe('hammer/2'); // a two handed mace
    expect(kind('priest')).toBe('mace/1');
    for (const id of ['mage', 'warlock', 'necromancer', 'shaman', 'druid'] as const) {
      expect(kind(id), id).toBe('staff/2');
    }
    expect(kind('ranger')).toBe('bow/2');
    expect(kind('rogue')).toBe('dagger/1');
  });

  it('can fight on day one, except that summoners wait for their summons', () => {
    for (const id of ids) {
      const m = createMember(0, { name: 'X', race: 'human', cls: id });
      const usable = m.equipped.filter((s) => isUsable(s));
      if (id === 'necromancer') {
        // Summon Skeleton is not usable yet, so only the staff strike is left.
        expect(usable).toEqual([]);
        expect(m.skills).toContain('summon_skeleton');
        expect(isUsable('summon_skeleton')).toBe(false);
      } else {
        expect(usable.length, id).toBeGreaterThan(0);
      }
      expect(m.skills).toContain('attack');
    }
  });

  it('weapon masteries train from the weapon the class starts with', () => {
    const use = (unit: string, skill: string): CombatEvent[] => [
      { t: 'skill', unit, skill, target: 'x', x: 0, y: 0, vfx: null },
      {
        t: 'damage',
        target: 'x',
        source: unit,
        skill,
        amount: 25,
        crit: false,
        hp: 0,
        type: 'cut',
        resist: 0,
      },
    ];
    const barb = createMember(0, { name: 'B', race: 'orc', cls: 'barbarian' });
    trainFromFight([barb], use(barb.id, 'axe_slash'), 1);
    expect(barb.skillXp.axe_two_handed_mastery).toBe(25);
    expect(barb.skillXp.axe_dual_wield_mastery ?? 0).toBe(0);
    const pal = createMember(0, { name: 'P', race: 'human', cls: 'paladin' });
    trainFromFight([pal], use(pal.id, 'blunt_strike'), 1);
    expect(pal.skillXp.mace_two_handed_mastery).toBe(25);
    expect(SKILLS.blunt_strike!.weapons).toContain('hammer');
  });
});
