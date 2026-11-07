<script lang="ts">
  import { api } from '../api.ts';
  import { ATTR_HINTS, ATTR_LABELS, ATTRS, cap } from '../labels.ts';
  import CharacterFigure from '../inventory/CharacterFigure.svelte';
  import { DAMAGE_LABELS, DAMAGE_TYPE_ORDER } from '../inventory/itemUi.ts';
  import { mineFirst } from '../members.ts';
  import { manage, session } from '../session.svelte.ts';

  const party = $derived(session.party!);
  let error = $state('');

  async function run(call: Parameters<typeof manage>[0]) {
    error = await manage(call);
  }

  const DERIVED = [
    ['accuracy', 'Accuracy'],
    ['evasion', 'Evasion'],
    ['crit', 'Crit %'],
    ['speed', 'Speed'],
    ['move', 'Move'],
  ] as const;

  const members = $derived(mineFirst(party.members));
  const unspent = $derived(party.members.filter((m) => m.mine).reduce((s, m) => s + m.points, 0));
</script>

<div class="head">
  <h3>Attributes</h3>
  <span class={unspent > 0 ? 'good' : 'muted'}>Points to spend: {unspent}</span>
</div>
<p class="muted small">
  Every character earns a point per level. Points are spent automatically in the class pattern
  unless you turn that off for a character.
</p>
{#if error}<p class="bad">{error}</p>{/if}

<div class="scroller">
  <table>
    <thead>
      <tr>
        <th class="corner"></th>
        {#each members as m (m.id)}
          <th class:down={!m.alive}>
            <div class="who">
              <CharacterFigure race={m.race} cls={m.cls} size={40} alive={m.alive} />
              <strong>{m.name}</strong>
              <span class="muted small">{cap(m.race)} {cap(m.cls)}</span>
            </div>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      <tr class="points">
        <th scope="row">Points</th>
        {#each members as m (m.id)}
          <td class={m.points > 0 ? 'good' : 'muted'}>{m.points}</td>
        {/each}
      </tr>

      {#each ATTRS as k (k)}
        <tr>
          <th scope="row">
            <div>{ATTR_LABELS[k]}</div>
            <div class="muted small hint">{ATTR_HINTS[k]}</div>
          </th>
          {#each members as m (m.id)}
            <td>
              <div class="cellv">
                <strong>{m.attributes.total[k]}</strong>
                <button
                  class="plus"
                  disabled={!m.mine || m.points < 1}
                  onclick={() => run(() => api.allocate(party.id, m.id, { [k]: 1 }))}
                  aria-label="Add a point to {ATTR_LABELS[k]} for {m.name}">+</button
                >
              </div>
              <div class="muted tiny">
                {m.attributes.base[k]}{#if m.attributes.alloc[k]}
                  +{m.attributes.alloc[k]} pts{/if}{#if m.attributes.gear[k]}
                  +{m.attributes.gear[k]} gear{/if}
              </div>
            </td>
          {/each}
        </tr>
      {/each}

      <tr class="sep"><th scope="row" colspan={members.length + 1}>Combat</th></tr>
      <tr>
        <th scope="row">Health</th>
        {#each members as m (m.id)}<td>{m.alive ? m.hp : 0} / {m.maxHp}</td>{/each}
      </tr>
      <tr>
        <th scope="row">Mana</th>
        {#each members as m (m.id)}<td>{m.mana} / {m.maxMana}</td>{/each}
      </tr>
      {#each DERIVED as [key, label] (key)}
        <tr>
          <th scope="row">{label}</th>
          {#each members as m (m.id)}<td>{Math.round(m.derived[key])}</td>{/each}
        </tr>
      {/each}

      <tr class="sep"><th scope="row" colspan={members.length + 1}>Weapon and resistances</th></tr>
      <tr>
        <th scope="row">Weapon</th>
        {#each members as m (m.id)}
          <td>
            {#if m.combat.weapon}
              {m.combat.weapon.min}-{m.combat.weapon.max}
              {DAMAGE_LABELS[m.combat.weapon.type].toLowerCase()}
              {#each m.combat.extra as e (e.type)}
                <div class="muted tiny">+{e.min}-{e.max} {DAMAGE_LABELS[e.type].toLowerCase()}</div>
              {/each}
            {:else}
              <span class="muted">Bare hands</span>
            {/if}
          </td>
        {/each}
      </tr>
      {#each DAMAGE_TYPE_ORDER as type (type)}
        <tr>
          <th scope="row">{DAMAGE_LABELS[type]}</th>
          {#each members as m (m.id)}
            <td>
              {#if m.combat.resist[type]}
                {m.combat.resist[type]!.pct}%
                <span class="muted tiny">({m.combat.resist[type]!.points})</span>
              {:else}
                <span class="muted">0%</span>
              {/if}
            </td>
          {/each}
        </tr>
      {/each}

      <tr class="sep"><th scope="row" colspan={members.length + 1}>Points</th></tr>
      <tr>
        <th scope="row">Auto-spend</th>
        {#each members as m (m.id)}
          <td>
            <input
              type="checkbox"
              checked={m.autoAlloc}
              disabled={!m.mine}
              aria-label="Spend new points automatically for {m.name}"
              onchange={(e) => run(() => api.autoAlloc(party.id, m.id, e.currentTarget.checked))}
            />
          </td>
        {/each}
      </tr>
      <tr>
        <th scope="row">Respec</th>
        {#each members as m (m.id)}
          <td>
            <button
              class="small-btn"
              disabled={!m.mine}
              onclick={() => run(() => api.resetPoints(party.id, m.id))}
            >
              Reset
            </button>
          </td>
        {/each}
      </tr>
    </tbody>
  </table>
</div>

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
  }
  h3,
  p {
    margin: 0;
  }
  .scroller {
    overflow-x: auto;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
  }
  table {
    border-collapse: collapse;
    width: 100%;
    min-width: max-content;
  }
  th,
  td {
    padding: 8px 10px;
    text-align: center;
    border-top: 1px solid var(--line);
    vertical-align: middle;
  }
  thead th {
    border-top: 0;
    min-width: 96px;
  }
  tbody th {
    text-align: left;
    font-weight: normal;
    position: sticky;
    left: 0;
    background: var(--panel);
    z-index: 1;
    min-width: 120px;
    border-right: 1px solid var(--line);
  }
  .corner {
    position: sticky;
    left: 0;
    background: var(--panel);
    z-index: 1;
    border-right: 1px solid var(--line);
  }
  .who {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .down {
    opacity: 0.6;
  }
  .hint {
    max-width: 150px;
  }
  .sep th {
    color: var(--gold);
    background: #1c1810;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 12px;
  }
  .cellv {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .plus {
    min-height: 30px;
    min-width: 30px;
    padding: 0;
    line-height: 1;
  }
  .tiny {
    font-size: 11px;
  }
  .small-btn {
    min-height: 32px;
    padding: 0 10px;
  }
  input[type='checkbox'] {
    width: 20px;
    height: 20px;
  }
</style>
