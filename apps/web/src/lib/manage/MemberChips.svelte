<script lang="ts">
  import { session } from '../session.svelte.ts';

  let { selected = $bindable() }: { selected: string } = $props();
  const members = $derived(session.party?.members ?? []);
</script>

<div class="chips" role="tablist" aria-label="Party member">
  {#each members as m}
    <button
      class:active={selected === m.id}
      class:down={!m.alive}
      onclick={() => (selected = m.id)}
    >
      {m.name}
      {#if m.points > 0}<span class="dot" title="Unspent points">{m.points}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .down {
    opacity: 0.55;
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
