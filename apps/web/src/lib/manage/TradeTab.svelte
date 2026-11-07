<script lang="ts">
  import type { CityInfo, ItemInfo, PetShopInfo, ShopEntry } from '@game/shared';
  import { api, ApiError } from '../api.ts';
  import { caravanEffect } from '../caravanText.ts';
  import ItemIcon from '../inventory/ItemIcon.svelte';
  import { gearLines } from '../inventory/itemUi.ts';
  import { fmtBonuses, SLOT_LABELS } from '../labels.ts';
  import { manage, session } from '../session.svelte.ts';

  const party = $derived(session.party!);
  const pet = $derived(party.pet);

  /** Near a city: trade directly. Far away: the carrier pet shops in the nearest city for you. */
  const near = $derived(!!party.city);

  let city = $state.raw<CityInfo | null>(null);
  let petShop = $state.raw<PetShopInfo | null>(null);
  let error = $state('');
  let offered = $state<Record<string, boolean>>({});
  let wanted = $state<Record<string, number>>({});
  let now = $state(Date.now());

  const stock = $derived<ShopEntry[]>(near ? (city?.stock ?? []) : (petShop?.stock ?? []));
  const cityName = $derived(near ? (city?.city.name ?? party.city?.name) : petShop?.city.name);

  async function load() {
    try {
      if (near) {
        city = await api.city(party.id);
        petShop = null;
      } else if (pet.equipped) {
        petShop = await api.petShop(party.id);
        city = null;
      } else {
        city = null;
        petShop = null;
      }
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Could not load the shop.';
    }
  }
  // Reload when the situation changes (arriving at a city, buying, the shop rotating).
  $effect(() => {
    void near;
    void pet.equipped;
    void party.level; // a level up renews the stock
    void party.pos.col;
    void party.pos.row;
    void party.bag.length;
    load();
  });
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  // What can be sold: near a city the shared bag and your own personal bags, otherwise the shared
  // bag (the pet takes things from there). Accessories that are not equipped can be sold too.
  const mine = $derived(party.members.filter((m) => m.mine));
  const sellable = $derived<ItemInfo[]>(
    near ? [...party.bag, ...mine.flatMap((m) => m.bag)] : party.bag,
  );
  const chosen = $derived(sellable.filter((i) => offered[i.id] && !i.favorite));

  const rate = $derived(pet.saleRate || 0.25);
  const priceOf = (i: ItemInfo) => (near ? i.value : Math.floor((i.value * rate) / 0.25));
  const offerValue = $derived(chosen.reduce((s, i) => s + priceOf(i), 0));
  const cart = $derived(stock.flatMap((s) => Array.from({ length: wanted[s.id] ?? 0 }, () => s)));
  const demandValue = $derived(cart.reduce((s, x) => s + x.price, 0));
  const bagRoom = $derived(
    party.bagSize -
      (party.bag.length - chosen.filter((i) => party.bag.some((b) => b.id === i.id)).length),
  );
  const affordable = $derived(demandValue <= offerValue + party.spendableGold);

  const canTrade = $derived(
    near &&
      (chosen.length > 0 || cart.length > 0) &&
      affordable &&
      cart.length <= bagRoom &&
      !pet.trip,
  );
  const canSend = $derived(
    !near &&
      pet.equipped &&
      !pet.trip &&
      (chosen.length > 0 || cart.length > 0) &&
      chosen.length <= pet.capacity &&
      affordable,
  );

  function toggle(item: ItemInfo) {
    if (item.favorite) return;
    offered[item.id] = !offered[item.id];
  }
  function add(s: ShopEntry, delta: number) {
    wanted[s.id] = Math.max(0, Math.min(20, (wanted[s.id] ?? 0) + delta));
  }
  const asItem = (s: ShopEntry): ItemInfo => ({ ...s, favorite: false }) as ItemInfo;

  function tip(i: ItemInfo | ShopEntry, price?: number): string {
    const lines = [`${i.name} (level ${i.itemLevel})`];
    if (i.caravan) lines.push(caravanEffect(i.caravan, party.caravanTiers));
    if ('slot' in i && i.slot) lines.push(SLOT_LABELS[i.slot]);
    lines.push(...gearLines(i));
    const b = fmtBonuses(i.bonuses);
    if (b) lines.push(b);
    if ('teaches' in i && i.teaches) {
      lines.push(`Teaches ${session.skills.find((s) => s.id === i.teaches)?.name ?? i.teaches}`);
    }
    lines.push(price !== undefined ? `${price} gold` : `worth ${i.value} gold`);
    return lines.join('\n');
  }

  async function run(call: Parameters<typeof manage>[0]) {
    error = await manage(call);
    if (!error) {
      offered = {};
      wanted = {};
    }
    await load();
  }
  const trade = () =>
    run(() =>
      api.trade(
        party.id,
        chosen.map((i) => i.id),
        cart.map((s) => s.id),
      ),
    );
  const send = () =>
    run(() =>
      api.sendPet(
        party.id,
        chosen.map((i) => i.id),
        cart.map((s) => s.id),
      ),
    );

  function left(ms: number): string {
    const s = Math.max(0, Math.round((ms - now) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h} h ${m} min` : s >= 60 ? `${m} min ${s % 60} s` : `${s} s`;
  }
</script>

{#if !near && !pet.equipped}
  <div class="card muted">
    The party is far from every city. Trading needs the party close to a city, or a carrier pet
    equipped in the Caravan tab to shop for you.
  </div>
{:else}
  <div class="head">
    <h3>
      {near ? `Trade in ${cityName ?? 'the city'}` : `Carrier pet to ${cityName ?? 'the city'}`}
    </h3>
    <span class="good" title="Gold of the characters you control"
      >Your gold: {party.spendableGold}</span
    >
  </div>
  {#if near && city}
    <div class="muted small">
      The shop's rotating stock changes at the next level-up or in {left(city.rotatesAt)}.
    </div>
  {/if}
  {#if !near}
    <div class="muted small">
      The party is far away. Pick what to sell and what to buy, then send the carrier: it sells for
      {Math.round(rate * 100)}% of the price and brings the goods back.
    </div>
  {/if}
  {#if error}<p class="bad">{error}</p>{/if}

  {#if pet.trip}
    <div class="card">
      <div class="label">The carrier is out</div>
      <div>
        {pet.trip.phase === 'out'
          ? `On its way to ${pet.trip.city}`
          : `Heading back from ${pet.trip.city}`}
      </div>
      <div class="muted small">
        {pet.trip.phase === 'out' ? `Reaches the city in ${left(pet.trip.arriveAt)} · ` : ''}Back in
        {left(pet.trip.endsAt)}. Trading is closed until it returns.
      </div>
    </div>
  {:else}
    <div class="trade">
      <section class="card mine" aria-label="Your items">
        <div class="label">
          Your items {near ? '' : `(${chosen.length}/${pet.capacity} for the pet)`}
        </div>
        <div class="grid">
          {#each sellable as it (it.id)}
            <button
              class="cell"
              class:sel={offered[it.id]}
              class:fav={it.favorite}
              title={tip(it)}
              aria-pressed={!!offered[it.id]}
              aria-label="{it.name}, worth {priceOf(it)} gold"
              onclick={() => toggle(it)}
            >
              <ItemIcon item={it} size={40} />
            </button>
          {:else}
            <div class="muted small">Nothing to sell.</div>
          {/each}
        </div>
        <div class="muted tiny">
          Click to offer. Favorites are kept. The money is shared evenly.
        </div>
      </section>

      <section class="card mid" aria-label="Offer and demand">
        <div class="label">Offer · {offerValue} gold</div>
        {#each chosen as it (it.id)}
          <div class="line">
            <span class={it.rarity}>{it.name}</span>
            <span class="muted small">{priceOf(it)}</span>
            <button class="icon-btn" aria-label="Remove {it.name}" onclick={() => toggle(it)}
              >&times;</button
            >
          </div>
        {:else}
          <div class="muted small">Nothing offered.</div>
        {/each}
        <div class="label">Demand · {demandValue} gold</div>
        {#each stock.filter((s) => wanted[s.id]) as s (s.id)}
          <div class="line">
            <span class={s.rarity}>{s.name}</span>
            <span class="qty">
              <button class="icon-btn" onclick={() => add(s, -1)}>-</button>
              {wanted[s.id]}
              <button class="icon-btn" onclick={() => add(s, 1)}>+</button>
            </span>
            <span class="muted small">{s.price * (wanted[s.id] ?? 0)}</span>
          </div>
        {:else}
          <div class="muted small">Nothing chosen.</div>
        {/each}
      </section>

      <section class="card shop" aria-label="Merchant">
        <div class="label">{cityName ?? 'Merchant'}</div>
        <div class="grid">
          {#each stock as s (s.id)}
            <button
              class="cell"
              class:sel={wanted[s.id]}
              class:acc={!!s.caravan}
              title={tip(s, s.price)}
              aria-label="{s.name}, {s.price} gold"
              onclick={() => add(s, 1)}
            >
              <ItemIcon item={asItem(s)} size={40} />
              {#if wanted[s.id]}<span class="count">{wanted[s.id]}</span>{/if}
              <span class="price">{s.price}</span>
            </button>
          {/each}
        </div>
        <div class="muted tiny">
          Click to add to your demand. Caravan accessories are marked in gold.
        </div>
      </section>
    </div>

    <div class="bar2">
      <span class="muted small">
        Offer {offerValue} · demand {demandValue}
        {#if demandValue > offerValue}· you pay {demandValue -
            offerValue}{:else if offerValue > demandValue}· you get {offerValue - demandValue}{/if}
      </span>
      {#if near}
        <button class="primary" disabled={!canTrade} onclick={trade}>Trade</button>
      {:else}
        <button class="primary" disabled={!canSend} onclick={send}>Send carrier</button>
      {/if}
    </div>
    {#if !affordable}<p class="bad small">Not enough gold for that.</p>{/if}
    {#if near && cart.length > bagRoom}<p class="bad small">
        Not enough room in the shared bag.
      </p>{/if}
  {/if}
{/if}

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }
  h3 {
    margin: 0;
  }
  .trade {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }
  @media (min-width: 900px) {
    .trade {
      grid-template-columns: 1fr 260px 1fr;
      align-items: start;
    }
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: 4px;
    max-height: 46vh;
    overflow-y: auto;
  }
  .cell {
    position: relative;
    min-height: 0;
    min-width: 0;
    aspect-ratio: 1;
    padding: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d0b10;
  }
  .cell.sel {
    border-color: var(--gold);
    box-shadow: inset 0 0 0 1px var(--gold);
  }
  .cell.fav {
    opacity: 0.45;
  }
  .cell.acc {
    border-color: #7a6320;
  }
  .count {
    position: absolute;
    top: 0;
    right: 2px;
    font-size: 12px;
    color: var(--gold);
  }
  .price {
    position: absolute;
    bottom: 0;
    right: 2px;
    font-size: 10px;
    color: var(--muted);
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 14px;
  }
  .qty {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tiny {
    font-size: 11px;
  }
  .bar2 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .bar2 .primary {
    min-width: 160px;
  }
</style>
