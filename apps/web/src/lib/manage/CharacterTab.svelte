<script lang="ts">
  import { api } from '../api.ts';
  import {
    ATTR_HINTS,
    ATTR_LABELS,
    ATTRS,
    cap,
    fmtBonuses,
    SLOT_LABELS,
    SLOTS,
  } from '../labels.ts';
  import { manage, session } from '../session.svelte.ts';
  import MemberChips from './MemberChips.svelte';

  let { memberId = $bindable() }: { memberId: string } = $props();

  const party = $derived(session.party!);
  const m = $derived(party.members.find((x) => x.id === memberId) ?? party.members[0]!);
  let error = $state('');
  let picking = $state<string | null>(null);

  async function run(call: () => Promise<{ party: typeof party }>) {
    error = await manage(call);
  }

  const skillInfo = (id: string) => session.skills.find((s) => s.id === id);
  const pct = (a: number, b: number) => `${Math.max(0, Math.min(100, (a / b) * 100))}%`;
  const bagFor = (slot: string) => party.bag.filter((i) => i.slot === slot);

  function skillLine(id: string): string {
    const s = skillInfo(id);
    if (!s) return '';
    const bits = [s.range <= 1 ? (s.side === 'self' ? 'self' : 'melee') : `range ${s.range}`];
    if (s.manaCost) bits.push(`${s.manaCost} mana`);
    if (s.cooldown) bits.push(`cooldown ${s.cooldown}`);
    if (s.radius) bits.push('area');
    if (s.status) bits.push(s.status.id.replace('_', ' '));
    return bits.join(' · ');
  }
</script>

<MemberChips bind:selected={memberId} />
{#if error}<p class="bad">{error}</p>{/if}

<div class="card">
  <div class="row">
    <h3>{m.name}</h3>
    <span class="muted">Level {party.level} {cap(m.race)} {cap(m.cls)}</span>
  </div>
  <div class="bar"><div class="fill hp" style="width:{pct(m.hp, m.maxHp)}"></div></div>
  <div class="row small muted">
    <span>{m.alive ? m.hp : 0} / {m.maxHp} health</span><span>{m.mana} / {m.maxMana} mana</span>
  </div>
</div>

<div class="card">
  <div class="row">
    <span class="label">Attributes</span>
    <span class={m.points > 0 ? 'good' : 'muted'}>Points to spend: {m.points}</span>
  </div>
  {#each ATTRS as k}
    <div class="attr">
      <div>
        <div>{ATTR_LABELS[k]}</div>
        <div class="muted small">{ATTR_HINTS[k]}</div>
      </div>
      <div class="nums">
        <strong>{m.attributes.total[k]}</strong>
        <span class="muted small">
          {m.attributes.base[k]}
          {#if m.attributes.alloc[k]}+{m.attributes.alloc[k]} pts{/if}
          {#if m.attributes.gear[k]}+{m.attributes.gear[k]} gear{/if}
        </span>
      </div>
      <button
        class="icon-btn"
        disabled={m.points < 1}
        onclick={() => run(() => api.allocate(party.id, m.id, { [k]: 1 }))}
        aria-label="Add a point to {ATTR_LABELS[k]}"
      >
        +
      </button>
    </div>
  {/each}
  <div class="row">
    <label class="check">
      <input
        type="checkbox"
        checked={m.autoAlloc}
        onchange={(e) => run(() => api.autoAlloc(party.id, m.id, e.currentTarget.checked))}
      />
      Spend new points automatically
    </label>
    <button onclick={() => run(() => api.resetPoints(party.id, m.id))}>Reset points</button>
  </div>
  <div class="derived small muted">
    Attack {Math.round(m.derived.atk)} · Magic {Math.round(m.derived.magic)} · Defense
    {Math.round(m.derived.def)} · Resist {Math.round(m.derived.res)} · Speed
    {Math.round(m.derived.speed)} · Move {m.derived.move}
  </div>
</div>

<div class="card">
  <div class="label">Equipment</div>
  {#each SLOTS as slot}
    {@const item = m.equipment[slot]}
    <div class="slot">
      <div class="row">
        <span class="muted">{SLOT_LABELS[slot]}</span>
        <span class="actions">
          {#if item}
            <button class="icon-btn" onclick={() => run(() => api.unequip(party.id, m.id, slot))}
              >Remove</button
            >
          {/if}
          <button
            class="icon-btn"
            disabled={bagFor(slot).length === 0}
            onclick={() => (picking = picking === slot ? null : slot)}
          >
            {item ? 'Change' : 'Equip'}
          </button>
        </span>
      </div>
      {#if item}
        <div class={item.rarity}>
          {item.name} <span class="muted small">L{item.itemLevel} {fmtBonuses(item.bonuses)}</span>
        </div>
      {:else}
        <div class="muted small">
          Empty{bagFor(slot).length ? '' : ' (nothing suitable in the bag)'}
        </div>
      {/if}
      {#if picking === slot}
        <div class="pick">
          {#each bagFor(slot) as it}
            <button
              class="pick-item"
              onclick={async () => {
                await run(() => api.equip(party.id, m.id, it.id));
                picking = null;
              }}
            >
              <span class={it.rarity}>{it.name}</span>
              <span class="muted small">L{it.itemLevel} {fmtBonuses(it.bonuses)}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<div class="card">
  <div class="label">Skills</div>
  {#each m.skills as id}
    {@const s = skillInfo(id)}
    <div>
      <div>{s?.name ?? id}</div>
      <div class="muted small">
        {s
          ? `${s.kind === 'heal' ? 'Heals' : s.kind === 'status' ? 'Effect' : cap(s.damageType) + ' damage'} · ${skillLine(id)}`
          : ''}
      </div>
    </div>
  {/each}
  <div class="muted small">
    New skills are learned by using skills in a family; this arrives in a later update.
  </div>
</div>

<style>
  .attr {
    display: grid;
    grid-template-columns: 1fr auto 44px;
    gap: 10px;
    align-items: center;
  }
  .nums {
    text-align: right;
    display: flex;
    flex-direction: column;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 14px;
  }
  .slot {
    border-top: 1px solid var(--line);
    padding-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .pick {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pick-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    text-align: left;
  }
</style>
