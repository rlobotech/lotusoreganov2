<script lang="ts">
  import type { ItemInfo } from '@game/shared';
  import type { Snippet } from 'svelte';
  import { ATTR_LABELS, cap, SLOT_LABELS } from '../labels.ts';
  import ItemIcon from './ItemIcon.svelte';
  import { compareItems, gearLines } from './itemUi.ts';

  let {
    item,
    worn = null,
    wornBy = '',
    actions,
  }: {
    item: ItemInfo;
    /** The item currently worn in the same slot, to compare against. */
    worn?: ItemInfo | null;
    /** Name of who wears it, for the comparison line. */
    wornBy?: string;
    actions?: Snippet;
  } = $props();

  const lines = $derived(compareItems(item, worn));
  const combat = $derived(gearLines(item));
  const total = $derived(lines.reduce((s, l) => s + (l.diff ?? 0), 0));
</script>

<div class="card-item">
  <div class="head">
    <ItemIcon {item} size={40} />
    <div>
      <div class="name {item.rarity}">{item.name}</div>
      <div class="muted small">
        {cap(item.rarity)} · Level {item.itemLevel}{item.slot ? ` · ${SLOT_LABELS[item.slot]}` : ''}
      </div>
    </div>
  </div>

  {#if combat.length}
    <ul class="gear">
      {#each combat as line (line)}<li>{line}</li>{/each}
    </ul>
  {/if}

  {#if lines.length}
    <ul class="stats">
      {#each lines as l (l.attr)}
        <li>
          <span>{ATTR_LABELS[l.attr]}</span>
          <span class="val">
            {l.value >= 0 ? '+' : ''}{l.value}
            {#if l.diff !== undefined && l.diff !== 0}
              <span class={l.diff > 0 ? 'up' : 'down'}>({l.diff > 0 ? '+' : ''}{l.diff})</span>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted small">No attribute bonuses.</p>
  {/if}

  {#if worn}
    <p class="small cmp">
      Compared with {worn.name}{wornBy ? ` worn by ${wornBy}` : ''}:
      <span class={total > 0 ? 'up' : total < 0 ? 'down' : 'muted'}>
        {total > 0 ? 'better' : total < 0 ? 'worse' : 'equal'}
      </span>
    </p>
  {/if}

  <div class="muted small">Worth {item.value} gold{item.favorite ? ' · favorite' : ''}</div>

  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</div>

<style>
  .card-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 200px;
  }
  .head {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .name {
    font-weight: bold;
  }
  .stats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  .gear {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.85em;
  }
  .up {
    color: var(--green);
  }
  .down {
    color: #e06a6a;
  }
  .cmp,
  p {
    margin: 0;
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 4px;
  }
</style>
