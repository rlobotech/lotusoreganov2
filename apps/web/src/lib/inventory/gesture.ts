/** Pointer gesture rules for picking items up, kept free of the DOM so they can be tested. */

/** Pixels a mouse or pen must travel before a press turns into a drag. */
export const DRAG_THRESHOLD = 6;
/** Pixels a finger may drift during the hold before we assume the player is scrolling. */
export const TOUCH_SLOP = 10;
/** How long a finger must rest on an item before it is picked up. */
export const LONG_PRESS_MS = 250;

export type PointerKind = 'mouse' | 'pen' | 'touch';
export type Decision = 'wait' | 'drag' | 'cancel';

/**
 * What a press that has moved `dx`,`dy` pixels over `heldMs` milliseconds is turning into.
 * Mouse and pen drag as soon as they move. A finger must hold still first (so scrolling the page
 * still works) and then it drags.
 */
export function dragDecision(kind: PointerKind, dx: number, dy: number, heldMs: number): Decision {
  const dist = Math.hypot(dx, dy);
  if (kind === 'touch') {
    if (heldMs >= LONG_PRESS_MS) return 'drag';
    return dist >= TOUCH_SLOP ? 'cancel' : 'wait';
  }
  return dist >= DRAG_THRESHOLD ? 'drag' : 'wait';
}

export function pointerKind(type: string): PointerKind {
  return type === 'touch' ? 'touch' : type === 'pen' ? 'pen' : 'mouse';
}

/** Places a tooltip of `w`x`h` next to a rectangle, flipped and clamped to stay on screen. */
export function placeTooltip(
  anchor: { left: number; top: number; right: number; bottom: number },
  size: { w: number; h: number },
  view: { w: number; h: number },
  gap = 8,
): { x: number; y: number } {
  let x = anchor.right + gap;
  if (x + size.w > view.w - 4) x = anchor.left - gap - size.w;
  x = Math.max(4, Math.min(x, view.w - size.w - 4));
  let y = anchor.top;
  y = Math.max(4, Math.min(y, view.h - size.h - 4));
  return { x, y };
}
