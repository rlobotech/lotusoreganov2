import { runCombat, type CombatEvent } from '@game/engine';
import { describe, expect, it } from 'vitest';
import { ARENAS } from '../src/arenas.ts';
import { createMember } from '../src/progression.ts';
import { learnSkill, trainFromFight } from '../src/learning.ts';
import { skeletonLimit, summonLimitsOf } from '../src/skill-levels.ts';
import { advance, createParty, defaultConfig, memberUnit } from '../src/sim.ts';
import { SKILLS } from '../src/skills.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import { MONSTERS, monsterUnit } from '../src/monsters.ts';

function party(classes: Array<'warlock' | 'necromancer' | 'warrior' | 'priest'>) {
  return createParty({
    id: 'p',
    name: 'T',
    seed: 1,
    now: 0,
    world: W,
    members: classes.map((cls, i) => ({ name: `${cls}${i}`, race: 'human' as const, cls })),
  });
}

describe('the summon skills', () => {
  it('are defined: the imp is a demon, the skeleton a skeleton, each with its own skill', () => {
    const imp = SKILLS.summon_imp!;
    const skel = SKILLS.summon_skeleton!;
    expect(imp.kind).toBe('summon');
    expect(imp.summon!.group).toBe('demon');
    expect(skel.summon!.group).toBe('skeleton');
    for (const s of [imp, skel]) {
      expect(s.side).toBe('self');
      expect(s.manaCost).toBeGreaterThan(0);
      for (const id of s.summon!.skills) expect(SKILLS[id], id).toBeDefined();
      for (const rule of s.summon!.ai) expect(s.summon!.skills).toContain(rule.skill);
    }
    expect(skel.summon!.weapon).toBeDefined();
  });

  it('give one demon always, and skeletons one, two from Necromancy Mastery 4 and three from 8', () => {
    expect(skeletonLimit(0)).toBe(1);
    expect(skeletonLimit(1)).toBe(1);
    expect(skeletonLimit(3)).toBe(1);
    expect(skeletonLimit(4)).toBe(2);
    expect(skeletonLimit(7)).toBe(2);
    expect(skeletonLimit(8)).toBe(3);
    expect(skeletonLimit(10)).toBe(3);
    const m = createMember(0, { name: 'N', race: 'human', cls: 'necromancer' });
    expect(summonLimitsOf(m)).toEqual({ demon: 1, skeleton: 1 });
    m.skillLevels.necromancy_mastery = 8;
    expect(summonLimitsOf(m)).toEqual({ demon: 1, skeleton: 3 });
    // The limits go to the combat unit.
    const p = party(['necromancer', 'warrior']);
    p.members[0]!.skillLevels.necromancy_mastery = 4;
    expect(memberUnit(p, p.members[0]!).summonLimits).toEqual({ demon: 1, skeleton: 2 });
  });
});

describe('summons in a fight', () => {
  const fightOf = (cls: 'warlock' | 'necromancer', level = 5) => {
    const p = party([cls, 'warrior']);
    p.level = level;
    const monsters = [
      monsterUnit(MONSTERS.ice_golem!, 'e1', level),
      monsterUnit(MONSTERS.ice_golem!, 'e2', level),
    ];
    const result = runCombat({
      seed: 11,
      arena: ARENAS.clearing!,
      units: [
        ...p.members.map((m) => memberUnit(p, m)),
        ...monsters.map((u) => ({ ...u, hp: undefined, mana: undefined })),
      ],
      skills: SKILLS,
    });
    return { p, result };
  };
  const summoned = (events: CombatEvent[]) =>
    events.filter((e): e is Extract<CombatEvent, { t: 'summon' }> => e.t === 'summon');

  it('a warlock calls an imp that fights beside the party', () => {
    const { result } = fightOf('warlock');
    const [s] = summoned(result.events);
    expect(s).toMatchObject({ name: 'Imp', team: 'party', caster: 'm1', sprite: 'imp' });
    expect(result.events.some((e) => e.t === 'damage' && e.source === s!.unit)).toBe(true);
  });

  it('a necromancer calls a skeleton, and only one at first', () => {
    const { result } = fightOf('necromancer');
    const out = summoned(result.events).filter((e) => e.name === 'Skeleton');
    expect(out.length).toBeGreaterThanOrEqual(1);
    // One at a time while the limit is one: a new one comes only after the first fell.
    let alive = 0;
    let max = 0;
    for (const e of result.events) {
      if (e.t === 'summon') alive += 1;
      if (e.t === 'death' && e.unit.includes('~')) alive -= 1;
      max = Math.max(max, alive);
    }
    expect(max).toBe(1);
  });

  it('a higher Necromancy Mastery lets more skeletons stand at once', () => {
    const p = party(['necromancer', 'warrior']);
    const m = p.members[0]!;
    p.level = 20;
    m.skillLevels.necromancy_mastery = 8;
    m.alloc.int += 80; // enough mana to call all of them
    const monsters = [
      monsterUnit(MONSTERS.ice_golem!, 'e1', 5),
      monsterUnit(MONSTERS.ice_golem!, 'e2', 5),
    ];
    const result = runCombat({
      seed: 4,
      arena: ARENAS.clearing!,
      units: [...p.members.map((x) => memberUnit(p, x)), ...monsters],
      skills: SKILLS,
    });
    let alive = 0;
    let max = 0;
    for (const e of result.events) {
      if (e.t === 'summon') alive += 1;
      if (e.t === 'death' && e.unit.includes('~')) alive -= 1;
      max = Math.max(max, alive);
    }
    expect(max).toBeGreaterThan(1);
    expect(max).toBeLessThanOrEqual(3);
  });

  it('are stronger with a higher skill level and school level', () => {
    const imp = (level: number) => {
      const p = party(['warlock', 'warrior']);
      p.members[0]!.skillLevels.summon_imp = level;
      p.members[0]!.skillLevels.demonology_mastery = level;
      return memberUnit(p, p.members[0]!).skillMods?.summon_imp?.power ?? 0;
    };
    expect(imp(10)).toBeGreaterThan(imp(1) * 1.4);
  });
});

describe('summons in the game', () => {
  const cfg = { ...defaultConfig(60_000), maxSteps: 4000 };

  it('a party with a warlock plays on: summons do not count as members, and the skill trains', () => {
    const p = party(['warlock', 'warrior', 'priest']);
    p.activity = { kind: 'start' };
    p.nextAt = 0;
    const r = advance(p, 6 * 3600_000, W, cfg);
    const fights = r.events.filter((e) => e.kind === 'fight');
    expect(fights.length).toBeGreaterThan(3);
    // Nobody but the three characters is in the party, and summons are never listed as fallen.
    expect(r.party.members).toHaveLength(3);
    for (const e of fights) {
      for (const name of (e.payload as { fallen?: string[] }).fallen ?? []) {
        expect(name).not.toMatch(/Imp|Skeleton/);
      }
    }
    // Calling imps trains Summon Imp (by uses) and Demonology Mastery.
    const lock = r.party.members[0]!;
    expect((lock.skillXp.summon_imp ?? 0) > 0 || (lock.skillLevels.summon_imp ?? 1) > 1).toBe(true);
    expect(r.party.stats.wins).toBeGreaterThan(0);
  }, 60_000);

  it('using a summon skill trains it and its mastery', () => {
    const m = createMember(0, { name: 'N', race: 'human', cls: 'necromancer' });
    learnSkill(m, 1, 'necromancy_mastery');
    const events: CombatEvent[] = [
      { t: 'skill', unit: m.id, skill: 'summon_skeleton', target: m.id, x: 0, y: 0, vfx: 'buff' },
    ];
    trainFromFight([m], events, 1);
    expect(m.skillXp.summon_skeleton).toBe(1);
    expect(m.skillXp.necromancy_mastery).toBe(1);
  });
});
