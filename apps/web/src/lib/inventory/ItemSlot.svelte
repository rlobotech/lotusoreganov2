<script lang="ts">
  import type { ItemInfo } from '@game/shared';
  import { useDnd } from './dnd.svelte.ts';
  import ItemIcon from './ItemIcon.svelte';
  import { canDrop, encodeTarget, samePlace, SLOT_GLYPHS, type ItemPlace } from './itemUi.ts';

  let {
    place,
    item = null,
    size = 48,
    droppable = true,
    hint = '',
  }: {
    /** Where this cell is: a worn slot, or a bag. It is also what a drop here means. */
    place: ItemPlace;
    item?: ItemInfo | null;
    size?: number;
    /** Bag cells are not drop targets themselves: the whole grid is. */
    droppable?: boolean;
    /** Faint text for an empty cell, such as the slot letter. */
    hint?: string;
  } = $props();

  const dnd = useDnd();
  const target = $derived(encodeTarget(place));
  const valid = $derived(
    droppable &&
      !!dnd.dragging &&
      canDrop(dnd.dragging.item, place) &&
      !samePlace(dnd.dragging.from, place),
  );
  const hot = $derived(valid && !!dnd.over && encodeTarget(dnd.over) === target);
  const selected = $derived(!!item && dnd.selected?.item.id === item.id);
  const glyph = $derived(hint || (place.kind === 'equip' ? SLOT_GLYPHS[place.slot] : ''));
</script>

{#if item}
  <div
    class="cell filled"
    class:valid
    class:hot
    class:selected
    style:--s="{size}px"
    data-drop={droppable ? target : undefined}
    use:dnd.draggable={{ item, from: place }}
    role="button"
    tabindex="0"
    aria-label={item.name}
  >
    <ItemIcon {item} {size} />
  </div>
{:else}
  <div
    class="cell"
    class:valid
    class:hot
    style:--s="{size}px"
    data-drop={droppable ? target : undefined}
    aria-label="Empty slot"
  >
    {#if glyph}<span class="hint">{glyph}</span>{/if}
  </div>
{/if}

<style>
  .cell {
    width: calc(var(--s) + 6px);
    height: calc(var(--s) + 6px);
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d0b10;
    border: 1px solid var(--line);
    border-radius: 4px;
    position: relative;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .filled {
    cursor: grab;
    background: #17141c;
    touch-action: pan-y;
  }
  .filled:active {
    cursor: grabbing;
  }
  .hint {
    color: var(--line);
    font-size: calc(var(--s) * 0.4);
    font-weight: bold;
  }
  .valid {
    border-color: var(--gold);
    box-shadow: 0 0 0 1px #c9a24a55;
  }
  .hot {
    border-color: var(--gold-bright);
    background: #2a2412;
    box-shadow: 0 0 6px 1px #f2d04a88;
  }
  .selected {
    border-color: var(--gold-bright);
  }
</style>
