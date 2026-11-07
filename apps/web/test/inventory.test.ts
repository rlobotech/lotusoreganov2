import type { ItemInfo } from '@game/shared';
import { describe, expect, it } from 'vitest';
import {
  dragDecision,
  DRAG_THRESHOLD,
  LONG_PRESS_MS,
  placeTooltip,
  TOUCH_SLOP,
} from '../src/lib/inventory/gesture.ts';
import {
  canDrop,
  compareItems,
  decodeTarget,
  encodeTarget,
  iconSize,
  samePlace,
  slug,
  spriteUrl,
} from '../src/lib/inventory/itemUi.ts';

const item = (over: Partial<ItemInfo> = {}): ItemInfo => ({
  id: 'i1',
  name: 'Rusty Sword',
  rarity: 'common',
  itemLevel: 3,
  value: 10,
  favorite: false,
  slot: 'weapon',
  bonuses: { str: 3, dex: 1 },
  ...over,
});

describe('item sprites', () => {
  it('turns names into file names', () => {
    expect(slug('Rusty Sword')).toBe('rusty-sword');
    expect(slug("Goblin King's  Crown!")).toBe('goblin-king-s-crown');
    expect(spriteUrl({ name: 'Bone Charm' })).toBe('/sprites/items/bone-charm.png');
  });

  it('picks whole-step icon sizes', () => {
    expect(iconSize(100)).toBe(64);
    expect(iconSize(50)).toBe(48);
    expect(iconSize(40)).toBe(32);
    expect(iconSize(20)).toBe(16);
  });
});

describe('comparing items', () => {
  it('lists the item bonuses without a comparison', () => {
    expect(compareItems(item())).toEqual([
      { attr: 'str', value: 3 },
      { attr: 'dex', value: 1 },
    ]);
  });

  it('shows the difference against the worn item, including lost bonuses', () => {
    const worn = item({ id: 'w', bonuses: { str: 5, vit: 2 } });
    expect(compareItems(item(), worn)).toEqual([
      { attr: 'str', value: 3, diff: -2 },
      { attr: 'dex', value: 1, diff: 1 },
      { attr: 'vit', value: 0, diff: -2 },
    ]);
  });

  it('handles items with no bonuses', () => {
    expect(compareItems(item({ bonuses: undefined }))).toEqual([]);
  });
});

describe('drop rules', () => {
  it('bags take anything, slots only their own kind', () => {
    expect(canDrop(item(), { kind: 'bag' })).toBe(true);
    expect(canDrop(item({ slot: undefined }), { kind: 'personal', memberId: 'm1' })).toBe(true);
    expect(canDrop(item(), { kind: 'equip', memberId: 'm1', slot: 'weapon' })).toBe(true);
    expect(canDrop(item(), { kind: 'equip', memberId: 'm1', slot: 'head' })).toBe(false);
    expect(canDrop(item(), { kind: 'equip', memberId: 'm1' })).toBe(true);
    // A one-handed weapon also fits the off hand (dual wielding); a two-handed one does not.
    const dagger = item({ slot: 'weapon', hands: 1 });
    expect(canDrop(dagger, { kind: 'equip', memberId: 'm1', slot: 'offhand' })).toBe(true);
    expect(
      canDrop(item({ slot: 'weapon', hands: 2 }), {
        kind: 'equip',
        memberId: 'm1',
        slot: 'offhand',
      }),
    ).toBe(false);
    expect(canDrop(item({ slot: undefined }), { kind: 'equip', memberId: 'm1' })).toBe(false);
  });

  it('knows when a drop would not move anything', () => {
    expect(samePlace({ kind: 'bag' }, { kind: 'bag' })).toBe(true);
    expect(samePlace({ kind: 'bag' }, { kind: 'personal', memberId: 'm1' })).toBe(false);
    expect(
      samePlace({ kind: 'personal', memberId: 'm1' }, { kind: 'personal', memberId: 'm1' }),
    ).toBe(true);
    expect(
      samePlace({ kind: 'personal', memberId: 'm1' }, { kind: 'personal', memberId: 'm2' }),
    ).toBe(false);
    expect(
      samePlace(
        { kind: 'equip', memberId: 'm1', slot: 'weapon' },
        { kind: 'equip', memberId: 'm1' },
      ),
    ).toBe(true);
    expect(
      samePlace(
        { kind: 'equip', memberId: 'm1', slot: 'weapon' },
        { kind: 'equip', memberId: 'm2' },
      ),
    ).toBe(false);
  });

  it('round-trips targets and rejects junk', () => {
    const t = { kind: 'equip', memberId: 'm1', slot: 'ring' } as const;
    expect(decodeTarget(encodeTarget(t))).toEqual(t);
    expect(decodeTarget(encodeTarget({ kind: 'bag' }))).toEqual({ kind: 'bag' });
    expect(decodeTarget(null)).toBeNull();
    expect(decodeTarget('not json')).toBeNull();
    expect(decodeTarget('{"kind":"personal"}')).toBeNull();
    expect(decodeTarget('{"kind":"moon"}')).toBeNull();
  });
});

describe('pointer gestures', () => {
  it('a mouse drags after moving a few pixels', () => {
    expect(dragDecision('mouse', 2, 2, 10)).toBe('wait');
    expect(dragDecision('mouse', DRAG_THRESHOLD, 0, 10)).toBe('drag');
    expect(dragDecision('pen', 0, DRAG_THRESHOLD + 1, 10)).toBe('drag');
  });

  it('a finger must hold still, and moving early means scrolling', () => {
    expect(dragDecision('touch', 2, 0, 50)).toBe('wait');
    expect(dragDecision('touch', TOUCH_SLOP, 0, 50)).toBe('cancel');
    expect(dragDecision('touch', 0, 0, LONG_PRESS_MS)).toBe('drag');
    expect(dragDecision('touch', 30, 0, LONG_PRESS_MS + 1)).toBe('drag');
  });

  it('keeps tooltips on screen', () => {
    const view = { w: 400, h: 300 };
    const size = { w: 200, h: 120 };
    // Room on the right: it goes beside the item.
    expect(placeTooltip({ left: 10, top: 20, right: 50, bottom: 60 }, size, view)).toEqual({
      x: 58,
      y: 20,
    });
    // No room on the right: it flips to the left.
    const flipped = placeTooltip({ left: 300, top: 20, right: 340, bottom: 60 }, size, view);
    expect(flipped.x).toBe(92);
    // Never below the bottom edge.
    expect(placeTooltip({ left: 10, top: 290, right: 50, bottom: 330 }, size, view).y).toBe(176);
  });
});
