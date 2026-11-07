<script lang="ts">
  import { mineFirst } from '../members.ts';
  import { session } from '../session.svelte.ts';
  import AiTab from './AiTab.svelte';
  import AttributesTab from './AttributesTab.svelte';
  import CaravanTab from './CaravanTab.svelte';
  import CityTab from './CityTab.svelte';
  import InventoryTab from './InventoryTab.svelte';
  import QuestsOrdersTab from './QuestsOrdersTab.svelte';
  import SpellbookTab from './SpellbookTab.svelte';

  type Tab = 'inventory' | 'attributes' | 'spellbook' | 'quests' | 'ai' | 'caravan' | 'city';
  let { start = 'inventory', onclose }: { start?: Tab; onclose: () => void } = $props();

  const party = $derived(session.party!);
  // The tab to open first; after that the player's own choice wins.
  // svelte-ignore state_referenced_locally
  let chosen = $state<Tab>(start);
  let memberId = $state(mineFirst(session.party!.members)[0]!.id);

  const unspent = $derived(party.members.reduce((s, m) => s + m.points, 0));

  // Simple 24x24 line icons, one per tab.
  const ICONS: Record<Tab, string> = {
    inventory: 'M6 9h12l1 11H5L6 9Zm3 0V7a3 3 0 0 1 6 0v2M9 13h6',
    attributes: 'M5 20V10m5 10V4m5 16v-7m5 7V8',
    spellbook: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h11M10 8h5',
    quests: 'M8 3h10v15a3 3 0 0 1-3 3H6a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3h2Zm3 5h4m-4 4h4',
    ai: 'M12 3v3m0 12v3M3 12h3m12 0h3M7 7l2 2m6 6 2 2m0-10-2 2m-6 6-2 2M9 9h6v6H9z',
    caravan:
      'M3 17h18M5 17V9h9v8M14 12h4l3 3v2M7 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
    city: 'M4 21V10l4-3 4 3v11M12 21V6l4-3 4 3v15M2 21h20M7 14h2m6-5h2m-2 4h2',
  };

  // The city tab only exists while the party is standing in a city.
  const tabs = $derived<Array<{ id: Tab; label: string; badge?: number }>>([
    { id: 'inventory', label: 'Inventory' },
    { id: 'attributes', label: 'Attributes', badge: unspent },
    { id: 'spellbook', label: 'Spellbook' },
    { id: 'quests', label: 'Quests' },
    { id: 'ai', label: 'AI' },
    { id: 'caravan', label: 'Caravan' },
    ...(party.city ? [{ id: 'city' as Tab, label: 'City' }] : []),
  ]);
  const tab = $derived(tabs.some((t) => t.id === chosen) ? chosen : 'inventory');
</script>

<div class="menu" role="dialog" aria-label="Manage the party">
  <header>
    <h2>{party.name}</h2>
    <button onclick={onclose}>Close</button>
  </header>
  <div class="tabs" role="tablist">
    {#each tabs as t (t.id)}
      <button
        role="tab"
        aria-selected={tab === t.id}
        class:active={tab === t.id}
        onclick={() => (chosen = t.id)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={ICONS[t.id]} />
        </svg>
        <span class="label">{t.label}</span>
        {#if t.badge}<span class="dot" title="Unspent points">{t.badge}</span>{/if}
      </button>
    {/each}
  </div>
  <div class="body" class:fill={tab === 'inventory'}>
    {#if tab === 'inventory'}
      <InventoryTab bind:memberId />
    {:else if tab === 'attributes'}
      <AttributesTab bind:memberId />
    {:else if tab === 'spellbook'}
      <SpellbookTab bind:memberId />
    {:else if tab === 'quests'}
      <QuestsOrdersTab />
    {:else if tab === 'ai'}
      <AiTab bind:memberId />
    {:else if tab === 'caravan'}
      <CaravanTab />
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
    max-width: 1400px;
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

  /* Tab bar: a strip of equal tabs with an icon over the label on phones, icon beside it on wide
     screens. The active tab gets a gold underline and a lit icon. */
  .tabs {
    display: flex;
    gap: 2px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 3px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs button {
    flex: 1 0 auto;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 62px;
    min-height: 52px;
    padding: 4px 10px;
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: var(--muted);
    white-space: nowrap;
  }
  .tabs button:hover {
    color: var(--text);
    background: var(--panel-2);
  }
  .tabs button.active {
    color: var(--gold-bright);
    background: #231e14;
    box-shadow: inset 0 -2px 0 var(--gold);
  }
  svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .label {
    font-size: 12px;
    letter-spacing: 0.04em;
  }
  @media (min-width: 640px) {
    .tabs button {
      flex-direction: row;
      gap: 8px;
      min-height: 44px;
      padding: 0 16px;
    }
    .label {
      font-size: 14px;
    }
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
  /* The inventory fits the window: its own pieces share the height and only the shared bag scrolls.
     On a window too short for that, the whole tab scrolls instead. */
  .body.fill > :global(.inv) {
    flex: 1 1 0;
    min-height: 0;
  }
  .dot {
    position: absolute;
    top: 2px;
    right: 6px;
    min-width: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--gold);
    color: #1a1408;
    font-size: 12px;
    text-align: center;
  }
</style>
