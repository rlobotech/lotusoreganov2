<script lang="ts">
  import { cap, fmtBonuses, SLOT_LABELS, SLOTS } from '../labels.ts';
  import { session } from '../session.svelte.ts';

  let { onpick }: { onpick: (memberId: string) => void } = $props();
  const party = $derived(session.party!);
  const pct = (a: number, b: number) => `${Math.max(0, Math.min(100, (a / b) * 100))}%`;
</script>

<div class="grid">
  {#each party.members as m}
    <div class="card" class:down={!m.alive}>
      <div class="row">
        <strong>{m.name}</strong>
        <span class="muted small">{cap(m.race)} {cap(m.cls)}</span>
      </div>
      <div class="bar"><div class="fill hp" style="width:{pct(m.hp, m.maxHp)}"></div></div>
      <div class="bar thin"><div class="fill mp" style="width:{pct(m.mana, m.maxMana)}"></div></div>
      <div class="row small muted">
        <span>{m.hp}/{m.maxHp} HP</span><span>{m.mana}/{m.maxMana} MP</span>
      </div>
      <div class="stats small">
        {#each ['str', 'dex', 'int', 'vit', 'wis'] as k}
          <span><span class="muted">{k.toUpperCase()}</span> {m.attributes.total[k as 'str']}</span>
        {/each}
      </div>
      <div class="gear">
        {#each SLOTS as slot}
          {@const it = m.equipment[slot]}
          <div class="row small">
            <span class="muted">{SLOT_LABELS[slot]}</span>
            {#if it}<span class={it.rarity} title={fmtBonuses(it.bonuses)}>{it.name}</span
              >{:else}<span class="muted">-</span>{/if}
          </div>
        {/each}
      </div>
      {#if m.points > 0}<div class="good small">{m.points} points to spend</div>{/if}
      <button onclick={() => onpick(m.id)}>Open character</button>
    </div>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 10px;
  }
  .down {
    opacity: 0.55;
  }
  .stats {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .gear {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
</style>
