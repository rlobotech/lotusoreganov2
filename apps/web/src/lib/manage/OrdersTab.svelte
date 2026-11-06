<script lang="ts">
  import { api } from '../api.ts';
  import { manage, session } from '../session.svelte.ts';

  const party = $derived(session.party!);
  const world = $derived(session.world!);
  let error = $state('');

  const run = async (call: Parameters<typeof manage>[0]) => (error = await manage(call));
  /** Order endpoints answer with the order list only, so fetch the whole party afterwards. */
  const withParty = (call: () => Promise<unknown>) => async () => {
    await call();
    return { party: (await api.myParty()).party! };
  };
  const site = (id: string) => world.sites.find((s) => s.id === id);
  const addable = $derived(
    world.sites.filter(
      (s) => !party.orders.some((o) => o.siteId === s.id) && s.id !== party.lastCity,
    ),
  );
  let choice = $state('');
</script>

<h3>Orders</h3>
<p class="muted small">
  The party works through its orders from the top, and hunts on its own when there are none. You can
  also tap a place on the world map.
</p>
{#if error}<p class="bad">{error}</p>{/if}

{#each party.orders as o, i}
  {@const s = site(o.siteId)}
  <div class="card">
    <div class="row">
      <span><strong>{i + 1}.</strong> Go to {s?.name ?? o.siteId}</span>
      <span class="actions">
        <button
          class="icon-btn"
          disabled={i === 0}
          onclick={() => run(() => api.moveOrder(party.id, o.id, -1))}
          aria-label="Move up">&uarr;</button
        >
        <button
          class="icon-btn"
          disabled={i === party.orders.length - 1}
          onclick={() => run(() => api.moveOrder(party.id, o.id, 1))}
          aria-label="Move down">&darr;</button
        >
        <button
          class="icon-btn"
          onclick={() => run(withParty(() => api.removeOrder(party.id, o.id)))}
          aria-label="Cancel order">&times;</button
        >
      </span>
    </div>
    {#if s?.dungeon}
      <div class="muted small">
        {s.dungeon.stages} stages · recommended level {s.dungeon.recommendedLevel} · rest: {s
          .dungeon.restPolicy}
      </div>
    {/if}
  </div>
{:else}
  <div class="card muted">No orders. The party is hunting.</div>
{/each}

<div class="card">
  <div class="label">Add an order</div>
  <div class="add">
    <select bind:value={choice} aria-label="Place">
      <option value="">Choose a place...</option>
      {#each addable as s}<option value={s.id}>{s.name}</option>{/each}
    </select>
    <button
      class="primary"
      disabled={!choice}
      onclick={async () => {
        await run(withParty(() => api.addOrder(party.id, choice)));
        choice = '';
      }}
    >
      Send there
    </button>
  </div>
  <div class="muted small">Quests arrive in a later update.</div>
</div>

<style>
  .actions {
    display: flex;
    gap: 4px;
  }
  .add {
    display: flex;
    gap: 8px;
  }
  .add select {
    flex: 1;
  }
</style>
