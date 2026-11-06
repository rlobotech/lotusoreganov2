<script lang="ts">
  import { buildDemoFeed } from './lib/feed.ts';
  import ReplayLab from './lib/ReplayLab.svelte';
  import Slideshow from './lib/Slideshow.svelte';

  let tab = $state<'slideshow' | 'lab'>('slideshow');
  let feedKey = $state(0);
  const feed = $derived.by(() => {
    void feedKey;
    return buildDemoFeed();
  });
</script>

<main>
  <nav>
    <h1>Lotus Oregano</h1>
    <div class="tabs">
      <button class:active={tab === 'slideshow'} onclick={() => (tab = 'slideshow')}>
        Return slideshow
      </button>
      <button class:active={tab === 'lab'} onclick={() => (tab = 'lab')}>Replay lab</button>
    </div>
  </nav>
  <div class="content">
    {#if tab === 'slideshow'}
      {#key feedKey}
        <Slideshow items={feed} />
      {/key}
    {:else}
      <ReplayLab />
    {/if}
  </div>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 1100px;
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
  }
</style>
