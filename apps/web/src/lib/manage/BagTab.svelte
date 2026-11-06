<script lang="ts">
  import { api } from '../api.ts';
  import { fmtBonuses, SLOT_LABELS } from '../labels.ts';
  import { manage, session } from '../session.svelte.ts';

  const party = $derived(session.party!);
  let error = $state('');
  let target = $state<Record<string, string>>({});

  const rank = { epic: 3, rare: 2, uncommon: 1, common: 0 } as const;
  const sorted = $derived(
    [...party.bag].sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        rank[b.rarity] - rank[a.rarity] ||
        b.itemLevel - a.itemLevel,
    ),
  );

  const run = async (call: Parameters<typeof manage>[0]) => (error = await manage(call));
  const memberFor = (itemId: string) => target[itemId] ?? party.members[0]!.id;
</script>

<div class="row">
  <h3>Shared bag</h3>
  <span class="muted">{party.bag.length} / 40</span>
</div>
<p class="muted small intro">
  When the bag is full, the lowest quality item that is not a favorite is thrown away for new loot.
  Mark things you want to keep with the star.
</p>
{#if error}<p class="bad">{error}</p>{/if}

{#each sorted as item (item.id)}
  <div class="card item">
    <div class="row">
      <span class={item.rarity}>{item.name}</span>
      <button
        class="icon-btn star"
        class:on={item.favorite}
        onclick={() => run(() => api.favorite(party.id, item.id, !item.favorite))}
        aria-label={item.favorite ? 'Remove favorite' : 'Mark as favorite'}
      >
        {item.favorite ? '★' : '☆'}
      </button>
    </div>
    <div class="muted small">
      Level {item.itemLevel}
      {#if item.slot}· {SLOT_LABELS[item.slot]}{/if}
      {#if item.bonuses}· {fmtBonuses(item.bonuses)}{/if}
      · worth {item.value} gold
    </div>
    <div class="actions">
      {#if item.slot}
        <select bind:value={target[item.id]} aria-label="Who wears it">
          {#each party.members as m}<option value={m.id} selected={m.id === memberFor(item.id)}
              >{m.name}</option
            >{/each}
        </select>
        <button onclick={() => run(() => api.equip(party.id, memberFor(item.id), item.id))}
          >Equip</button
        >
      {/if}
      <button disabled={item.favorite} onclick={() => run(() => api.discard(party.id, item.id))}>
        Discard
      </button>
    </div>
  </div>
{:else}
  <div class="card muted">The bag is empty. Loot from fights ends up here.</div>
{/each}

<style>
  .intro {
    margin: 0;
  }
  .item .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .star {
    font-size: 18px;
  }
  .star.on {
    color: var(--gold-bright);
  }
</style>
