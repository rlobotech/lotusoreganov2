import { createRng } from '@game/engine';
import { describe, expect, it } from 'vitest';
import { equipItem, moveItem } from '../src/actions.ts';
import { BASES, baseByName, makeGear, rollDrop, shopItem, starterGear } from '../src/loot.ts';
import { CLASSES, createMember, memberGear, unmetRequirements } from '../src/progression.ts';
import { createParty } from '../src/sim.ts';
import { STARTER_WORLD as W } from '../src/starter-world.ts';
import type { ClassId, Item, PartyState } from '../src/types.ts';

function party(): PartyState {
  return createParty({
    id: 'p',
    name: 'T',
    seed: 1,
    now: 0,
    world: W,
    members: [
      { name: 'W', race: 'human', cls: 'warrior' },
      { name: 'M', race: 'human', cls: 'mage' },
    ],
  });
}

const item = (over: Partial<Item>): Item => ({
  id: 'x',
  name: 'Thing',
  rarity: 'common',
  itemLevel: 1,
  value: 1,
  favorite: false,
  slot: 'weapon',
  ...over,
});

describe('item stats', () => {
  it('weapons have damage, a kind and hands; armor has resistances; rings have neither', () => {
    for (const base of BASES) {
      const g = makeGear(base, 10, 'common');
      if (base.weapon) {
        expect(g.weapon!.min).toBeLessThanOrEqual(g.weapon!.max);
        expect(g.kind).toBe(base.weapon.kind);
        expect([1, 2]).toContain(g.hands);
      } else if (base.armor) {
        expect(Object.keys(g.resist!).length).toBeGreaterThan(0);
        expect(Object.values(g.resist!).every((v) => v > 0)).toBe(true);
      } else {
        expect(g.weapon).toBeUndefined();
        expect(g.resist).toBeUndefined();
      }
    }
  });

  it('a full set of armor adds up to about the gear curve, and rarity makes it better', () => {
    const set = ['Wooden Shield', 'Leather Cap', 'Iron Mail', 'Worn Boots'];
    const worn = starterGear(set, 'm', 10);
    const sum = memberGear({ equipment: worn }).resist;
    // 10 * 6 + 10 = 70 points of armor at level 10; the physical types are covered by most pieces.
    expect(sum.cut).toBeGreaterThan(40);
    expect(sum.cut).toBeLessThanOrEqual(72);
    const common = makeGear(baseByName('Iron Mail'), 10, 'common').resist!.cut!;
    const epic = makeGear(baseByName('Iron Mail'), 10, 'epic').resist!.cut!;
    expect(epic).toBeGreaterThan(common);
  });

  it('two-handed weapons out-damage one-handed ones', () => {
    const one = makeGear(baseByName('Rusty Sword'), 20, 'common').weapon!;
    const two = makeGear(baseByName('War Hammer'), 20, 'common').weapon!;
    expect(two.max).toBeGreaterThan(one.max);
  });

  it('only rare and epic drops carry extra damage, and the item is named after it', () => {
    const rng = createRng(5);
    let withExtra = 0;
    for (let i = 0; i < 400; i++) {
      const it = rollDrop(rng, 12, `d${i}`);
      if (!it?.weapon) continue;
      if (it.extra) {
        withExtra++;
        expect(['rare', 'epic']).toContain(it.rarity);
        expect(it.extra[0]!.min).toBeGreaterThan(0);
        expect(it.name).toMatch(
          /^(Superior |Ancient )(Flaming|Frozen|Shocking|Venomous|Cursed|Radiant) /,
        );
      }
    }
    expect(withExtra).toBeGreaterThan(0);
  });

  it('shop items are deterministic and carry their combat stats', () => {
    const a = shopItem('Short Bow', 7, 'uncommon');
    expect(shopItem('Short Bow', 7, 'uncommon')).toEqual(a);
    expect(a.hands).toBe(2);
    expect(a.weapon?.type).toBe('piercing');
    expect(a.requires).toEqual({ dex: 2 });
  });
});

describe('class kits', () => {
  const classes = Object.keys(CLASSES) as ClassId[];

  it.each(classes)(
    'a new %s wears a weapon, can wear all of its kit, and has resistances',
    (cls) => {
      const m = createMember(0, { name: 'A', race: 'human', cls }, 1);
      expect(m.equipment.weapon?.weapon).toBeDefined();
      for (const it of Object.values(m.equipment)) {
        expect(unmetRequirements(m, 1, it!)).toEqual([]);
      }
      expect(Object.keys(memberGear(m).resist).length).toBeGreaterThan(0);
    },
  );

  it.each(classes)('the %s kit stays wearable at every level up to 100', (cls) => {
    for (const level of [10, 40, 70, 100]) {
      const m = createMember(0, { name: 'A', race: 'human', cls }, level);
      for (const it of Object.values(m.equipment)) {
        expect(unmetRequirements(m, level, it!)).toEqual([]);
      }
    }
  });

  it('kits never combine a two-handed weapon with an off hand', () => {
    for (const cls of classes) {
      const worn = starterGear(CLASSES[cls].kit, 'm', 1);
      if (worn.weapon?.hands === 2) expect(worn.offhand).toBeUndefined();
    }
  });

  it('a character without a weapon has none to report (the fight uses bare hands)', () => {
    expect(memberGear({ equipment: {} }).weapon).toBeUndefined();
  });
});

describe('wearing rules', () => {
  it('refuses gear the character is too weak for, naming what is missing', () => {
    const p = party();
    p.bag.push(item({ id: 'big', requires: { str: 50 } }));
    const r = equipItem(p, 'm2', 'big');
    expect(r).toMatchObject({ ok: false, code: 'requirements' });
    expect(r.ok ? '' : r.error).toMatch(/50 Strength/);
    expect(p.bag).toHaveLength(1);
  });

  it('gear bonuses do not help meet requirements', () => {
    const p = party();
    const m = p.members[1]!;
    m.equipment = { ring: item({ slot: 'ring', bonuses: { str: 40 } }) };
    expect(unmetRequirements(m, 1, { requires: { str: 20 } })).toHaveLength(1);
  });

  it('a two-handed weapon needs a free off hand, and an off hand needs a one-handed weapon', () => {
    const p = party();
    const m = p.members[0]!;
    m.equipment = { offhand: item({ id: 'sh', slot: 'offhand' }) };
    p.bag.push(item({ id: 'bow', hands: 2 }));
    expect(equipItem(p, m.id, 'bow')).toMatchObject({ ok: false, code: 'two_handed' });
    m.equipment = { weapon: item({ id: 'hammer', hands: 2 }) };
    p.bag.push(item({ id: 'sh2', slot: 'offhand' }));
    expect(equipItem(p, m.id, 'sh2')).toMatchObject({ ok: false, code: 'two_handed' });
    m.equipment = { weapon: item({ id: 'one', hands: 1 }) };
    expect(equipItem(p, m.id, 'sh2')).toEqual({ ok: true });
  });

  it('trading gear between two characters checks both sides', () => {
    const p = party();
    const [w, mage] = p.members as [(typeof p.members)[0], (typeof p.members)[0]];
    w.equipment = { weapon: item({ id: 'heavy', requires: { str: 30 } }) };
    mage.equipment = { weapon: item({ id: 'wand' }) };
    // The warrior's heavy weapon cannot go to the mage, so the swap is refused as a whole.
    const r = moveItem(p, 'heavy', { kind: 'equip', memberId: mage.id }, { bagSize: 40 });
    expect(r).toMatchObject({ ok: false, code: 'requirements' });
    expect(w.equipment.weapon!.id).toBe('heavy');
    expect(mage.equipment.weapon!.id).toBe('wand');
  });
});

describe('combat gear', () => {
  it('summed resistances come from every worn piece', () => {
    const m = createMember(0, { name: 'A', race: 'human', cls: 'warrior' }, 20);
    const sum = memberGear(m).resist;
    const mail = m.equipment.body!.resist!;
    expect(sum.cut).toBeGreaterThanOrEqual(mail.cut!);
  });
});
