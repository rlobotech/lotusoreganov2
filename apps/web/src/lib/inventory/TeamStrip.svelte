<script lang="ts">
  import type { MemberInfo } from '@game/shared';
  import { cap } from '../labels.ts';
  import CharacterFigure from './CharacterFigure.svelte';

  let {
    members,
    selected,
    onselect,
  }: {
    members: MemberInfo[];
    selected: string;
    onselect: (id: string) => void;
  } = $props();
</script>

<!-- Portraits only. They share the width, so the strip never needs a scrollbar. -->
<div class="strip" role="tablist" aria-label="Party">
  {#each members as m (m.id)}
    <button
      role="tab"
      aria-selected={selected === m.id}
      aria-label="{m.name}, {cap(m.race)} {cap(m.cls)}{m.mine ? '' : ', another player'}"
      title="{m.name} · {cap(m.race)} {cap(m.cls)}"
      class="member"
      class:active={selected === m.id}
      class:down={!m.alive}
      class:other={!m.mine}
      onclick={() => onselect(m.id)}
    >
      <CharacterFigure race={m.race} cls={m.cls} size={44} alive={m.alive} />
      {#if m.points > 0 && m.mine}<span class="dot" title="Unspent points">{m.points}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .strip {
    display: flex;
    justify-content: center;
    gap: 6px;
  }
  .member {
    position: relative;
    flex: 0 1 64px;
    min-width: 0;
    min-height: 0;
    padding: 4px;
    display: flex;
    justify-content: center;
    background: #0d0b10;
  }
  .member :global(.fig) {
    flex: none;
  }
  .active {
    border-color: var(--gold);
    box-shadow: inset 0 -2px 0 var(--gold);
  }
  .down {
    opacity: 0.6;
  }
  .other {
    opacity: 0.85;
  }
  .dot {
    position: absolute;
    top: -6px;
    right: -4px;
    min-width: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--gold);
    color: #1a1408;
    font-size: 12px;
    text-align: center;
  }
</style>
