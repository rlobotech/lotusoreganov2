<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api.ts';
  import AuthScreen from './lib/AuthScreen.svelte';
  import CreateParty from './lib/CreateParty.svelte';
  import { buildFeedItems, type FeedItem } from './lib/feedItems.ts';
  import PartyHome from './lib/PartyHome.svelte';
  import ReplayLab from './lib/ReplayLab.svelte';
  import { boot, logout, session } from './lib/session.svelte.ts';
  import Slideshow from './lib/Slideshow.svelte';

  type View = 'checking' | 'slideshow' | 'home' | 'lab';
  let view = $state<View>('checking');
  let items = $state.raw<FeedItem[]>([]);
  let bootError = $state('');

  onMount(() => {
    boot().catch(() => (bootError = 'Could not reach the server. Is the API running?'));
  });

  /** Everything the player has not watched yet, in order. */
  async function loadUnseen(): Promise<FeedItem[]> {
    const partyId = session.party!.id;
    const entries = [];
    let after: number | undefined;
    for (let page = 0; page < 10; page++) {
      const f = await api.feed(partyId, after);
      entries.push(...f.events);
      if (!f.hasMore) break;
      after = f.events[f.events.length - 1]!.id;
    }
    return buildFeedItems(entries);
  }

  async function startSession() {
    view = 'checking';
    items = await loadUnseen();
    view = items.length > 0 ? 'slideshow' : 'home';
  }

  // Once logged in with a party, show what happened since the last visit.
  let started = false;
  $effect(() => {
    if (session.status === 'ready' && session.party && !started) {
      started = true;
      startSession().catch(() => (view = 'home'));
    }
    if (session.status !== 'ready') started = false;
  });

  function seen(lastId: number) {
    const id = session.party?.id;
    if (id && lastId > 0) api.markSeen(id, lastId).catch(() => undefined);
  }
</script>

<main>
  <nav>
    <h1>Lotus Oregano</h1>
    {#if session.status === 'ready'}
      <div class="tabs">
        {#if session.party}
          <button class:active={view === 'home'} onclick={() => (view = 'home')}>Party</button>
        {/if}
        <button class:active={view === 'lab'} onclick={() => (view = 'lab')}>Replay lab</button>
        <button onclick={logout} title={session.user?.username}>Log out</button>
      </div>
    {/if}
  </nav>

  <div class="content">
    {#if bootError}
      <p class="msg">{bootError}</p>
    {:else if session.status === 'loading'}
      <p class="msg">Loading...</p>
    {:else if session.status === 'anon'}
      <AuthScreen />
    {:else if view === 'lab'}
      <ReplayLab />
    {:else if !session.party}
      <CreateParty />
    {:else if view === 'checking'}
      <p class="msg">Gathering news from the road...</p>
    {:else if view === 'slideshow'}
      <Slideshow {items} onseen={seen} onfinish={() => (view = 'home')} />
    {:else}
      <PartyHome onwatch={startSession} />
    {/if}
  </div>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
      max(10px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
    gap: 10px;
  }
  nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  h1 {
    font-size: 20px;
    color: var(--gold);
  }
  .tabs {
    display: flex;
    gap: 8px;
  }
  .content {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
  }
  .msg {
    text-align: center;
    color: var(--muted);
    margin-top: 12vh;
  }
</style>
