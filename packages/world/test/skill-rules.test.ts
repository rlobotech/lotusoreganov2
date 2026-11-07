import { describe, expect, it } from 'vitest';
import {
  addSkillXp,
  BASE_COST,
  equipProblem,
  equippedLimit,
  equipSkill,
  learnable,
  levelUpCost,
  newSkillState,
  schoolLevelOf,
  schoolPower,
  skillLevelOf,
  skillSchoolPower,
  statusBonusRounds,
  trainingFor,
  trainSkills,
  unequipSkill,
  unlockLevel,
  unmetSkillRequirements,
  type SkillState,
} from '../src/skill-levels.ts';
import {
  adjacentSchools,
  areAdjacent,
  CLASS_START_SKILLS,
  isDual,
  isStarter,
  MAX_RING_SCHOOL_LEVEL,
  MAX_SKILL_LEVEL,
  SCHOOL_RING,
  SKILL_TREE,
  skillsOfSchool,
  startersOf,
  treeProblems,
  type RingSchool,
  type TreeNode,
} from '../src/skill-tree.ts';

/** A tree of made-up skills, to test rules the thirty-two starters cannot show. */
function tree(nodes: TreeNode[]): Record<string, TreeNode> {
  return Object.fromEntries(nodes.map((n) => [n.id, n]));
}
const n = (id: string, schools: TreeNode['schools'], over: Partial<TreeNode> = {}): TreeNode => ({
  id,
  name: id,
  schools,
  requires: {},
  measure: 'uses',
  ...over,
});

describe('the ring of schools', () => {
  it('has thirteen schools in the order of the sheet', () => {
    expect([...SCHOOL_RING]).toEqual([
      'bow',
      'electric',
      'axe',
      'fire',
      'sword',
      'water',
      'staff',
      'mace',
      'light',
      'shield',
      'earth',
      'dagger',
      'dark',
    ]);
  });

  it('is a ring: Dark is next to Bow, and each school has two neighbours', () => {
    expect(areAdjacent('dark', 'bow')).toBe(true);
    expect(areAdjacent('bow', 'dark')).toBe(true);
    expect(areAdjacent('bow', 'electric')).toBe(true);
    expect(areAdjacent('bow', 'axe')).toBe(false);
    expect(areAdjacent('fire', 'fire')).toBe(false);
    expect(adjacentSchools('bow')).toEqual(['dark', 'electric']);
    expect(adjacentSchools('dark')).toEqual(['dagger', 'bow']);
    for (const s of SCHOOL_RING) {
      for (const o of adjacentSchools(s)) expect(areAdjacent(s, o)).toBe(true);
    }
  });
});

describe('the starting skills of the sheet', () => {
  it('are thirty-two, in the counts of the sheet, and every school has a start', () => {
    const counts: Record<RingSchool, number> = {
      bow: 2,
      electric: 2,
      axe: 3,
      fire: 2,
      sword: 3,
      water: 2,
      staff: 2,
      mace: 3,
      light: 2,
      shield: 2,
      earth: 2,
      dagger: 2,
      dark: 5,
    };
    // Summon Imp is Fire and Dark: the sheet counts it once, under Fire.
    expect(Object.keys(SKILL_TREE)).toHaveLength(32);
    for (const s of SCHOOL_RING) {
      const own = skillsOfSchool(s).filter((k) => k.schools[0] === s);
      expect(own, s).toHaveLength(counts[s]);
      expect(startersOf(s).length, s).toBeGreaterThan(0);
    }
  });

  it('follow the rules of the tree (no loops, known schools and skills, levels in range)', () => {
    expect(treeProblems()).toEqual([]);
  });

  it('give every class the starts of the sheet and need nothing the class lacks', () => {
    expect(Object.keys(CLASS_START_SKILLS).sort()).toEqual(
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
    expect(CLASS_START_SKILLS.mage).toEqual([
      'staff_mastery',
      'fire_bolt',
      'ice_bolt',
      'lightning_bolt',
    ]);
    expect(CLASS_START_SKILLS.rogue).toEqual(['dagger_mastery', 'dagger_slash', 'dash']);
    for (const ids of Object.values(CLASS_START_SKILLS)) {
      for (const id of ids) expect(SKILL_TREE[id], id).toBeDefined();
    }
  });

  it('keep Slash as three separate skills, one per school, with a shared family', () => {
    const slashes = Object.values(SKILL_TREE).filter((k) => k.family === 'slash');
    expect(slashes.map((k) => k.id).sort()).toEqual(['axe_slash', 'dagger_slash', 'sword_slash']);
    expect(slashes.map((k) => k.schools[0]).sort()).toEqual(['axe', 'dagger', 'sword']);
    const s = newSkillState(['axe_slash', 'sword_slash']);
    s.skillLevels.axe_slash = 5;
    expect(skillLevelOf(s, 'sword_slash')).toBe(1);
    expect(schoolLevelOf(s, 'axe')).toBe(5);
    expect(schoolLevelOf(s, 'sword')).toBe(1);
  });

  it('show a dual skill in both trees', () => {
    const imp = SKILL_TREE.summon_imp!;
    expect(isDual(imp)).toBe(true);
    expect(skillsOfSchool('fire').map((k) => k.id)).toContain('summon_imp');
    expect(skillsOfSchool('dark').map((k) => k.id)).toContain('summon_imp');
    expect(imp.requires.skills).toEqual({ demonology_mastery: 1 });
    expect(isStarter(imp)).toBe(false);
    expect(isStarter(SKILL_TREE.fire_bolt!)).toBe(true);
  });

  it('make masteries passive and train them by what they are about', () => {
    for (const id of ['bow_mastery', 'staff_mastery', 'dagger_mastery', 'shield_mastery']) {
      expect(SKILL_TREE[id]!.passive, id).toBe(true);
    }
    expect(SKILL_TREE.fire_bolt!.passive).toBeUndefined();
    expect(SKILL_TREE.staff_mastery!.trainedBy).toEqual({ by: 'elemental' });
  });
});

describe('school level and power', () => {
  const t = tree([
    n('a1', ['axe']),
    n('a2', ['axe']),
    n('s1', ['sword']),
    n('dual', ['axe', 'sword']),
  ]);

  it('is the sum of the skill levels of the school', () => {
    const s = newSkillState();
    s.skillLevels = { a1: 3, a2: 4, s1: 2 };
    expect(schoolLevelOf(s, 'axe', t)).toBe(7);
    expect(schoolLevelOf(s, 'sword', t)).toBe(2);
    expect(schoolLevelOf(s, 'fire', t)).toBe(0);
  });

  it("counts a dual skill's level for both of its schools", () => {
    const s = newSkillState();
    s.skillLevels = { a1: 3, dual: 6 };
    expect(schoolLevelOf(s, 'axe', t)).toBe(9);
    expect(schoolLevelOf(s, 'sword', t)).toBe(6);
  });

  it('is capped at 100, so a school with more than ten skills fills sooner', () => {
    const many = tree(Array.from({ length: 14 }, (_, i) => n(`k${i}`, ['fire'])));
    const s = newSkillState();
    // Ten skills at level 10 is exactly 100; with 14 skills, 10 are enough.
    for (let i = 0; i < 10; i++) s.skillLevels[`k${i}`] = MAX_SKILL_LEVEL;
    expect(schoolLevelOf(s, 'fire', many)).toBe(MAX_RING_SCHOOL_LEVEL);
    for (let i = 10; i < 14; i++) s.skillLevels[`k${i}`] = MAX_SKILL_LEVEL;
    expect(schoolLevelOf(s, 'fire', many)).toBe(MAX_RING_SCHOOL_LEVEL);
    // Nine maxed skills and a few levels of others: 90 + 7.
    const s2 = newSkillState();
    for (let i = 0; i < 9; i++) s2.skillLevels[`k${i}`] = 10;
    s2.skillLevels.k9 = 3;
    s2.skillLevels.k10 = 4;
    expect(schoolLevelOf(s2, 'fire', many)).toBe(97);
  });

  it('gives one percent of power per school point', () => {
    expect(schoolPower(0)).toBe(1);
    expect(schoolPower(50)).toBeCloseTo(1.5);
    expect(schoolPower(100)).toBeCloseTo(2);
  });

  it('gives a dual skill the power of the better of its two schools', () => {
    const s = newSkillState();
    s.skillLevels = { a1: 30, a2: 20, s1: 4, dual: 1 };
    expect(skillSchoolPower(s, t.dual!, t)).toBeCloseTo(schoolPower(51));
  });

  it('stretches a status by one round for every twenty points', () => {
    expect(statusBonusRounds(0)).toBe(0);
    expect(statusBonusRounds(19)).toBe(0);
    expect(statusBonusRounds(20)).toBe(1);
    expect(statusBonusRounds(39)).toBe(1);
    expect(statusBonusRounds(100)).toBe(5);
  });
});

describe('raising a skill level by use', () => {
  const starter = n('starter', ['fire'], { measure: 'damage' });
  const hard = n('hard', ['fire'], { measure: 'damage', requires: { schools: { fire: 50 } } });
  const t = tree([starter, hard]);

  it('costs more for every level', () => {
    for (let l = 1; l < MAX_SKILL_LEVEL - 1; l++) {
      expect(levelUpCost(starter, l + 1)).toBeGreaterThan(levelUpCost(starter, l));
    }
    expect(levelUpCost(starter, MAX_SKILL_LEVEL)).toBe(0);
    expect(levelUpCost(starter, 0)).toBe(0);
  });

  it('is cheap for a starter and dear for a skill that unlocks late', () => {
    expect(unlockLevel(starter)).toBe(0);
    expect(unlockLevel(hard)).toBe(50);
    expect(levelUpCost(starter, 1)).toBe(BASE_COST.damage);
    expect(levelUpCost(hard, 1)).toBeGreaterThan(levelUpCost(starter, 1) * 4);
    // The character level counts too.
    const gated = n('gated', ['fire'], { requires: { charLevel: 60 } });
    expect(unlockLevel(gated)).toBe(60);
    expect(levelUpCost(gated, 1)).toBeGreaterThan(levelUpCost(n('free', ['fire']), 1));
  });

  it('has a measure of its own: damage, healing or uses', () => {
    const heal = n('heal', ['light'], { measure: 'healing' });
    const cast = n('cast', ['light'], { measure: 'uses' });
    expect(levelUpCost(heal, 1)).toBe(BASE_COST.healing);
    expect(levelUpCost(cast, 1)).toBe(BASE_COST.uses);
  });

  it('levels up as experience comes in, keeps the rest, and stops at the top', () => {
    const s = newSkillState(['starter']);
    expect(addSkillXp(s, starter, levelUpCost(starter, 1) - 1)).toBe(0);
    expect(skillLevelOf(s, 'starter')).toBe(1);
    expect(addSkillXp(s, starter, 1)).toBe(1);
    expect(skillLevelOf(s, 'starter')).toBe(2);
    expect(s.skillXp.starter).toBe(0);
    // A big amount can give several levels at once and leave a remainder.
    const big = levelUpCost(starter, 2) + levelUpCost(starter, 3) + 5;
    expect(addSkillXp(s, starter, big)).toBe(2);
    expect(skillLevelOf(s, 'starter')).toBe(4);
    expect(s.skillXp.starter).toBe(5);
    addSkillXp(s, starter, 10 ** 9);
    expect(skillLevelOf(s, 'starter')).toBe(MAX_SKILL_LEVEL);
    expect(s.skillXp.starter).toBe(0);
    expect(addSkillXp(s, starter, 1000)).toBe(0);
  });

  it('gives nothing to a skill that is not known', () => {
    const s = newSkillState();
    expect(addSkillXp(s, starter, 10 ** 6)).toBe(0);
    expect(skillLevelOf(s, 'starter')).toBe(0);
  });

  it('only trains a skill that is carried (one that is not in the AI is never used)', () => {
    const s = newSkillState(['starter']);
    const use = { skillId: 'starter', damage: 500, heal: 0 };
    expect(trainingFor(s, use, t)).toEqual([]);
    s.equipped = ['starter'];
    expect(trainingFor(s, use, t)).toEqual([['starter', 500]]);
    expect(trainSkills(s, use, t)).toEqual(['starter']);
    expect(skillLevelOf(s, 'starter')).toBe(2);
  });
});

describe('what a use trains', () => {
  const s: SkillState = newSkillState(Object.keys(SKILL_TREE));
  s.equipped = ['fire_bolt', 'less_heal', 'ricochet_arrow', 'sword_slash', 'summon_imp'];
  const of = (use: Parameters<typeof trainingFor>[1]) => Object.fromEntries(trainingFor(s, use));

  it('trains a damage skill by the damage, a heal by the healing, a plain skill by the use', () => {
    expect(
      of({ skillId: 'fire_bolt', damage: 40, heal: 0, spell: true, element: 'fire' }),
    ).toMatchObject({
      fire_bolt: 40,
    });
    expect(of({ skillId: 'less_heal', damage: 0, heal: 25, spell: true })).toEqual({
      less_heal: 25,
    });
    expect(of({ skillId: 'summon_imp', damage: 0, heal: 0, spell: true })).toMatchObject({
      summon_imp: 1,
    });
  });

  it('trains Staff Mastery from any elemental spell, and not from a weapon hit', () => {
    const spell = of({ skillId: 'fire_bolt', damage: 30, heal: 0, spell: true, element: 'fire' });
    expect(spell.staff_mastery).toBe(1);
    const hit = of({ skillId: 'sword_slash', damage: 30, heal: 0, weaponKind: 'sword', hands: 1 });
    expect(hit.staff_mastery).toBeUndefined();
  });

  it('trains weapon masteries by damage with that weapon, split by hands and dual wield', () => {
    const oneHand = of({
      skillId: 'sword_slash',
      damage: 30,
      heal: 0,
      weaponKind: 'sword',
      hands: 1,
    });
    expect(oneHand.sword_one_hand_mastery).toBe(30);
    expect(oneHand.sword_two_handed_mastery).toBeUndefined();
    expect(oneHand.sword_slash).toBe(30);
    const twoHand = of({
      skillId: 'sword_slash',
      damage: 50,
      heal: 0,
      weaponKind: 'sword',
      hands: 2,
    });
    expect(twoHand.sword_two_handed_mastery).toBe(50);
    expect(twoHand.sword_one_hand_mastery).toBeUndefined();
    const bow = of({ skillId: 'ricochet_arrow', damage: 20, heal: 0, weaponKind: 'bow', hands: 2 });
    expect(bow.bow_mastery).toBe(20);
    const dual = of({
      skillId: 'sword_slash',
      damage: 10,
      heal: 0,
      weaponKind: 'axe',
      hands: 1,
      dual: true,
    });
    expect(dual.axe_dual_wield_mastery).toBe(10);
    expect(dual.axe_two_handed_mastery).toBeUndefined();
    // A mace kind and a hammer kind both train the Mace masteries.
    const hammer = of({
      skillId: 'sword_slash',
      damage: 10,
      heal: 0,
      weaponKind: 'hammer',
      hands: 2,
    });
    expect(hammer.mace_two_handed_mastery).toBe(10);
  });

  it('trains Shield Mastery by the damage the shield stops, and the demon mastery by its skill', () => {
    expect(of({ skillId: 'none', damage: 0, heal: 0, blocked: 12 }).shield_mastery).toBe(12);
    expect(of({ skillId: 'none', damage: 0, heal: 0 }).shield_mastery).toBeUndefined();
    expect(of({ skillId: 'summon_imp', damage: 0, heal: 0, spell: true }).demonology_mastery).toBe(
      1,
    );
    expect(
      of({ skillId: 'fire_bolt', damage: 3, heal: 0, spell: true, element: 'fire' })
        .demonology_mastery,
    ).toBeUndefined();
  });

  it('does not train a mastery the character has not learned', () => {
    const bare = newSkillState(['fire_bolt']);
    bare.equipped = ['fire_bolt'];
    const got = Object.fromEntries(
      trainingFor(bare, { skillId: 'fire_bolt', damage: 5, heal: 0, spell: true, element: 'fire' }),
    );
    expect(got).toEqual({ fire_bolt: 5 });
  });
});

describe('requirements', () => {
  const t = tree([
    n('ice_shard', ['water']),
    n('rain', ['water']),
    n('ice_wall', ['water'], {
      requires: { charLevel: 15, schools: { water: 20 }, skills: { ice_shard: 5, rain: 3 } },
    }),
  ]);

  it('need the character level, the school level and the skills, all together', () => {
    const s = newSkillState(['ice_shard', 'rain']);
    s.skillLevels = { ice_shard: 5, rain: 3 };
    const wall = t.ice_wall!;
    expect(unmetSkillRequirements(s, 15, wall, t)).toEqual(['Water level 20 (have 8)']);
    s.skillLevels.ice_shard = 10;
    s.skillLevels.rain = 10;
    expect(unmetSkillRequirements(s, 15, wall, t)).toEqual([]);
    expect(unmetSkillRequirements(s, 14, wall, t)).toEqual(['character level 15 (have 14)']);
    s.skillLevels.rain = 2;
    expect(unmetSkillRequirements(s, 15, wall, t).join()).toMatch(/rain level 3 \(have 2\)/);
  });

  it('say everything that is missing', () => {
    const s = newSkillState();
    expect(unmetSkillRequirements(s, 1, t.ice_wall!, t)).toHaveLength(4);
  });

  it('list what can be learned now, starters first', () => {
    const s = newSkillState();
    expect(learnable(s, 1, t).map((k) => k.id)).toEqual(['ice_shard', 'rain']);
    s.skillLevels = { ice_shard: 10, rain: 10 };
    expect(learnable(s, 15, t).map((k) => k.id)).toEqual(['ice_wall']);
  });

  it('make a dual skill need both schools, and Summon Imp need Demonology Mastery', () => {
    const s = newSkillState(['fire_bolt']);
    const imp = SKILL_TREE.summon_imp!;
    expect(unmetSkillRequirements(s, 1, imp).join()).toMatch(/Demonology Mastery level 1/);
    s.skillLevels.demonology_mastery = 1;
    expect(unmetSkillRequirements(s, 1, imp)).toEqual([]);
    const both = n('both', ['fire', 'dark'], { requires: { schools: { fire: 10, dark: 10 } } });
    const bt = tree([both]);
    expect(unmetSkillRequirements(newSkillState(), 1, both, bt)).toHaveLength(2);
  });
});

describe('carried skills', () => {
  it('start at six, seven from level 30 and eight from level 60', () => {
    expect(equippedLimit(1)).toBe(6);
    expect(equippedLimit(29)).toBe(6);
    expect(equippedLimit(30)).toBe(7);
    expect(equippedLimit(59)).toBe(7);
    expect(equippedLimit(60)).toBe(8);
    expect(equippedLimit(100)).toBe(8);
  });

  const many = tree(Array.from({ length: 9 }, (_, i) => n(`k${i}`, ['fire'])));
  const known = () => newSkillState(Object.keys(many));

  it('stop at the limit, and the limit grows with the level', () => {
    const s = known();
    for (let i = 0; i < 6; i++) expect(equipSkill(s, 1, `k${i}`, many)).toBeNull();
    expect(equipSkill(s, 1, 'k6', many)).toMatch(/only 6/);
    expect(equipSkill(s, 30, 'k6', many)).toBeNull();
    expect(equipSkill(s, 30, 'k7', many)).toMatch(/only 7/);
    expect(equipSkill(s, 60, 'k7', many)).toBeNull();
    expect(s.equipped).toHaveLength(8);
    expect(equipSkill(s, 100, 'k8', many)).toMatch(/only 8/);
  });

  it('can be put down to make room, and refuse unknown, repeated and unlearned skills', () => {
    const s = known();
    expect(equipProblem(s, 1, 'nope', many)).toBe('unknown skill');
    delete s.skillLevels.k0;
    expect(equipProblem(s, 1, 'k0', many)).toBe('not learned yet');
    equipSkill(s, 1, 'k1', many);
    expect(equipProblem(s, 1, 'k1', many)).toBe('already carried');
    unequipSkill(s, 'k1');
    expect(s.equipped).toEqual([]);
    expect(equipProblem(s, 1, 'k1', many)).toBeNull();
  });

  it('give masteries no slot: they are always on', () => {
    const s = newSkillState(['staff_mastery']);
    expect(equipProblem(s, 1, 'staff_mastery')).toMatch(/takes no slot/);
  });
});
