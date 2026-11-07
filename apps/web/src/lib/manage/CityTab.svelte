<script lang="ts">
  import type { CityInfo } from '@game/shared';
  import { api, ApiError } from '../api.ts';
  import { manage, session } from '../session.svelte.ts';

  const party = $derived(session.party!);
  let info = $state.raw<CityInfo | null>(null);
  let error = $state('');

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
    void party.spendableGold;
    void party.bag.length;
    void party.city?.id;
    load();
  });

  async function run(call: Parameters<typeof manage>[0]) {
    error = await manage(call);
    await load();
  }
</script>

{#if party.city && info}
  <div class="row">
    <h3>{info.city.name}</h3>
    <span class="good" title="Gold of the characters you control">
      Your gold: {party.spendableGold}
    </span>
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
          disabled={party.spendableGold < t.cost}
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
{:else}
  <div class="card muted">
    Teleporting and resting orders are only open while the party is waiting in a city. Shopping is
    in the Trade tab and works anywhere close to a city.
  </div>
{/if}

<style>
</style>
