<script lang="ts">
  import type { MemberInfo } from '@game/shared';
  import { api } from '../api.ts';
  import { cap } from '../labels.ts';
  import { manage, session } from '../session.svelte.ts';

  /** `member` is the character whose gold was clicked: yours (send from it) or not (send to it). */
  let { member, onclose }: { member: MemberInfo; onclose: () => void } = $props();

  const party = $derived(session.party!);
  const mine = $derived(party.members.filter((m) => m.mine));

  // svelte-ignore state_referenced_locally
  let fromId = $state(
    member.mine ? member.id : (mine.slice().sort((a, b) => b.gold - a.gold)[0]?.id ?? ''),
  );
  // svelte-ignore state_referenced_locally
  let toId = $state(
    member.mine
      ? ((
          party.members.find((m) => m.id !== member.id && m.mine) ??
          party.members.find((m) => m.id !== member.id)
        )?.id ?? '')
      : member.id,
  );
  let amount = $state(1);
  let error = $state('');
  let busy = $state(false);

  const from = $derived(party.members.find((m) => m.id === fromId));
  const max = $derived(from?.gold ?? 0);
  const valid = $derived(
    !!from && fromId !== toId && Number.isInteger(amount) && amount >= 1 && amount <= max,
  );

  async function send() {
    if (!valid || busy) return;
    busy = true;
    error = await manage(() => api.sendGold(party.id, fromId, toId, amount));
    busy = false;
    if (!error) onclose();
  }
</script>

<div class="backdrop" role="presentation" onclick={onclose}>
  <div
    class="dialog"
    role="dialog"
    aria-label="Send gold"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === 'Escape' && onclose()}
  >
    <h3>Send gold</h3>
    <label>
      <span class="muted small">From</span>
      <select bind:value={fromId} disabled={member.mine}>
        {#each mine as m (m.id)}
          <option value={m.id}>{m.name} ({cap(m.cls)}) · {m.gold} gold</option>
        {/each}
      </select>
    </label>
    <label>
      <span class="muted small">To</span>
      <select bind:value={toId} disabled={!member.mine}>
        {#each party.members.filter((m) => m.id !== fromId) as m (m.id)}
          <option value={m.id}>{m.name} ({cap(m.cls)}){m.mine ? '' : ' · other player'}</option>
        {/each}
      </select>
    </label>
    <label>
      <span class="muted small">Amount (up to {max})</span>
      <span class="amount">
        <input type="number" min="1" {max} step="1" bind:value={amount} />
        <button type="button" onclick={() => (amount = max)} disabled={max < 1}>All</button>
      </span>
    </label>
    {#if error}<p class="bad">{error}</p>{/if}
    <div class="actions">
      <button onclick={onclose}>Cancel</button>
      <button class="primary" disabled={!valid || busy} onclick={send}>Send</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000a;
    padding: 12px;
  }
  .dialog {
    width: min(100%, 340px);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    background: var(--panel);
    border: 1px solid var(--gold);
    border-radius: 8px;
  }
  h3 {
    margin: 0;
    color: var(--gold);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .amount {
    display: flex;
    gap: 6px;
  }
  .amount input {
    flex: 1;
    min-width: 0;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  p {
    margin: 0;
  }
</style>
