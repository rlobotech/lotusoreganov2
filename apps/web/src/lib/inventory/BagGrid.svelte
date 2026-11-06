<script lang="ts">
  import type { ItemInfo } from '@game/shared';
  import { useDnd } from './dnd.svelte.ts';
  import ItemSlot from './ItemSlot.svelte';
  import { canDrop, encodeTarget, samePlace, type ItemPlace } from './itemUi.ts';

  let {
    items,
    capacity,
    place,
    columns = 8,
    size = 40,
    title = '',
  }: {
    items: ItemInfo[];
    capacity: number;
    /** The bag this grid shows: dropping anywhere on it moves the item into this bag. */
    place: Extract<ItemPlace, { kind: 'bag' | 'personal' }>;
    columns?: number;
    size?: number;
    title?: string;
  } = $props();

  const dnd = useDnd();
  // Items beyond the capacity (it can shrink) still show, so nothing is ever hidden.
  const cells = $derived(Math.max(capacity, items.length));
  const valid = $derived(
    !!dnd.dragging && canDrop(dnd.dragging.item, place) && !samePlace(dnd.dragging.from, place),
  );
  const hot = $derived(valid && !!dnd.over && encodeTarget(dnd.over) === encodeTarget(place));
  const full = $derived(items.length >= capacity);
</script>

<div class="bag" class:valid class:hot data-drop={encodeTarget(place)}>
  {#if title}
    <div class="title">
      <span>{title}</span>
      <span class="muted small" class:warn={full}>{items.length} / {capacity}</span>
    </div>
  {/if}
  <div class="grid" style:--cell="{size + 6}px" style:--cols={columns}>
    {#each { length: cells } as _, i (i)}
      <ItemSlot {place} item={items[i] ?? null} {size} droppable={false} />
    {/each}
  </div>
</div>

<style>
  .bag {
    padding: 6px;
    border: 1px solid transparent;
    border-radius: 6px;
    min-width: 0;
  }
  .valid {
    border-color: #c9a24a66;
  }
  .hot {
    border-color: var(--gold-bright);
    background: #2a241222;
  }
  .title {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
    color: var(--gold);
  }
  .warn {
    color: #e08a4a;
  }
  .grid {
    display: grid;
    gap: 3px;
    justify-content: start;
    /* As many columns as fit, never more than asked for. */
    grid-template-columns: repeat(auto-fill, var(--cell));
    max-width: calc(var(--cols) * (var(--cell) + 3px));
  }
</style>
