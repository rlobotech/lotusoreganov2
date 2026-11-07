<script lang="ts">
  import OrdersTab from './OrdersTab.svelte';
  import QuestsTab from './QuestsTab.svelte';

  let view = $state<'quests' | 'orders'>('quests');
</script>

<div class="switch" role="tablist" aria-label="Quests and orders">
  <button
    role="tab"
    aria-selected={view === 'quests'}
    class:active={view === 'quests'}
    onclick={() => (view = 'quests')}
  >
    Quests
  </button>
  <button
    role="tab"
    aria-selected={view === 'orders'}
    class:active={view === 'orders'}
    onclick={() => (view = 'orders')}
  >
    Orders
  </button>
</div>

{#if view === 'quests'}
  <QuestsTab />
{:else}
  <OrdersTab />
{/if}

<style>
  .switch {
    display: flex;
    gap: 6px;
  }
  .switch button {
    flex: 1;
  }
</style>
