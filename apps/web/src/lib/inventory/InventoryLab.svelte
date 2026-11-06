<script lang="ts">
  // A sandbox for the inventory pieces: a local party (no server) that uses the real game rules.
  import {
    createParty,
    discardItem,
    equipItem,
    moveItem,
    setFavorite,
    shopItem,
    SLOTS,
    STARTER_WORLD,
    type Item,
    type PartyState,
  } from '@game/world';
  import type { ItemInfo } from '@game/shared';
  import BagGrid from './BagGrid.svelte';
  import { InventoryDnd, provideDnd, type Held } from './dnd.svelte.ts';
  import ItemPopover from './ItemPopover.svelte';
  import ItemSlot from './ItemSlot.svelte';
  import type { DropTarget, ItemPlace } from './itemUi.ts';

  const make = (base: string, level: number, rarity: Item['rarity'], id: string): Item => {
    const s = shopItem(base, level, rarity);
    return {
      id,
      name: s.name,
      rarity: s.rarity,
      itemLevel: s.itemLevel,
      value: s.value,
      favorite: false,
      slot: s.slot,
      bonuses: { ...s.bonuses },
    };
  };

  const start = createParty({
    id: 'lab',
    name: 'Lab',
    seed: 7,
    now: 0,
    world: STARTER_WORLD,
    members: [
      { name: 'Astarion', race: 'elf', cls: 'ranger' },
      { name: 'Gale', race: 'human', cls: 'mage' },
    ],
  });
  start.members[0]!.equipment.weapon = make('Iron Dagger', 3, 'common', 'w1');
  start.bag.push(
    make('Rusty Sword', 5, 'rare', 'a1'),
    make('Iron Dagger', 6, 'uncommon', 'a2'),
    make('Gnarled Staff', 4, 'epic', 'a3'),
    make('Leather Cap', 2, 'common', 'a4'),
    make('Padded Vest', 3, 'uncommon', 'a5'),
    make('Copper Ring', 4, 'rare', 'a6'),
    make('Bone Charm', 4, 'uncommon', 'a7'),
  );
  start.members[1]!.bag.push(make('Spell Tome', 3, 'rare', 'p1'));

  let party = $state<PartyState>(start);
  let message = $state('');
  const cfg = { bagSize: 40 };

  function run(r: { ok: boolean; error?: string }) {
    message = r.ok ? '' : (r.error ?? 'Refused');
  }

  const toTarget = (to: DropTarget) => to;
  const dnd = new InventoryDnd({
    move: (item, _from, to) => run(moveItem(party, item.id, toTarget(to), cfg)),
    quick: (item, from) => {
      if (from.kind === 'equip') run(moveItem(party, item.id, { kind: 'bag' }, cfg));
      else if (item.slot)
        run(moveItem(party, item.id, { kind: 'equip', memberId: party.members[0]!.id }, cfg));
    },
  });
  provideDnd(dnd);

  const wornFor = (item: ItemInfo) => {
    if (!item.slot) return null;
    for (const m of party.members) {
      const w = m.equipment[item.slot];
      if (w) return { item: w as ItemInfo, by: m.name };
    }
    return null;
  };

  const placeOf = (h: Held): ItemPlace => h.from;
</script>

<div class="lab">
  <h2>Inventory lab</h2>
  <p class="muted small">
    Drag items onto slots and bags. Double click or right click wears an item (or sends a worn one
    back to the bag). Hover for details, click to open the card. On a phone: tap, or hold and drag.
  </p>
  {#if message}<p class="bad">{message}</p>{/if}

  {#each party.members as m (m.id)}
    <section class="panel">
      <h3>{m.name}</h3>
      <div class="slots">
        {#each SLOTS as slot (slot)}
          <ItemSlot
            place={{ kind: 'equip', memberId: m.id, slot }}
            item={m.equipment[slot] ?? null}
            size={40}
          />
        {/each}
      </div>
      <BagGrid
        title="Personal bag"
        items={m.bag}
        capacity={5}
        place={{ kind: 'personal', memberId: m.id }}
        columns={5}
      />
    </section>
  {/each}

  <section class="panel">
    <BagGrid
      title="Shared bag"
      items={party.bag}
      capacity={40}
      place={{ kind: 'bag' }}
      columns={8}
    />
  </section>
</div>

<ItemPopover compare={wornFor}>
  {#snippet actions(held, close)}
    {#if held.item.slot && held.from.kind !== 'equip'}
      {#each party.members as m (m.id)}
        <button
          onclick={() => {
            run(equipItem(party, m.id, held.item.id));
            close();
          }}>Equip: {m.name}</button
        >
      {/each}
    {/if}
    {#if placeOf(held).kind !== 'bag'}
      <button
        onclick={() => {
          run(moveItem(party, held.item.id, { kind: 'bag' }, cfg));
          close();
        }}>To shared bag</button
      >
    {/if}
    <button
      onclick={() => {
        run(setFavorite(party, held.item.id, !held.item.favorite));
        close();
      }}>{held.item.favorite ? 'Unfavorite' : 'Favorite'}</button
    >
    {#if held.from.kind !== 'equip'}
      <button
        onclick={() => {
          run(discardItem(party, held.item.id));
          close();
        }}>Discard</button
      >
    {/if}
  {/snippet}
</ItemPopover>

<style>
  .lab {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    overflow-y: auto;
    padding: 10px 12px 40px;
  }
  h2,
  h3 {
    margin: 0;
    color: var(--gold);
  }
  .panel {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .slots {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
</style>
