<script lang="ts">
  import type { ItemInfo, MemberInfo } from '@game/shared';
  import { onMount } from 'svelte';
  import { api } from '../api.ts';
  import BagGrid from '../inventory/BagGrid.svelte';
  import CharacterPanel from '../inventory/CharacterPanel.svelte';
  import { InventoryDnd, provideDnd, type Held } from '../inventory/dnd.svelte.ts';
  import ItemPopover from '../inventory/ItemPopover.svelte';
  import type { DropTarget, ItemPlace } from '../inventory/itemUi.ts';
  import TeamStrip from '../inventory/TeamStrip.svelte';
  import { mineFirst } from '../members.ts';
  import { manage, session } from '../session.svelte.ts';
  import SendGold from './SendGold.svelte';

  let { memberId = $bindable() }: { memberId: string } = $props();

  const party = $derived(session.party!);
  const members = $derived(mineFirst(party.members));
  const focus = $derived(members.find((m) => m.id === memberId) ?? members[0]!);
  let error = $state('');
  let panels = $state<HTMLElement | null>(null);
  let sending = $state<MemberInfo | null>(null);

  async function run(call: Parameters<typeof manage>[0]) {
    error = await manage(call);
  }

  const move = (item: ItemInfo, to: DropTarget) => run(() => api.moveItem(party.id, item.id, to));
  const owns = (id: string) => party.members.find((m) => m.id === id)?.mine ?? false;

  const dnd = new InventoryDnd({
    move: (item, _from, to) => void move(item, to),
    owns,
    // Double or right click: wear it, or send a worn item back to the bags.
    quick: (item, from) => {
      if (from.kind === 'equip') {
        const bagFull = party.bag.length >= party.bagSize;
        void move(item, bagFull ? { kind: 'personal', memberId: from.memberId } : { kind: 'bag' });
      } else if (item.slot && focus.mine) {
        void move(item, { kind: 'equip', memberId: focus.id });
      }
    },
  });
  provideDnd(dnd);

  /** The item the focused character wears in the same slot, to compare against. */
  const wornFor = (item: ItemInfo) => {
    const w = item.slot ? focus.equipment[item.slot] : undefined;
    return w ? { item: w, by: focus.name } : null;
  };

  const ownerOf = (from: ItemPlace) => (from.kind === 'bag' ? null : from.memberId);

  // The panel nearest the left edge of the scroller is the one in focus.
  onMount(() => {
    if (!panels) return;
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting && e.intersectionRatio > 0.6)
          .sort((a, b) => a.boundingClientRect.left - b.boundingClientRect.left)[0];
        const id = (best?.target as HTMLElement | undefined)?.dataset.member;
        if (id) memberId = id;
      },
      { root: panels, threshold: [0.6, 0.9] },
    );
    for (const el of panels.querySelectorAll('[data-member]')) io.observe(el);
    return () => io.disconnect();
  });

  function show(id: string) {
    memberId = id;
    panels
      ?.querySelector(`[data-member="${id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }
</script>

<div class="inv">
  <TeamStrip {members} selected={focus.id} onselect={show} />
  {#if error}<p class="bad">{error}</p>{/if}

  <div class="panels" bind:this={panels}>
    {#each members as m (m.id)}
      <CharacterPanel
        member={m}
        personalSize={party.personalBagSize}
        active={m.id === focus.id}
        onsendgold={(who) => (sending = who)}
      />
    {/each}
  </div>

  <section class="shared">
    <div class="bar-row">
      <button onclick={() => run(() => api.sortBag(party.id))}>Sort</button>
    </div>
    {#if party.pendingItems.length}
      <p class="warn small">
        Waiting for a free slot: {party.pendingItems.map((i) => i.name).join(', ')}
      </p>
    {/if}
    <div class="scroll">
      <BagGrid
        title="Shared bag"
        items={party.bag}
        capacity={party.bagSize}
        place={{ kind: 'bag' }}
        columns={40}
        size={40}
      />
    </div>
  </section>
</div>

{#if sending}<SendGold member={sending} onclose={() => (sending = null)} />{/if}

<ItemPopover compare={wornFor}>
  {#snippet actions(held: Held, close: () => void)}
    {@const owner = ownerOf(held.from)}
    {#if owner !== null && !owns(owner)}
      <span class="muted small">Belongs to another player.</span>
    {:else}
      {#if held.item.slot && focus.mine}
        <button
          onclick={() => {
            void move(held.item, { kind: 'equip', memberId: focus.id });
            close();
          }}
        >
          {held.from.kind === 'equip' && held.from.memberId === focus.id
            ? 'Worn'
            : `Equip: ${focus.name}`}
        </button>
      {/if}
      {#if held.from.kind !== 'bag'}
        <button
          onclick={() => {
            void move(held.item, { kind: 'bag' });
            close();
          }}>To shared bag</button
        >
      {/if}
      {#if focus.mine && !(held.from.kind === 'personal' && held.from.memberId === focus.id)}
        <button
          onclick={() => {
            void move(held.item, { kind: 'personal', memberId: owner ?? focus.id });
            close();
          }}>To {owner ? 'personal bag' : `${focus.name}'s bag`}</button
        >
      {/if}
      <button
        onclick={() => {
          void run(() => api.favorite(party.id, held.item.id, !held.item.favorite));
          close();
        }}>{held.item.favorite ? 'Unfavorite' : 'Favorite'}</button
      >
      {#if held.from.kind !== 'equip'}
        <button
          disabled={held.item.favorite}
          onclick={() => {
            void run(() => api.discard(party.id, held.item.id));
            close();
          }}>Discard</button
        >
      {/if}
    {/if}
  {/snippet}
</ItemPopover>

<style>
  /* Fills the menu: the party and its panels keep their height, the shared bag takes the rest and
     is the only part that scrolls. */
  .inv {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .panels {
    flex: none;
    display: flex;
    gap: 10px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    padding-bottom: 4px;
    scrollbar-width: thin;
  }
  .shared {
    flex: 1 1 0;
    min-height: 150px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  .scroll > :global(.bag) {
    min-height: 100%;
  }
  .bar-row {
    flex: none;
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }
  .warn {
    color: #e08a4a;
  }
  p {
    margin: 0;
  }
</style>
