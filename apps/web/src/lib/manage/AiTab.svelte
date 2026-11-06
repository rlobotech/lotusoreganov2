<script lang="ts">
  import type { AiRuleInfo } from '@game/shared';
  import { api } from '../api.ts';
  import { describeRule, ORDER_LABELS, STATUS_LABELS } from '../labels.ts';
  import { manage, session } from '../session.svelte.ts';
  import MemberChips from './MemberChips.svelte';

  let { memberId = $bindable() }: { memberId: string } = $props();

  const party = $derived(session.party!);
  const m = $derived(party.members.find((x) => x.id === memberId) ?? party.members[0]!);
  const serverJson = $derived(JSON.stringify(m.ai));

  let draft = $state<AiRuleInfo[]>([]);
  let syncedKey = '';
  let error = $state('');
  let saved = $state(false);

  // Load the member's rules into the editor when the member (or the saved rules) change.
  $effect(() => {
    const key = `${m.id}:${serverJson}`;
    if (key !== syncedKey) {
      syncedKey = key;
      draft = JSON.parse(serverJson);
      saved = false;
    }
  });

  const dirty = $derived(JSON.stringify(draft) !== serverJson);
  const known = $derived(
    m.skills.map((id) => session.skills.find((s) => s.id === id)!).filter(Boolean),
  );
  const statusIds = $derived([
    ...new Set(session.skills.flatMap((s) => (s.status ? [s.status.id] : []))),
  ]);
  const skillOf = (id: string) => session.skills.find((s) => s.id === id);
  const targetsOthers = (r: AiRuleInfo) => skillOf(r.skill)?.side !== 'self';

  type Group = 'filter' | 'when';
  type Key =
    'hpBelowPct' | 'hpAbovePct' | 'selfHpBelowPct' | 'selfManaAbovePct' | 'selfManaBelowPct';

  function getNum(r: AiRuleInfo, g: Group, k: Key): number | undefined {
    return (r[g] as Record<string, number | undefined> | undefined)?.[k];
  }
  function setNum(r: AiRuleInfo, g: Group, k: Key, v: number | undefined) {
    const group = (r[g] ??= {}) as Record<string, number | undefined>;
    if (v === undefined || Number.isNaN(v)) delete group[k];
    else group[k] = Math.max(0, Math.min(100, Math.round(v)));
    if (Object.keys(group).length === 0) delete r[g];
    saved = false;
  }
  function setStatus(r: AiRuleInfo, k: 'lacksStatus' | 'hasStatus', v: string) {
    const f = (r.filter ??= {});
    if (v) f[k] = v;
    else delete f[k];
    if (Object.keys(f).length === 0) delete r.filter;
    saved = false;
  }

  function addRule() {
    draft.push({ skill: known[0]?.id ?? 'attack' });
    saved = false;
  }
  function removeRule(i: number) {
    draft.splice(i, 1);
    saved = false;
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= draft.length) return;
    [draft[i], draft[j]] = [draft[j]!, draft[i]!];
    saved = false;
  }
  function changeSkill(r: AiRuleInfo, id: string) {
    r.skill = id;
    if (skillOf(id)?.side === 'self') {
      delete r.order;
      delete r.filter;
    }
    saved = false;
  }

  async function save() {
    error = await manage(() => api.setAi(party.id, m.id, $state.snapshot(draft) as AiRuleInfo[]));
    saved = !error;
  }
  async function reset() {
    error = await manage(() => api.resetAi(party.id, m.id));
    saved = !error;
  }
</script>

<MemberChips bind:selected={memberId} />

<p class="muted small intro">
  In a fight, {m.name} goes through these rules from the top. The first one that can be done right now
  (enough mana, off cooldown, a valid target in reach) is used. If none can, {m.name} makes a basic attack.
</p>

{#each draft as rule, i}
  <div class="card rule">
    <div class="row">
      <strong>{i + 1}.</strong>
      <select
        value={rule.skill}
        onchange={(e) => changeSkill(rule, e.currentTarget.value)}
        aria-label="Skill"
      >
        {#each known as s}<option value={s.id}>{s.name}</option>{/each}
      </select>
      <span class="move">
        <button class="icon-btn" disabled={i === 0} onclick={() => move(i, -1)} aria-label="Move up"
          >&uarr;</button
        >
        <button
          class="icon-btn"
          disabled={i === draft.length - 1}
          onclick={() => move(i, 1)}
          aria-label="Move down">&darr;</button
        >
        <button class="icon-btn" onclick={() => removeRule(i)} aria-label="Remove rule"
          >&times;</button
        >
      </span>
    </div>

    {#if targetsOthers(rule)}
      <div class="line">
        <span class="muted">Target</span>
        <select
          value={rule.order ?? 'nearest'}
          onchange={(e) => {
            rule.order = e.currentTarget.value as AiRuleInfo['order'];
            saved = false;
          }}
          aria-label="Target order"
        >
          {#each Object.entries(ORDER_LABELS) as [v, label]}<option value={v}>{label}</option
            >{/each}
        </select>
      </div>
      <div class="line">
        <label class="check">
          <input
            type="checkbox"
            checked={getNum(rule, 'filter', 'hpBelowPct') !== undefined}
            onchange={(e) =>
              setNum(rule, 'filter', 'hpBelowPct', e.currentTarget.checked ? 50 : undefined)}
          />
          Target health below
        </label>
        {#if getNum(rule, 'filter', 'hpBelowPct') !== undefined}
          <input
            class="num"
            type="number"
            min="0"
            max="100"
            value={getNum(rule, 'filter', 'hpBelowPct')}
            oninput={(e) => setNum(rule, 'filter', 'hpBelowPct', e.currentTarget.valueAsNumber)}
          /> %
        {/if}
      </div>
      <div class="line">
        <label class="check">
          <input
            type="checkbox"
            checked={getNum(rule, 'filter', 'hpAbovePct') !== undefined}
            onchange={(e) =>
              setNum(rule, 'filter', 'hpAbovePct', e.currentTarget.checked ? 50 : undefined)}
          />
          Target health above
        </label>
        {#if getNum(rule, 'filter', 'hpAbovePct') !== undefined}
          <input
            class="num"
            type="number"
            min="0"
            max="100"
            value={getNum(rule, 'filter', 'hpAbovePct')}
            oninput={(e) => setNum(rule, 'filter', 'hpAbovePct', e.currentTarget.valueAsNumber)}
          /> %
        {/if}
      </div>
      <div class="line">
        <span class="muted">Target has no</span>
        <select
          value={rule.filter?.lacksStatus ?? ''}
          onchange={(e) => setStatus(rule, 'lacksStatus', e.currentTarget.value)}
          aria-label="Target lacks status"
        >
          <option value="">(any)</option>
          {#each statusIds as id}<option value={id}>{STATUS_LABELS[id] ?? id}</option>{/each}
        </select>
      </div>
    {/if}

    <div class="line">
      <label class="check">
        <input
          type="checkbox"
          checked={getNum(rule, 'when', 'selfHpBelowPct') !== undefined}
          onchange={(e) =>
            setNum(rule, 'when', 'selfHpBelowPct', e.currentTarget.checked ? 50 : undefined)}
        />
        Only if my health is below
      </label>
      {#if getNum(rule, 'when', 'selfHpBelowPct') !== undefined}
        <input
          class="num"
          type="number"
          min="0"
          max="100"
          value={getNum(rule, 'when', 'selfHpBelowPct')}
          oninput={(e) => setNum(rule, 'when', 'selfHpBelowPct', e.currentTarget.valueAsNumber)}
        /> %
      {/if}
    </div>
    <div class="line">
      <label class="check">
        <input
          type="checkbox"
          checked={getNum(rule, 'when', 'selfManaAbovePct') !== undefined}
          onchange={(e) =>
            setNum(rule, 'when', 'selfManaAbovePct', e.currentTarget.checked ? 30 : undefined)}
        />
        Only if my mana is above
      </label>
      {#if getNum(rule, 'when', 'selfManaAbovePct') !== undefined}
        <input
          class="num"
          type="number"
          min="0"
          max="100"
          value={getNum(rule, 'when', 'selfManaAbovePct')}
          oninput={(e) => setNum(rule, 'when', 'selfManaAbovePct', e.currentTarget.valueAsNumber)}
        /> %
      {/if}
    </div>
    <div class="line">
      <label class="check">
        <input
          type="checkbox"
          checked={getNum(rule, 'when', 'selfManaBelowPct') !== undefined}
          onchange={(e) =>
            setNum(rule, 'when', 'selfManaBelowPct', e.currentTarget.checked ? 30 : undefined)}
        />
        Only if my mana is below
      </label>
      {#if getNum(rule, 'when', 'selfManaBelowPct') !== undefined}
        <input
          class="num"
          type="number"
          min="0"
          max="100"
          value={getNum(rule, 'when', 'selfManaBelowPct')}
          oninput={(e) => setNum(rule, 'when', 'selfManaBelowPct', e.currentTarget.valueAsNumber)}
        /> %
      {/if}
    </div>
    <div class="muted small">{describeRule(rule, session.skills)}</div>
  </div>
{:else}
  <div class="card muted small">No rules: {m.name} only makes basic attacks.</div>
{/each}

<div class="bottom">
  <button onclick={addRule} disabled={draft.length >= 16}>Add rule</button>
  <button onclick={reset}>Reset to class default</button>
  <button class="primary" onclick={save} disabled={!dirty}>Save rules</button>
</div>
{#if error}<p class="bad">{error}</p>{:else if saved}<p class="good small">
    Saved. The next fight uses these rules.
  </p>{:else if dirty}<p class="muted small">You have unsaved changes.</p>{/if}

<style>
  .intro {
    margin: 0;
  }
  .rule .move {
    display: flex;
    gap: 4px;
  }
  .rule select {
    flex: 1;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    flex-wrap: wrap;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .num {
    width: 72px;
    min-height: 36px;
  }
  .bottom {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .bottom .primary {
    flex: 1;
  }
</style>
