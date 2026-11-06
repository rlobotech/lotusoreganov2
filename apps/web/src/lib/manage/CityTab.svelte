<script lang="ts">
  import type { CityInfo } from '@game/shared';
  import { api, ApiError } from '../api.ts';
  import { fmtBonuses, SLOT_LABELS } from '../labels.ts';
  import { manage, session } from '../session.svelte.ts';

  const party = $derived(session.party!);
  let info = $state.raw<CityInfo | null>(null);
  let error = $state('');
  let selected = $state<Record<string, boolean>>({});

  async function load() {
    try {
      info = await api.city(party.id);
    } catch (err) {
      info = null;
      error = err instanceof ApiError ? err.message : 'Could not load the city.';
    }
  }

  // Reload whenever gold or the bag changes (after buying, selling, teleporting).
  $effect(() => {
    void party.gold;
    void party.bag.length;
    void party.city?.id;
    load();
  });

  async function run(call: Parameters<typeof manage>[0]) {
    error = await manage(call);
    await load();
  }

  const sellable = $derived(party.bag.filter((i) => !i.favorite));
  const chosen = $derived(sellable.filter((i) => selected[i.id]));
  const total = $derived(chosen.reduce((s, i) => s + i.value, 0));
  const bagFull = $derived(party.bag.length >= 40);
</script>

{#if party.city && info}
  <div class="row">
    <h3>{info.city.name}</h3>
    <span class="good">{party.gold} gold</span>
  </div>
  {#if error}<p class="bad">{error}</p>{/if}

  {#if party.inTown}
    <div class="card">
      <div class="muted small">
        The party is resting in town. It will set off when you give it orders, or after a while.
      </div>
      <button onclick={() => run(() => api.leaveTown(party.id))}>Send the party on its way</button>
    </div>
  {/if}

  <div class="card">
    <div class="label">Teleport</div>
    {#each info.teleports as t}
      <div class="row">
        <span>{t.name}</span>
        <button
          disabled={party.gold < t.cost}
          onclick={() => run(() => api.teleport(party.id, t.siteId))}
        >
          {t.cost} gold
        </button>
      </div>
    {:else}
      <div class="muted small">
        You can teleport to other cities once the party has visited them.
      </div>
    {/each}
  </div>

  <div class="card">
    <div class="label">Sell</div>
    {#each sellable as item (item.id)}
      <label class="row sell">
        <span
          ><input type="checkbox" bind:checked={selected[item.id]} />
          <span class={item.rarity}>{item.name}</span></span
        >
        <span class="muted small">{item.value} gold</span>
      </label>
    {:else}
      <div class="muted small">Nothing to sell (favorites are kept).</div>
    {/each}
    {#if sellable.length}
      <button
        class="primary"
        disabled={chosen.length === 0}
        onclick={async () => {
          await run(() =>
            api.sell(
              party.id,
              chosen.map((i) => i.id),
            ),
          );
          selected = {};
        }}
      >
        Sell {chosen.length} for {total} gold
      </button>
    {/if}
  </div>

  <div class="card">
    <div class="label">Shop {bagFull ? '(bag full)' : ''}</div>
    {#each info.stock as s (s.id)}
      <div class="stock">
        <div>
          <div class={s.rarity}>{s.name}</div>
          <div class="muted small">
            {SLOT_LABELS[s.slot]} · L{s.itemLevel} · {fmtBonuses(s.bonuses)}
          </div>
        </div>
        <button
          disabled={party.gold < s.price || bagFull}
          onclick={() => run(() => api.buy(party.id, s.id))}
        >
          {s.price} gold
        </button>
      </div>
    {/each}
  </div>
{:else}
  <div class="card muted">
    The city is only open while the party is in one. Send the party to a city from the map or the
    Orders tab, and it will wait there for you.
  </div>
{/if}

<style>
  .stock {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    border-top: 1px solid var(--line);
    padding-top: 8px;
  }
  .sell {
    min-height: 32px;
  }
</style>
