<script lang="ts">
  import type { QuestInfo } from '@game/shared';
  import { api, ApiError } from '../api.ts';
  import { manage, session } from '../session.svelte.ts';

  const party = $derived(session.party!);
  let quests = $state.raw<QuestInfo[]>([]);
  let error = $state('');
  let showDone = $state(false);

  async function load() {
    try {
      quests = (await api.quests(party.id)).quests;
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Could not load quests.';
    }
  }

  // Reload when anything that changes quest status changes (taking, progress, level, completion).
  $effect(() => {
    void party.level;
    void party.quests.completedCount;
    void JSON.stringify(party.quests.active.map((q) => q.objectives.map((o) => o.progress)));
    load();
  });

  async function run(call: Parameters<typeof manage>[0]) {
    error = await manage(call);
    await load();
  }

  const active = $derived(quests.filter((q) => q.status === 'active'));
  const available = $derived(quests.filter((q) => q.status === 'available'));
  const locked = $derived(quests.filter((q) => q.status === 'locked'));
  const done = $derived(quests.filter((q) => q.status === 'completed'));
  const pct = (a: number, b: number) => `${Math.min(100, (a / b) * 100)}%`;
</script>

<h3>Quests</h3>
<p class="muted small intro">
  Taking a quest adds it to the order list. The party travels to where the objective is, hunts the
  monsters, or clears the dungeon, and is paid when it is done. Kills count for every quest that
  wants them.
</p>
{#if error}<p class="bad">{error}</p>{/if}

{#snippet reward(q: QuestInfo)}
  <div class="small reward">
    <span class="good">{q.reward.gold} gold</span> · {q.reward.xp} xp
    {#if q.reward.item}· <span class={q.reward.item.rarity}>{q.reward.item.name}</span>{/if}
  </div>
{/snippet}

<div class="label">Active ({active.length} / 5)</div>
{#each active as q (q.id)}
  <div class="card">
    <div class="row">
      <strong>{q.name}</strong>
      <button onclick={() => run(() => api.abandonQuest(party.id, q.id))}>Abandon</button>
    </div>
    <div class="muted small">{q.description}</div>
    {#each q.objectives as o}
      <div class="obj" class:done={o.done}>
        <div class="row small">
          <span>{o.done ? '✓ ' : ''}{o.label}</span>
          <span class="muted">{o.progress} / {o.target}</span>
        </div>
        <div class="bar thin">
          <div class="fill xp" style="width:{pct(o.progress, o.target)}"></div>
        </div>
      </div>
    {/each}
    {@render reward(q)}
    {#if q.opens}<div class="small">Opens {q.opens}.</div>{/if}
  </div>
{:else}
  <div class="card muted small">No active quests. Take one below.</div>
{/each}

<div class="label">Available</div>
{#each available as q (q.id)}
  <div class="card">
    <div class="row">
      <strong>{q.name}</strong>
      <span class="muted small">Level {q.minLevel}+{q.repeatable ? ' · repeatable' : ''}</span>
    </div>
    <div class="muted small">{q.description}</div>
    {#each q.objectives as o}<div class="small">{o.label}</div>{/each}
    {@render reward(q)}
    {#if q.opens}<div class="small">Opens {q.opens}.</div>{/if}
    <button
      class="primary"
      disabled={active.length >= 5}
      onclick={() => run(() => api.acceptQuest(party.id, q.id))}
    >
      Take this quest
    </button>
  </div>
{:else}
  <div class="card muted small">Nothing new right now. Level up and clear more of the world.</div>
{/each}

{#if locked.length}
  <div class="label">Not yet</div>
  {#each locked as q (q.id)}
    <div class="card dim">
      <div class="row">
        <strong>{q.name}</strong>
        <span class="muted small">Level {q.minLevel}+</span>
      </div>
      <div class="bad small">{q.reason}</div>
    </div>
  {/each}
{/if}

{#if done.length}
  <button onclick={() => (showDone = !showDone)}>
    {showDone ? 'Hide' : 'Show'} completed ({done.length})
  </button>
  {#if showDone}
    {#each done as q (q.id)}
      <div class="card dim"><span class="good">{'✓'}</span> {q.name}</div>
    {/each}
  {/if}
{/if}

<style>
  .intro {
    margin: 0;
  }
  .obj.done {
    opacity: 0.65;
  }
  .reward {
    margin-top: 2px;
  }
  .dim {
    opacity: 0.8;
  }
</style>
