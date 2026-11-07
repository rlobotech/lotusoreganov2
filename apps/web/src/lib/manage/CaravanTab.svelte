<script lang="ts">
  import type { CaravanKindName, ItemInfo, PetShopInfo } from '@game/shared';
  import { api, ApiError } from '../api.ts';
  import { cap } from '../labels.ts';
  import { manage, session } from '../session.svelte.ts';

  const party = $derived(session.party!);
  let error = $state('');
  let shop = $state.raw<PetShopInfo | null>(null);
  let sendItems = $state<Record<string, boolean>>({});
  let wanted = $state<Record<string, number>>({});
  let now = $state(Date.now());

  const KINDS: Array<{ kind: CaravanKindName; label: string; hint: string }> = [
    { kind: 'mount', label: 'Mount', hint: 'Faster travel on the world map' },
    { kind: 'pet', label: 'Carrier pet', hint: 'Sells and buys in the nearest city for you' },
    { kind: 'bag', label: 'Bag item', hint: 'More slots in the shared bag' },
    { kind: 'tent', label: 'Tent', hint: 'Faster recovery when resting' },
  ];

  const pct = (v: number | undefined) => `${Math.round((v ?? 0) * 100)}%`;

  /** What an accessory does, from the tier tables the server sends. */
  function effectText(item: ItemInfo): string {
    const c = item.caravan;
    if (!c) return '';
    const t = party.caravanTiers;
    const i = c.tier - 1;
    switch (c.kind) {
      case 'mount':
        return `+${pct(t.mountSpeed[i])} travel speed`;
      case 'bag':
        return `+${t.bagSlots[i]} shared bag slots`;
      case 'tent':
        return `+${pct(t.tentHealing[i])} faster recovery`;
      case 'pet': {
        const ab =
          c.abilities?.map((a) => (a === 'scavenger' ? 'may find items' : 'fast return')) ?? [];
        return [
          `carries ${t.petBag[i]} items`,
          `sells for ${pct(t.petSaleRate[i])} of the price`,
          `speed x${t.petSpeed[i]}`,
          ...ab,
        ].join(' · ');
      }
    }
  }

  const inBag = $derived(party.bag.filter((i) => i.caravan));
  const pet = $derived(party.pet);

  async function run(call: Parameters<typeof manage>[0]) {
    error = await manage(call);
  }

  async function loadShop() {
    if (!pet.equipped) {
      shop = null;
      return;
    }
    try {
      shop = await api.petShop(party.id);
    } catch (err) {
      shop = null;
      error = err instanceof ApiError ? err.message : 'Could not load the pet shop.';
    }
  }
  $effect(() => {
    void pet.equipped;
    void party.pos.col;
    void party.pos.row;
    loadShop();
  });

  // A clock for the countdown while the pet is out.
  $effect(() => {
    if (!pet.trip) return;
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const sellable = $derived(party.bag.filter((i) => !i.favorite && !i.caravan));
  const chosen = $derived(sellable.filter((i) => sendItems[i.id]));
  const sale = $derived(
    chosen.reduce((s, i) => s + Math.floor((i.value * pet.saleRate) / 0.25), 0),
  );
  const cart = $derived(
    (shop?.stock ?? []).flatMap((s) => Array.from({ length: wanted[s.id] ?? 0 }, () => s)),
  );
  const cost = $derived(cart.reduce((s, x) => s + x.price, 0));
  const canSend = $derived(
    !pet.trip &&
      pet.equipped &&
      chosen.length <= pet.capacity &&
      (chosen.length > 0 || cart.length > 0) &&
      cost <= sale + party.spendableGold,
  );

  function adjust(id: string, delta: number) {
    wanted[id] = Math.max(0, Math.min(20, (wanted[id] ?? 0) + delta));
  }

  async function send() {
    const itemIds = chosen.map((i) => i.id);
    const stockIds = cart.map((s) => s.id);
    error = await manage(() => api.sendPet(party.id, itemIds, stockIds));
    if (!error) {
      sendItems = {};
      wanted = {};
    }
  }

  function remaining(ms: number): string {
    const s = Math.max(0, Math.round((ms - now) / 1000));
    return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
  }
</script>

<div class="row">
  <h3>Caravan</h3>
  <span class="muted small">
    Shared by the whole party. Accessories take a shared bag slot until equipped.
  </span>
</div>
{#if error}<p class="bad">{error}</p>{/if}

<div class="slots">
  {#each KINDS as k (k.kind)}
    {@const it = party.caravan[k.kind]}
    <div class="card slot">
      <div class="label">{k.label}</div>
      {#if it}
        <div class="name {it.rarity}">
          {it.name} <span class="muted small">tier {it.caravan?.tier}</span>
        </div>
        <div class="muted small">{effectText(it)}</div>
        <button
          disabled={k.kind === 'pet' && (!!pet.trip || pet.waiting.length > 0)}
          onclick={() => run(() => api.unequipCaravan(party.id, k.kind))}
        >
          Unequip
        </button>
      {:else}
        <div class="muted">Empty</div>
        <div class="muted small">{k.hint}</div>
      {/if}
    </div>
  {/each}
</div>

<div class="card">
  <div class="label">Accessories in the bag</div>
  {#each inBag as it (it.id)}
    <div class="row item">
      <div>
        <div class="name {it.rarity}">
          {it.name}
          <span class="muted small">{cap(it.caravan!.kind)} · tier {it.caravan!.tier}</span>
        </div>
        <div class="muted small">{effectText(it)}</div>
      </div>
      <button onclick={() => run(() => api.equipCaravan(party.id, it.id))}>Equip</button>
    </div>
  {:else}
    <div class="muted small">
      None. Accessories are mostly quest rewards, and now and then a monster drops one.
    </div>
  {/each}
</div>

{#if pet.equipped}
  <div class="card">
    <div class="label">Carrier pet</div>
    {#if pet.trip}
      <div>
        {#if pet.trip.phase === 'out'}
          On its way to {pet.trip.city} with {pet.trip.items} item{pet.trip.items === 1 ? '' : 's'}.
        {:else}
          Heading back from {pet.trip.city}.
        {/if}
      </div>
      <div class="muted small">
        {pet.trip.phase === 'out'
          ? `Reaches the city in ${remaining(pet.trip.arriveAt)} · `
          : ''}Back in {remaining(pet.trip.endsAt)}. Selling and buying in the city are blocked
        until it returns.
      </div>
    {:else}
      <div class="muted small">
        Sends goods to {shop?.city.name ?? 'the nearest city'} to sell, and buys what you list. It sells
        for {pct(pet.saleRate)} of the price and carries up to {pet.capacity} items. The sale is shared
        evenly; your share pays for your shopping first.
      </div>
    {/if}

    {#if pet.waiting.length}
      <div class="label">Holding for the bag</div>
      {#each pet.waiting as it (it.id)}
        <div class="small {it.rarity}">{it.name}</div>
      {/each}
      <div class="muted small">They move into the shared bag as soon as there is room.</div>
    {/if}

    {#if !pet.trip}
      <div class="label">Items to sell ({chosen.length}/{pet.capacity})</div>
      <div class="list">
        {#each sellable as it (it.id)}
          <label class="check">
            <input type="checkbox" bind:checked={sendItems[it.id]} />
            <span class={it.rarity}>{it.name}</span>
            <span class="muted small">worth {it.value}</span>
          </label>
        {:else}
          <div class="muted small">Nothing in the shared bag to sell.</div>
        {/each}
      </div>

      <div class="label">Shopping list</div>
      <div class="list">
        {#each shop?.stock ?? [] as s (s.id)}
          <div class="row item">
            <div>
              <span class={s.rarity}>{s.name}</span>
              <span class="muted small">L{s.itemLevel} · {s.price} gold</span>
            </div>
            <div class="qty">
              <button class="icon-btn" disabled={!wanted[s.id]} onclick={() => adjust(s.id, -1)}
                >-</button
              >
              <span>{wanted[s.id] ?? 0}</span>
              <button class="icon-btn" onclick={() => adjust(s.id, 1)}>+</button>
            </div>
          </div>
        {/each}
      </div>

      <div class="row">
        <span class="muted small">
          Sale {sale} gold · shopping {cost} gold · your gold {party.spendableGold}
        </span>
        <button class="primary" disabled={!canSend} onclick={send}>Send the pet</button>
      </div>
      {#if cost > sale + party.spendableGold}
        <p class="bad small">Not enough gold for that shopping list.</p>
      {/if}
    {/if}
  </div>
{/if}

<style>
  h3 {
    margin: 0;
  }
  .slots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 10px;
  }
  .slot {
    min-height: 96px;
  }
  .name {
    font-weight: bold;
  }
  .item {
    align-items: center;
    gap: 8px;
    border-top: 1px solid var(--line);
    padding-top: 6px;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 240px;
    overflow-y: auto;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .check input {
    width: 20px;
    height: 20px;
  }
  .qty {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
