import type { SlotName } from '@game/shared';

/**
 * Where the equipment slots sit around a character. Adding a slot to the game only needs a new
 * name in one of these lists.
 */
export const SLOT_LAYOUT: { left: SlotName[]; right: SlotName[]; bottom: SlotName[] } = {
  left: ['head', 'body', 'feet'],
  right: ['ring', 'charm'],
  bottom: ['weapon', 'offhand'],
};

/** Colors for the placeholder figure, from the class and race palettes in docs/art. */
export const CLASS_COLORS: Record<string, { main: string; accent: string }> = {
  warrior: { main: '#6b7380', accent: '#9a2230' },
  mage: { main: '#2f55c4', accent: '#9fe4ff' },
  priest: { main: '#e8dcc0', accent: '#e08a1e' },
  ranger: { main: '#3c6230', accent: '#b8452a' },
};
export const RACE_SKIN: Record<string, string> = {
  human: '#e0ac88',
  elf: '#e2bea6',
  dwarf: '#d4987a',
  orc: '#84a066',
};

export function figureColors(race: string, cls: string) {
  return {
    ...(CLASS_COLORS[cls] ?? { main: '#6b7380', accent: '#c9a24a' }),
    skin: RACE_SKIN[race] ?? '#e0ac88',
  };
}

/** The file name of a character sprite: the same name the combat viewer loads. */
export const characterSprite = (race: string, cls: string) => `/sprites/${race}_${cls}.png`;
