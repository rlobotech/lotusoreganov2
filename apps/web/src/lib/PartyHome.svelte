<script lang="ts">
  import type { ReplayListEntry } from '@game/shared';
  import { onMount } from 'svelte';
  import { api, ApiError } from './api.ts';
  import ReplayLoader from './ReplayLoader.svelte';
  import { refreshParty, session } from './session.svelte.ts';
  import WorldMap from './WorldMap.svelte';

  let { onwatch }: { onwatch: () => void } = $props();

  const party = $derived(session.party!);
  const world = $derived(session.world!);

  let selected = $state<string | null>(null);
  let now = $state(Date.now());
  let hasNew = $state(false);
  let replays = $state<ReplayListEntry[] | null>(null);
  let viewing = $state<ReplayListEntry | null>(null);
  let error = $state('');

  const site = $derived(selected ? (world.sites.find((s) => s.id === selected) ?? null) : null);
  const siteLocked = $derived.by(() => {
    if (!site) return false;
    const zone = world.zones.find((z) => z.id === world.zoneOf[site.row * world.width + site.col]);
    return !!zone?.unlockedBy && !party.cleared.includes(zone.unlockedBy);
  });
  const ordered = $derived(site ? party.orders.some((o) => o.siteId === site.id) : false);

  async function poll() {
    try {
      await refreshParty();
      const f = await api.feed(party.id, undefined, 1);
      hasNew = f.events.length > 0;
    } catch {
      // The next poll will try again.
    }
  }

  onMount(() => {
    poll();
    const poller = setInterval(poll, 5000);
    const clock = setInterval(() => (now = Date.now()), 1000);
    return () => {
      clearInterval(poller);
      clearInterval(clock);
    };
  });

  async function act(fn: () => Promise<unknown>) {
    error = '';
    try {
      await fn();
      await refreshParty();
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Something went wrong.';
    }
  }

  async function loadReplays() {
    replays = (await api.replays(party.id)).replays;
  }

  function remaining(endsAt: number | null): string {
    if (endsAt === null) return '';
    const s = Math.max(0, Math.round((endsAt - now) / 1000));
    if (s <= 0) return 'any moment';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}h ${String(m).padStart(2, '0')}m`
      : `${m}m ${String(sec).padStart(2, '0')}s`;
  }

  const pct = (a: number, b: number) => `${Math.max(0, Math.min(100, (a / b) * 100))}%`;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const siteName = (id: string) => world.sites.find((s) => s.id === id)?.name ?? id;
  const rank = { epic: 3, rare: 2, uncommon: 1, common: 0 } as const;
  const bagTop = $derived(
    [...party.bag]
      .sort((a, b) => rank[b.rarity] - rank[a.rarity] || b.itemLevel - a.itemLevel)
      .slice(0, 6),
  );
</script>

{#if viewing}
  <section class="viewing">
    <header>
      <div>
        <h2>{viewing.title}</h2>
        <div class="muted">{viewing.outcome}{viewing.pinned ? ' · pinned' : ''}</div>
      </div>
      <button onclick={() => (viewing = null)}>Back</button>
    </header>
    <div class="replay"><ReplayLoader replayId={viewing.id} /></div>
  </section>
{:else}
  <div class="home">
    <div class="map"><WorldMap {world} {party} bind:selected /></div>

    <aside class="panel">
      <div class="card">
        <div class="title">
          <h2>{party.name}</h2>
          {#if party.mode === 'hardcore'}<span class="badge">Hardcore</span>{/if}
        </div>
        <div class="muted">Level {party.level} · {party.gold} gold · {party.stats.wins} wins</div>
        <div class="bar">
          <div class="fill xp" style="width:{pct(party.xp, party.xpToNext)}"></div>
        </div>
        <div class="muted small">{party.xp} / {party.xpToNext} xp</div>
      </div>

      {#if hasNew}
        <button class="primary" onclick={onwatch}>Watch what happened</button>
      {/if}

      <div class="card">
        <div class="label">Now</div>
        <div>{party.activity.label}</div>
        {#if party.activity.endsAt}
          <div class="muted small">done in {remaining(party.activity.endsAt)}</div>
        {/if}
        {#if party.dungeon}
          <div class="muted small">
            {party.dungeon.name}: stage {party.dungeon.stage + 1} of {party.dungeon.stages}
          </div>
        {/if}
        {#if party.status === 'dead'}<div class="bad">The party has fallen.</div>{/if}
      </div>

      {#if site}
        <div class="card site">
          <div class="label">
            {site.kind === 'city'
              ? 'City'
              : site.kind === 'boss_dungeon'
                ? 'Boss dungeon'
                : 'Dungeon'}
          </div>
          <h3>{site.name}</h3>
          {#if site.dungeon}
            <div class="muted small">
              {site.dungeon.stages} stages · recommended level {site.dungeon.recommendedLevel}
              {#if site.dungeon.recommendedLevel > party.level + 1}· <span class="bad"
                  >dangerous</span
                >{/if}
            </div>
            <div class="muted small">
              {party.cleared.includes(site.id) ? 'Cleared' : `Rest: ${site.dungeon.restPolicy}`}
            </div>
          {/if}
          {#if siteLocked}
            <div class="muted small">This region is closed until its guardian falls.</div>
          {:else if ordered}
            <div class="muted small">Already in the order list.</div>
          {:else if party.status === 'active'}
            <button class="primary" onclick={() => act(() => api.addOrder(party.id, site.id))}>
              Send the party here
            </button>
          {/if}
        </div>
      {/if}

      {#if error}<p class="bad">{error}</p>{/if}

      <div class="card">
        <div class="label">Orders</div>
        {#each party.orders as o, i}
          <div class="row">
            <span>{i + 1}. {siteName(o.siteId)}</span>
            <button
              class="small-btn"
              onclick={() => act(() => api.removeOrder(party.id, o.id))}
              aria-label="Cancel order"
            >
              &times;
            </button>
          </div>
        {:else}
          <div class="muted small">
            None. The party hunts on its own. Tap a place on the map to send it somewhere.
          </div>
        {/each}
      </div>

      <div class="card">
        <div class="label">Party</div>
        {#each party.members as m}
          <div class="member" class:down={!m.alive}>
            <div class="row">
              <strong>{m.name}</strong><span class="muted small">{cap(m.race)} {cap(m.cls)}</span>
            </div>
            <div class="bar"><div class="fill hp" style="width:{pct(m.hp, m.maxHp)}"></div></div>
            <div class="bar thin">
              <div class="fill mp" style="width:{pct(m.mana, m.maxMana)}"></div>
            </div>
          </div>
        {/each}
      </div>

      <div class="card">
        <div class="label">Bag {party.bag.length} / 40</div>
        {#each bagTop as item}
          <div class="row">
            <span class={item.rarity}>{item.name}</span><span class="muted small"
              >L{item.itemLevel}</span
            >
          </div>
        {:else}
          <div class="muted small">Empty.</div>
        {/each}
        {#if party.bag.length > bagTop.length}<div class="muted small">
            and {party.bag.length - bagTop.length} more
          </div>{/if}
      </div>

      <div class="card">
        <div class="label">Replays</div>
        {#if replays === null}
          <button onclick={loadReplays}>Show recent fights</button>
        {:else}
          {#each replays.slice(0, 15) as r}
            <button class="replay-item" onclick={() => (viewing = r)}>
              <span>{r.title}</span>
              <span class="muted small">{r.outcome}{r.pinned ? ' ★' : ''}</span>
            </button>
          {:else}
            <div class="muted small">No fights yet.</div>
          {/each}
        {/if}
      </div>
    </aside>
  </div>
{/if}

<style>
  .home {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 12px;
    height: 100%;
    min-height: 0;
  }
  .map {
    min-height: 260px;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    padding-right: 2px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .card h3 {
    font-size: 16px;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .title h2 {
    font-size: 18px;
    color: var(--gold);
  }
  .badge {
    font-size: 11px;
    padding: 2px 6px;
    border: 1px solid var(--red);
    border-radius: 10px;
    color: #ff9a9a;
  }
  .label {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 12px;
  }
  .bad {
    color: #ff8a8a;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .bar {
    height: 6px;
    background: #2a2430;
    border-radius: 3px;
    overflow: hidden;
  }
  .bar.thin {
    height: 3px;
  }
  .fill {
    height: 100%;
  }
  .fill.xp {
    background: var(--gold);
  }
  .fill.hp {
    background: var(--green);
  }
  .fill.mp {
    background: #4a8af2;
  }
  .member {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding-bottom: 4px;
  }
  .member.down {
    opacity: 0.5;
  }
  .small-btn {
    min-height: 32px;
    min-width: 32px;
    padding: 0;
  }
  .replay-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-align: left;
    min-height: 40px;
    gap: 8px;
    font-size: 14px;
  }
  .common {
    color: var(--text);
  }
  .uncommon {
    color: #7ad07a;
  }
  .rare {
    color: #6aa8ff;
  }
  .epic {
    color: #c78aff;
  }
  .viewing {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    min-height: 0;
  }
  .viewing header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .replay {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .replay :global(.replay) {
    flex: 1;
  }
  @media (max-width: 800px) {
    .home {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(260px, 42vh) minmax(0, 1fr);
    }
  }
</style>
