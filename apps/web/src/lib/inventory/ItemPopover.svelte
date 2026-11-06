<script lang="ts">
  import type { ItemInfo } from '@game/shared';
  import type { Snippet } from 'svelte';
  import { useDnd, type Held } from './dnd.svelte.ts';
  import { placeTooltip } from './gesture.ts';
  import ItemCard from './ItemCard.svelte';

  let {
    compare,
    actions: extra,
  }: {
    /** The worn item to compare with, and who wears it (null when there is nothing to compare). */
    compare: (item: ItemInfo) => { item: ItemInfo; by: string } | null;
    /** Buttons for the open card (Equip, Move, Favorite...). */
    actions?: Snippet<[Held, () => void]>;
  } = $props();

  const dnd = useDnd();
  const hovered = $derived(dnd.selected ? null : dnd.hovered);
  let tip = $state<HTMLElement | null>(null);
  let pos = $state({ x: 0, y: 0 });

  // Place the tooltip next to its item once it has a size.
  $effect(() => {
    if (!hovered || !tip) return;
    const r = tip.getBoundingClientRect();
    pos = placeTooltip(
      hovered.rect,
      { w: r.width, h: r.height },
      { w: innerWidth, h: innerHeight },
    );
  });

  const close = () => dnd.select(null);
  const cmp = (item: ItemInfo) => {
    const c = compare(item);
    return c && c.item.id !== item.id ? c : null;
  };
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') close();
  }}
/>

{#if hovered}
  {@const c = cmp(hovered.item)}
  <div class="tip" bind:this={tip} style:left="{pos.x}px" style:top="{pos.y}px">
    <ItemCard item={hovered.item} worn={c?.item ?? null} wornBy={c?.by ?? ''} />
  </div>
{/if}

{#if dnd.selected}
  {@const sel = dnd.selected}
  {@const c = cmp(sel.item)}
  <button class="scrim" aria-label="Close item card" onclick={close}></button>
  <div class="sheet" role="dialog" aria-label={sel.item.name}>
    <ItemCard item={sel.item} worn={c?.item ?? null} wornBy={c?.by ?? ''}>
      {#snippet actions()}
        {#if extra}{@render extra(sel, close)}{/if}
        <button onclick={close}>Close</button>
      {/snippet}
    </ItemCard>
  </div>
{/if}

<style>
  .tip,
  .sheet {
    position: fixed;
    z-index: 900;
    background: var(--panel);
    border: 1px solid var(--gold);
    border-radius: 8px;
    padding: 10px 12px;
    box-shadow: 0 6px 24px #000a;
  }
  .tip {
    pointer-events: none;
    max-width: 260px;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 800;
    background: #0006;
    border: 0;
    border-radius: 0;
    padding: 0;
  }
  .sheet {
    left: 50%;
    bottom: max(12px, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    width: min(360px, calc(100vw - 24px));
  }
</style>
