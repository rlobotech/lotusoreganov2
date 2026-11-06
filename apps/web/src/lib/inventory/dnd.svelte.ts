import type { ItemInfo } from '@game/shared';
import { getContext, setContext } from 'svelte';
import { dragDecision, LONG_PRESS_MS, pointerKind, type PointerKind } from './gesture.ts';
import { canDrop, decodeTarget, samePlace, type DropTarget, type ItemPlace } from './itemUi.ts';

export interface Held {
  item: ItemInfo;
  from: ItemPlace;
}

export interface Hovered extends Held {
  rect: { left: number; top: number; right: number; bottom: number };
}

interface Handlers {
  /** The player dropped an item on a valid target. */
  move: (item: ItemInfo, from: ItemPlace, to: DropTarget) => void;
  /** Double click or right click: do the obvious thing with the item (wear it, or send it back). */
  quick: (item: ItemInfo, from: ItemPlace) => void;
}

/**
 * Shared state and gestures of the inventory screen: drag and drop with the mouse, long press and
 * drag with a finger, tap to select, hover to peek. One controller per screen, handed to the slots
 * through Svelte context.
 */
export class InventoryDnd {
  /** The item being dragged. */
  dragging = $state.raw<Held | null>(null);
  /** The valid drop target under the pointer while dragging. */
  over = $state.raw<DropTarget | null>(null);
  /** The item the player tapped or clicked: its card stays open until dismissed. */
  selected = $state.raw<Held | null>(null);
  /** The item under the mouse: shows a light tooltip. */
  hovered = $state.raw<Hovered | null>(null);

  #handlers: Handlers;
  #ghost: HTMLElement | null = null;
  #lastKind: PointerKind = 'mouse';

  constructor(handlers: Handlers) {
    this.#handlers = handlers;
  }

  select(h: Held | null) {
    this.selected = h;
  }

  /** Svelte action for a cell that holds an item. */
  draggable = (node: HTMLElement, initial: Held) => {
    let held = initial;
    let start: { x: number; y: number; t: number; id: number; kind: PointerKind } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = false;
    let blockClick = false;

    const preventScroll = (e: TouchEvent) => {
      if (active) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
    };

    const begin = (x: number, y: number) => {
      active = true;
      this.hovered = null;
      this.selected = null;
      this.dragging = held;
      node.setPointerCapture?.(start!.id);
      const ghost = node.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('data-drop');
      Object.assign(ghost.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: `${node.offsetWidth}px`,
        height: `${node.offsetHeight}px`,
        margin: '0',
        pointerEvents: 'none',
        zIndex: '1000',
        opacity: '0.9',
        transform: `translate(${x - node.offsetWidth / 2}px, ${y - node.offsetHeight / 2}px) scale(1.1)`,
      });
      document.body.appendChild(ghost);
      this.#ghost = ghost;
      window.addEventListener('touchmove', preventScroll, { passive: false });
      window.addEventListener('keydown', onKey);
    };

    const track = (x: number, y: number) => {
      const g = this.#ghost;
      if (g) {
        g.style.transform = `translate(${x - node.offsetWidth / 2}px, ${y - node.offsetHeight / 2}px) scale(1.1)`;
      }
      const el = document.elementFromPoint(x, y)?.closest('[data-drop]');
      const target = decodeTarget(el?.getAttribute('data-drop'));
      this.over = target && canDrop(held.item, target) ? target : null;
    };

    const finish = (drop: boolean) => {
      clearTimeout(timer);
      timer = undefined;
      const to = this.over;
      if (active) {
        window.removeEventListener('touchmove', preventScroll);
        window.removeEventListener('keydown', onKey);
        this.#ghost?.remove();
        this.#ghost = null;
        this.dragging = null;
        this.over = null;
        blockClick = true;
        if (drop && to && !samePlace(held.from, to)) this.#handlers.move(held.item, held.from, to);
      }
      if (start && node.hasPointerCapture?.(start.id)) node.releasePointerCapture(start.id);
      active = false;
      start = null;
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const kind = pointerKind(e.pointerType);
      this.#lastKind = kind;
      start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, kind };
      blockClick = false;
      if (kind === 'touch') {
        timer = setTimeout(() => start && !active && begin(e.clientX, e.clientY), LONG_PRESS_MS);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      if (!active) {
        const d = dragDecision(
          start.kind,
          e.clientX - start.x,
          e.clientY - start.y,
          performance.now() - start.t,
        );
        if (d === 'cancel') {
          clearTimeout(timer);
          start = null;
          return;
        }
        if (d === 'wait') return;
        begin(e.clientX, e.clientY);
      }
      track(e.clientX, e.clientY);
    };

    const onUp = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const wasDrag = active;
      finish(true);
      if (!wasDrag) {
        // A plain tap or click: keep the card open, or close it when the same item is hit again.
        this.selected = this.selected?.item.id === held.item.id ? null : held;
        blockClick = true;
      }
    };

    const onCancel = () => finish(false);

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || this.dragging) return;
      const r = node.getBoundingClientRect();
      this.hovered = {
        ...held,
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      };
    };
    const onLeave = () => {
      if (this.hovered?.item.id === held.item.id) this.hovered = null;
    };

    const onDouble = (e: MouseEvent) => {
      e.preventDefault();
      this.hovered = null;
      this.selected = null;
      this.#handlers.quick(held.item, held.from);
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      if (this.#lastKind === 'touch') return;
      this.hovered = null;
      this.selected = null;
      this.#handlers.quick(held.item, held.from);
    };
    const onClick = (e: MouseEvent) => {
      if (blockClick) e.stopPropagation();
    };

    node.addEventListener('pointerdown', onDown);
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onCancel);
    node.addEventListener('pointerenter', onEnter);
    node.addEventListener('pointerleave', onLeave);
    node.addEventListener('dblclick', onDouble);
    node.addEventListener('contextmenu', onContext);
    node.addEventListener('click', onClick, true);

    return {
      update: (next: Held) => {
        held = next;
      },
      destroy: () => {
        finish(false);
        if (this.hovered?.item.id === held.item.id) this.hovered = null;
        node.removeEventListener('pointerdown', onDown);
        node.removeEventListener('pointermove', onMove);
        node.removeEventListener('pointerup', onUp);
        node.removeEventListener('pointercancel', onCancel);
        node.removeEventListener('pointerenter', onEnter);
        node.removeEventListener('pointerleave', onLeave);
        node.removeEventListener('dblclick', onDouble);
        node.removeEventListener('contextmenu', onContext);
        node.removeEventListener('click', onClick, true);
      },
    };
  };
}

const KEY = Symbol('inventory-dnd');
export const provideDnd = (d: InventoryDnd) => setContext(KEY, d);
export const useDnd = () => getContext<InventoryDnd>(KEY);
