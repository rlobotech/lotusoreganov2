<script lang="ts">
  import type { MemberInfo } from '@game/shared';
  import { cap } from '../labels.ts';
  import BagGrid from './BagGrid.svelte';
  import CharacterFigure from './CharacterFigure.svelte';
  import ItemSlot from './ItemSlot.svelte';
  import { SLOT_LAYOUT } from './layout.ts';

  let {
    member,
    personalSize,
    active = false,
    onsendgold,
  }: {
    member: MemberInfo;
    personalSize: number;
    active?: boolean;
    /** Opens the "send gold" dialog for this character. */
    onsendgold?: (member: MemberInfo) => void;
  } = $props();

  const SLOT = 40;
</script>

<section class="panel" class:active class:other={!member.mine} data-member={member.id}>
  <header>
    <div class="top">
      <h3>{member.name}</h3>
      <button
        class="gold"
        title={member.mine ? 'Send gold to another character' : `Send gold to ${member.name}`}
        onclick={() => onsendgold?.(member)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 4.5v7M6 6.5c0-1.4 4-1.4 4 0s-4 1.2-4 2.8 4 1.4 4 0" />
        </svg>
        {member.gold}
      </button>
    </div>
    <span class="muted small">
      {cap(member.race)}
      {cap(member.cls)}{member.mine ? '' : ' · other player'}
    </span>
  </header>

  <div class="doll">
    <div class="col left">
      {#each SLOT_LAYOUT.left as slot (slot)}
        <ItemSlot
          place={{ kind: 'equip', memberId: member.id, slot }}
          item={member.equipment[slot] ?? null}
          size={SLOT}
        />
      {/each}
    </div>
    <div class="figure">
      <CharacterFigure race={member.race} cls={member.cls} alive={member.alive} size={112} />
    </div>
    <div class="col right">
      {#each SLOT_LAYOUT.right as slot (slot)}
        <ItemSlot
          place={{ kind: 'equip', memberId: member.id, slot }}
          item={member.equipment[slot] ?? null}
          size={SLOT}
        />
      {/each}
    </div>
    <div class="bottom">
      {#each SLOT_LAYOUT.bottom as slot (slot)}
        <ItemSlot
          place={{ kind: 'equip', memberId: member.id, slot }}
          item={member.equipment[slot] ?? null}
          size={SLOT}
        />
      {/each}
    </div>
  </div>

  <BagGrid
    title="Personal bag"
    items={member.bag}
    capacity={personalSize}
    place={{ kind: 'personal', memberId: member.id }}
    columns={5}
    size={SLOT}
  />
</section>

<style>
  /* Exactly as wide as five slots, so the personal bag lines up with both columns of gear. */
  .panel {
    flex: 0 0 auto;
    width: calc(5 * 46px + 4 * 3px + 2 * 10px + 2px);
    scroll-snap-align: start;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .active {
    border-color: #6a5a2a;
  }
  .other {
    background: #131118;
  }
  header {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  h3 {
    margin: 0;
    color: var(--gold);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gold {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 0;
    padding: 2px 8px;
    color: var(--gold-bright);
    flex: none;
  }
  .gold svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
    stroke-linecap: round;
  }
  .doll {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 6px;
    align-items: start;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .figure {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100%;
    background: radial-gradient(ellipse at 50% 85%, #2a2236 0%, transparent 70%);
  }
  .bottom {
    grid-column: 1 / 4;
    display: flex;
    justify-content: center;
    gap: 12px;
  }
</style>
