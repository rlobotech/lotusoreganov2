<script lang="ts">
  import type { DamageTypeName } from '@game/shared';
  import { api } from '../api.ts';
  import CharacterFigure from '../inventory/CharacterFigure.svelte';
  import { DAMAGE_LABELS } from '../inventory/itemUi.ts';
  import TeamStrip from '../inventory/TeamStrip.svelte';
  import { ATTR_HINTS, ATTR_LABELS, ATTRS, cap } from '../labels.ts';
  import { mineFirst } from '../members.ts';
  import { manage, session } from '../session.svelte.ts';

  let { memberId = $bindable() }: { memberId: string } = $props();

  const party = $derived(session.party!);
  const members = $derived(mineFirst(party.members));
  const m = $derived(party.members.find((x) => x.id === memberId) ?? members[0]!);
  let error = $state('');

  async function run(call: Parameters<typeof manage>[0]) {
    error = await manage(call);
  }

  const DERIVED = [
    ['accuracy', 'Accuracy'],
    ['evasion', 'Evasion'],
    ['crit', 'Crit chance'],
    ['speed', 'Speed'],
    ['move', 'Move'],
  ] as const;
  const PHYSICAL: DamageTypeName[] = ['piercing', 'smash', 'cut', 'blood'];
  const MAGICAL: DamageTypeName[] = ['fire', 'water', 'electric', 'earth', 'dark', 'light'];

  const skill = (id: string) => session.skills.find((s) => s.id === id);
  const condition = $derived(
    !m.alive ? 'Fallen' : m.hp < m.maxHp * 0.5 ? 'Hurt' : m.hp < m.maxHp ? 'Scratched' : 'Healthy',
  );
  const pct = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
</script>

<!-- Pinned while the sheet scrolls: who it is, the portrait and the numbers that matter most. -->
<div class="pinned">
  <TeamStrip {members} selected={m.id} onselect={(id) => (memberId = id)} />
  <div class="top card">
    <div class="main">
      <div class="name">
        <h3>{m.name}</h3>
        <span class="muted">{cap(m.race)} {cap(m.cls)} · level {party.level}</span>
      </div>
      <div class="vital" title="Health">
        <span>HP</span>
        <div class="bar">
          <div class="fill hp" style:width="{pct(m.alive ? m.hp : 0, m.maxHp)}%"></div>
        </div>
        <span>{m.alive ? m.hp : 0}/{m.maxHp}</span>
      </div>
      <div class="vital" title="Mana">
        <span>MP</span>
        <div class="bar"><div class="fill mp" style:width="{pct(m.mana, m.maxMana)}%"></div></div>
        <span>{m.mana}/{m.maxMana}</span>
      </div>
      <div class="muted small">
        {#if m.mine}
          Points to spend: <strong class={m.points > 0 ? 'good' : ''}>{m.points}</strong>
        {:else}
          Another player's character (look only)
        {/if}
      </div>
    </div>
    <CharacterFigure race={m.race} cls={m.cls} size={96} alive={m.alive} />
  </div>
</div>

{#if error}<p class="bad">{error}</p>{/if}

<div class="cols">
  <section class="card">
    <div class="label">Attributes</div>
    {#each ATTRS as k (k)}
      <div class="attr">
        <div>
          <div>{ATTR_LABELS[k]}</div>
          <div class="muted tiny">{ATTR_HINTS[k]}</div>
        </div>
        <div class="val">
          <strong>{m.attributes.total[k]}</strong>
          <div class="muted tiny">
            {m.attributes.base[k]}{#if m.attributes.alloc[k]}
              +{m.attributes.alloc[k]} pts{/if}{#if m.attributes.gear[k]}
              +{m.attributes.gear[k]} gear{/if}
          </div>
        </div>
        <button
          class="plus"
          disabled={!m.mine || m.points < 1}
          onclick={() => run(() => api.allocate(party.id, m.id, { [k]: 1 }))}
          aria-label="Add a point to {ATTR_LABELS[k]} for {m.name}">+</button
        >
      </div>
    {/each}
    <label class="check">
      <input
        type="checkbox"
        checked={m.autoAlloc}
        disabled={!m.mine}
        onchange={(e) => run(() => api.autoAlloc(party.id, m.id, e.currentTarget.checked))}
      />
      Spend new points automatically
    </label>
    <button
      class="small-btn"
      disabled={!m.mine}
      onclick={() => run(() => api.resetPoints(party.id, m.id))}
    >
      Reset spent points
    </button>
  </section>

  <section class="card">
    <div class="label">Combat</div>
    {#each DERIVED as [key, label] (key)}
      <div class="row2"><span>{label}</span><strong>{Math.round(m.derived[key])}</strong></div>
    {/each}
    <div class="row2">
      <span>Weapon</span>
      <strong>
        {#if m.combat.weapon}
          {m.combat.weapon.min}-{m.combat.weapon.max}
          {DAMAGE_LABELS[m.combat.weapon.type].toLowerCase()}
        {:else}
          <span class="muted">Bare hands</span>
        {/if}
      </strong>
    </div>
    {#each m.combat.extra as e (e.type)}
      <div class="row2 muted">
        <span>Extra damage</span><span>+{e.min}-{e.max} {DAMAGE_LABELS[e.type].toLowerCase()}</span>
      </div>
    {/each}
    <div class="row2"><span>Condition</span><strong>{condition}</strong></div>
  </section>

  <section class="card">
    <div class="label">Resistances</div>
    <div class="group">Physical</div>
    {#each PHYSICAL as t (t)}
      {@render resist(t)}
    {/each}
    <div class="group">Magical</div>
    {#each MAGICAL as t (t)}
      {@render resist(t)}
    {/each}
    <div class="muted tiny">Resistance comes from worn armor. Points in brackets.</div>
  </section>

  <section class="card">
    <div class="label">Schools</div>
    {#each m.schools as s (s.id)}
      <div class="school">
        <div class="row2">
          <span>{s.name}</span>
          <span class="muted small">
            level {s.level}{s.nextXp === null ? ' (max)' : ''}
          </span>
        </div>
        <div
          class="bar"
          role="progressbar"
          aria-label="{s.name} progress"
          aria-valuenow={s.xp - s.levelXp}
          aria-valuemin={0}
          aria-valuemax={s.nextXp === null ? s.xp - s.levelXp : s.nextXp - s.levelXp}
        >
          <div
            class="fill xp"
            style:width="{s.nextXp === null
              ? 100
              : ((s.xp - s.levelXp) / (s.nextXp - s.levelXp)) * 100}%"
          ></div>
        </div>
      </div>
    {:else}
      <div class="muted small">No school trained yet.</div>
    {/each}
  </section>

  <section class="card wide">
    <div class="label">Skills</div>
    <div class="chips">
      {#each m.skills as id (id)}
        <span class="chip" title={skill(id)?.school ?? 'basic'}>{skill(id)?.name ?? id}</span>
      {/each}
    </div>
    <div class="muted tiny">Details, locked skills and books are in the Spellbook tab.</div>
  </section>
</div>

{#snippet resist(t: DamageTypeName)}
  {@const r = m.combat.resist[t]}
  <div class="row2">
    <span>{DAMAGE_LABELS[t]}</span>
    <span>
      {#if r}
        <strong>{r.pct}%</strong> <span class="muted tiny">({r.points})</span>
      {:else}
        <span class="muted">0%</span>
      {/if}
    </span>
  </div>
{/snippet}

<style>
  /* The strip and the top card stay in view while the sections below scroll. */
  .pinned {
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-bottom: 6px;
  }
  .top {
    width: 100%;
    max-width: 760px;
    align-self: center;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }
  .name {
    display: flex;
    flex-direction: column;
  }
  h3 {
    margin: 0;
  }
  .vital {
    display: grid;
    grid-template-columns: 24px 1fr auto;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .cols {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    align-items: start;
  }
  @media (min-width: 820px) {
    .cols {
      grid-template-columns: 1fr 1fr;
    }
    .wide {
      grid-column: 1 / -1;
    }
  }
  .attr {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    border-top: 1px solid var(--line);
  }
  .val {
    text-align: right;
  }
  .row2 {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 3px 0;
    border-top: 1px solid var(--line);
  }
  .group {
    margin-top: 4px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--gold);
  }
  .plus {
    min-height: 32px;
    min-width: 32px;
    padding: 0;
    line-height: 1;
  }
  .tiny {
    font-size: 11px;
  }
  .small-btn {
    min-height: 36px;
    align-self: flex-start;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }
  input[type='checkbox'] {
    width: 20px;
    height: 20px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    padding: 4px 10px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--panel-2);
    font-size: 13px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
</style>
