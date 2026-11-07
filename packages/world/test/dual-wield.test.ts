import { runCombat, type CombatEvent } from '@game/engine';
import { describe, expect, it } from 'vitest';
import { equipItem, moveItem } from '../src/actions.ts';
import { ARENAS } from '../src/arenas.ts';
import { trainFromFight } from '../src/learning.ts';
import { makeGear, shopItem } from '../src/loot.ts';
import { MONSTERS, monsterUnit } from '../src/monsters.ts';
import { createMember, memberGear } from '../src/progression.ts';
import { SKILL_TREE, treeProblems } from '../src/skill-tree.ts';
import { createParty, memberUnit } from '../src/sim.ts';
import { SKILLS } from '../src/skills.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import type { Item, PartyState } from '../src/types.ts';

function party(): PartyState {
  const p = createParty({
    id: 'p',
    name: 'T',
    seed: 1,
    now: 0,
    world: W,
    members: [
      { name: 'B', race: 'orc', cls: 'barbarian' },
      { name: 'R', race: 'elf', cls: 'rogue' },
    ],
  });
  for (const m of p.members) m.alloc.str += 40; // strong enough to wear anything in the tests
  return p;
}

const weapon = (id: string, base: string): Item => {
  const it = shopItem(base, 5, 'common');
  return { ...it, id, favorite: false } as unknown as Item;
};
const cfg = { bagSize: 40 };

describe('the off hand', () => {
  it('takes a one-handed weapon when the main hand holds one too', () => {
    const p = party();
    const rogue = p.members[1]!;
    p.bag.push(weapon('d2', 'Iron Dagger'));
    expect(rogue.equipment.weapon?.hands).toBe(1);
    expect(moveItem(p, 'd2', { kind: 'equip', memberId: rogue.id, slot: 'offhand' }, cfg)).toEqual({
      ok: true,
    });
    expect(rogue.equipment.offhand?.kind).toBe('dagger');
    const gear = memberGear(rogue);
    expect(gear.offWeapon).toBeDefined();
    expect(gear.offKind).toBe('dagger');
    // The combat unit dual wields.
    const unit = memberUnit(p, rogue);
    expect(unit.offWeapon).toEqual(gear.offWeapon);
    expect(unit.offWeaponKind).toBe('dagger');
  });

  it('refuses a weapon in the off hand when the main hand holds a two-handed one', () => {
    const p = party();
    const barb = p.members[0]!;
    expect(barb.equipment.weapon?.hands).toBe(2);
    p.bag.push(weapon('a2', 'Iron Axe'));
    const r = moveItem(p, 'a2', { kind: 'equip', memberId: barb.id, slot: 'offhand' }, cfg);
    expect(r).toMatchObject({ ok: false, code: 'two_handed' });
    expect(barb.equipment.offhand).toBeUndefined();
  });

  it('refuses a two-handed weapon in the off hand, and a weapon in the off hand with no main weapon', () => {
    const p = party();
    const rogue = p.members[1]!;
    p.bag.push(weapon('g', 'Great Axe'));
    expect(
      moveItem(p, 'g', { kind: 'equip', memberId: rogue.id, slot: 'offhand' }, cfg),
    ).toMatchObject({
      ok: false,
      code: 'wrong_slot',
    });
    delete rogue.equipment.weapon;
    p.bag.push(weapon('d3', 'Iron Dagger'));
    expect(
      moveItem(p, 'd3', { kind: 'equip', memberId: rogue.id, slot: 'offhand' }, cfg),
    ).toMatchObject({
      ok: false,
      code: 'dual_wield',
    });
  });

  it('does not dual wield with a shield, and a two-handed weapon needs the off hand free again', () => {
    const p = party();
    const rogue = p.members[1]!;
    p.bag.push(weapon('d2', 'Iron Dagger'), weapon('g', 'Great Axe'));
    moveItem(p, 'd2', { kind: 'equip', memberId: rogue.id, slot: 'offhand' }, cfg);
    // A two-handed weapon cannot replace the main hand while the off hand is full.
    expect(equipItem(p, rogue.id, 'g')).toMatchObject({ ok: false, code: 'two_handed' });
    // A shield in the off hand is not dual wielding.
    const shielded = createMember(0, { name: 'W', race: 'human', cls: 'warrior' });
    expect(shielded.equipment.offhand?.slot).toBe('offhand');
    expect(memberGear(shielded).offWeapon).toBeUndefined();
  });

  it('only counts as dual wielding with one-handed weapons in both hands', () => {
    const rogue = createMember(0, { name: 'R', race: 'elf', cls: 'rogue' });
    rogue.equipment.offhand = { ...weapon('d2', 'Iron Dagger'), slot: 'offhand' } as Item;
    expect(memberGear(rogue).offWeapon).toBeDefined();
    rogue.equipment.weapon = { ...weapon('g', 'Great Axe') } as Item; // two hands
    expect(memberGear(rogue).offWeapon).toBeUndefined();
  });
});

describe('dual wielding in play', () => {
  it('the off-hand strike shows in a fight and trains the dual wield mastery', () => {
    const p = createParty({
      id: 'q',
      name: 'Q',
      seed: 1,
      now: 0,
      world: W,
      members: [
        { name: 'B', race: 'orc', cls: 'barbarian' },
        { name: 'P', race: 'human', cls: 'priest' },
      ],
    });
    p.level = 10;
    const barb = p.members[0]!;
    barb.equipment.weapon = { ...weapon('a1', 'Iron Axe'), slot: 'weapon' } as Item;
    barb.equipment.offhand = { ...weapon('a2', 'Iron Axe'), slot: 'offhand' } as Item;
    const monsters = [
      monsterUnit(MONSTERS.ice_golem!, 'e1', 8),
      monsterUnit(MONSTERS.ice_golem!, 'e2', 8),
    ];
    // Fights vary with the seed; look through a few for one where the barbarian gets to strike.
    let result = runCombat({
      seed: 1,
      arena: ARENAS.clearing!,
      units: [],
      skills: SKILLS,
    } as never);
    let off: CombatEvent[] = [];
    for (let seed = 1; seed <= 12 && off.length === 0; seed++) {
      result = runCombat({
        seed,
        arena: ARENAS.clearing!,
        units: [...p.members.map((m) => memberUnit(p, m)), ...monsters],
        skills: SKILLS,
      });
      off = result.events.filter((e) => e.t === 'damage' && e.offhand && e.source === barb.id);
    }
    expect(off.length).toBeGreaterThan(0);
    trainFromFight([barb], result.events, p.level);
    expect(barb.skillXp.axe_dual_wield_mastery ?? 0).toBeGreaterThan(0);
    // The two-handed mastery does not train from a dual wield.
    expect(barb.skillXp.axe_two_handed_mastery ?? 0).toBe(0);
  });
});

describe('the skills of this phase', () => {
  it('Ricochet Arrow bounces, Dash and Shadow Step are real skills in the tree', () => {
    expect(SKILLS.ricochet_arrow!.ricochet).toMatchObject({ bounces: 2 });
    expect(SKILLS.dash!.dash).toBeGreaterThan(0);
    expect(SKILLS.dash!.free).toBe(true);
    expect(SKILLS.dash!.status).toMatchObject({ kind: 'stealth' });
    expect(SKILLS.shadow_step!.teleport).toBe(true);
    // Shadow Step follows Dash, and sits in both the Dagger and Dark trees.
    const node = SKILL_TREE.shadow_step!;
    expect(node.schools).toEqual(['dagger', 'dark']);
    expect(node.requires.skills).toEqual({ dash: 2 });
    expect(treeProblems()).toEqual([]);
    // The Rogue opens with Dash.
    const rogue = createMember(0, { name: 'R', race: 'elf', cls: 'rogue' });
    expect(rogue.equipped).toContain('dash');
  });

  it('a Rogue fights with Dash in a real fight', () => {
    const p = party();
    p.level = 5;
    const rogue = p.members[1]!;
    const monsters = [
      monsterUnit(MONSTERS.goblin!, 'e1', 5),
      monsterUnit(MONSTERS.goblin!, 'e2', 5),
    ];
    const result = runCombat({
      seed: 6,
      arena: ARENAS.clearing!,
      units: [...p.members.map((m) => memberUnit(p, m)), ...monsters],
      skills: SKILLS,
    });
    const dashed = result.events.some(
      (e: CombatEvent) => e.t === 'skill' && e.unit === rogue.id && e.skill === 'dash',
    );
    expect(dashed).toBe(true);
    expect(
      result.events.some(
        (e) => e.t === 'status' && e.unit === rogue.id && e.status === 'stealth' && e.on,
      ),
    ).toBe(true);
  });

  it('gear made for tests has a one-handed axe in the off hand rules (smoke)', () => {
    const gear = makeGear(
      {
        name: 'x',
        slot: 'weapon',
        main: 'str',
        second: 'vit',
        weapon: { kind: 'axe', hands: 1, type: 'cut', quality: 1 },
      },
      5,
      'common',
    );
    expect(gear.hands).toBe(1);
  });
});
