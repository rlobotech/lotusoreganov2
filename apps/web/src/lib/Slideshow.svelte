<script lang="ts">
  import type { FeedItem } from './feedItems.ts';
  import ReplayLoader from './ReplayLoader.svelte';

  let {
    items,
    onseen,
    onfinish,
  }: {
    items: FeedItem[];
    /** Called with the id of the last feed entry the player has now watched or skipped. */
    onseen?: (lastId: number) => void;
    onfinish: () => void;
  } = $props();

  let index = $state(0);
  let finished = $state(false);
  const CARD_MS = 4500;

  const current = $derived(index < items.length ? items[index]! : null);

  function finishAll() {
    const last = items[items.length - 1];
    if (last) onseen?.(last.lastId);
    onfinish();
  }

  function next() {
    const item = items[index];
    if (item) onseen?.(item.lastId);
    finished = false;
    if (index + 1 >= items.length) return onfinish();
    index += 1;
  }

  // Cards advance on their own so a long absence does not need a tap per card.
  $effect(() => {
    if (current?.kind !== 'card') return;
    const timer = setTimeout(next, CARD_MS);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (items.length === 0) onfinish();
  });
</script>

{#if current}
  <section class="screen">
    <header>
      <div>
        <h2>While you were away</h2>
        <div class="muted">{index + 1} of {items.length}</div>
      </div>
      <div class="actions">
        <button onclick={next}>Skip this</button>
        <button onclick={finishAll}>Skip all</button>
      </div>
    </header>

    {#if current.kind === 'fight'}
      {#key index}
        <div class="body">
          <div class="fight-title">
            {current.title} <span class="muted">{current.subtitle}</span>
          </div>
          <ReplayLoader
            replayId={current.replayId}
            events={current.events}
            onfinished={() => (finished = true)}
          />
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
  .card.bad {
    border-color: var(--red);
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
</style>
