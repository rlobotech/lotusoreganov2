<script lang="ts">
  import { session } from '../session.svelte.ts';
  import AiTab from './AiTab.svelte';
  import BagTab from './BagTab.svelte';
  import CharacterTab from './CharacterTab.svelte';
  import CityTab from './CityTab.svelte';
  import OrdersTab from './OrdersTab.svelte';
  import OverviewTab from './OverviewTab.svelte';

  type Tab = 'character' | 'ai' | 'party' | 'bag' | 'orders' | 'city';
  let { start = 'character', onclose }: { start?: Tab; onclose: () => void } = $props();

  const party = $derived(session.party!);
  // The tab to open first; after that the player's own choice wins.
  // svelte-ignore state_referenced_locally
  let chosen = $state<Tab>(start);
  let memberId = $state(session.party!.members[0]!.id);

  // The city tab only exists while the party is standing in a city.
  const tabs = $derived<Array<{ id: Tab; label: string }>>([
    { id: 'character', label: 'Character' },
    { id: 'ai', label: 'AI' },
    { id: 'party', label: 'Party' },
    { id: 'bag', label: 'Bag' },
    { id: 'orders', label: 'Orders' },
    ...(party.city ? [{ id: 'city' as Tab, label: 'City' }] : []),
  ]);
  const tab = $derived(tabs.some((t) => t.id === chosen) ? chosen : 'character');
  const unspent = $derived(party.members.reduce((s, m) => s + m.points, 0));
</script>

<div class="menu" role="dialog" aria-label="Manage the party">
  <header>
    <h2>{party.name}</h2>
    <button onclick={onclose}>Close</button>
  </header>
  <div class="tabs" role="tablist">
    {#each tabs as t}
      <button
        role="tab"
        aria-selected={tab === t.id}
        class:active={tab === t.id}
        onclick={() => (chosen = t.id)}
      >
        {t.label}
        {#if t.id === 'character' && unspent > 0}<span class="dot">{unspent}</span>{/if}
      </button>
    {/each}
  </div>
  <div class="body">
    {#if tab === 'character'}
      <CharacterTab bind:memberId />
    {:else if tab === 'ai'}
      <AiTab bind:memberId />
    {:else if tab === 'party'}
      <OverviewTab
        onpick={(id) => {
          memberId = id;
          chosen = 'character';
        }}
      />
    {:else if tab === 'bag'}
      <BagTab />
    {:else if tab === 'orders'}
      <OrdersTab />
    {:else if tab === 'city'}
      <CityTab />
    {/if}
  </div>
</div>

<style>
  .menu {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--bg);
    padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
      max(10px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
    max-width: 860px;
    margin: 0 auto;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  header h2 {
    color: var(--gold);
    font-size: 18px;
  }
  .tabs {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .tabs button {
    white-space: nowrap;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-bottom: 12px;
  }
  /* Children keep their natural height and the body scrolls, instead of squashing them. */
  .body > :global(*) {
    flex-shrink: 0;
  }
  .dot {
    display: inline-block;
    min-width: 18px;
    margin-left: 4px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--gold);
    color: #1a1408;
    font-size: 12px;
    text-align: center;
  }
</style>
