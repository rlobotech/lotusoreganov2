<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { FeedItem } from './feed.ts';
  import ReplayView from './ReplayView.svelte';

  let { items }: { items: FeedItem[] } = $props();

  let index = $state(0);
  let finished = $state(false);
  let rewatching = $state<FeedItem | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const CARD_MS = 4500;

  const current = $derived(index < items.length ? items[index]! : null);
  const fights = $derived(items.filter((i) => i.kind === 'fight'));

  function next() {
    index += 1;
    finished = false;
  }
  function skipAll() {
    index = items.length;
  }
  function restart() {
    index = 0;
    finished = false;
    rewatching = null;
  }

  $effect(() => {
    clearTimeout(timer);
    if (current?.kind === 'card') {
      timer = setTimeout(next, CARD_MS);
    }
    return () => clearTimeout(timer);
  });
  onDestroy(() => clearTimeout(timer));
</script>

{#if rewatching && rewatching.kind === 'fight'}
  <section class="screen">
    <header>
      <div>
        <h2>{rewatching.title}</h2>
        <div class="muted">{rewatching.subtitle}</div>
      </div>
      <button onclick={() => (rewatching = null)}>Back</button>
    </header>
    <div class="body"><ReplayView events={rewatching.events} /></div>
  </section>
{:else if current}
  <section class="screen">
    <header>
      <div>
        <h2>While you were away</h2>
        <div class="muted">{index + 1} of {items.length}</div>
      </div>
      <div class="actions">
        <button onclick={next}>Skip this</button>
        <button onclick={skipAll}>Skip all</button>
      </div>
    </header>

    {#if current.kind === 'fight'}
      {#key index}
        <div class="body">
          <div class="fight-title">
            {current.title} <span class="muted">{current.subtitle}</span>
          </div>
          <ReplayView events={current.events} onfinished={() => (finished = true)} />
        </div>
      {/key}
      <footer>
        <button class:primary={finished} onclick={next}>
          {finished ? 'Continue' : 'Skip fight'}
        </button>
      </footer>
    {:else}
      {#key index}
        <div class="card {current.tone}">
          <h3>{current.title}</h3>
          {#each current.lines as line}
            <p>{line}</p>
          {/each}
          <div class="timer">
            <div class="timer-fill" style="animation-duration:{CARD_MS}ms"></div>
          </div>
        </div>
      {/key}
      <footer>
        <button class="primary" onclick={next}>Continue</button>
      </footer>
    {/if}
  </section>
{:else}
  <section class="screen">
    <header>
      <div>
        <h2>The party</h2>
        <div class="muted">The world map arrives in a later milestone.</div>
      </div>
      <button onclick={restart}>Show slideshow again</button>
    </header>
    <div class="card info">
      <h3>World map</h3>
      <p>The hex world map and the management menu will appear here.</p>
    </div>
    <h3 class="replays-title">Replays</h3>
    <div class="replays">
      {#each fights as f}
        {#if f.kind === 'fight'}
          <button class="replay-item" onclick={() => (rewatching = f)}>
            <strong>{f.title}</strong>
            <span class="muted">{f.subtitle}</span>
          </button>
        {/if}
      {/each}
    </div>
  </section>
{/if}

<style>
  .screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    gap: 10px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .body :global(.replay) {
    flex: 1;
  }
  .fight-title {
    font-size: 16px;
  }
  footer {
    display: flex;
  }
  footer button {
    flex: 1;
  }
  .muted {
    color: var(--muted);
    font-size: 13px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 18px;
    margin: auto 0;
  }
  .card.good {
    border-color: var(--gold);
  }
  .card p {
    margin: 10px 0 0;
    line-height: 1.5;
  }
  .timer {
    height: 3px;
    margin-top: 16px;
    background: var(--panel-2);
    border-radius: 2px;
    overflow: hidden;
  }
  .timer-fill {
    height: 100%;
    background: var(--gold);
    transform-origin: left;
    animation: fill linear forwards;
  }
  @keyframes fill {
    from {
      transform: scaleX(0);
    }
    to {
      transform: scaleX(1);
    }
  }
  .replays-title {
    margin-top: 8px;
  }
  .replays {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: auto;
  }
  .replay-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-align: left;
  }
</style>
