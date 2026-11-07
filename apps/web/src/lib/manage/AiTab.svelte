<script lang="ts">
  import { WEAPON_ATTACK_ID, type AiRuleInfo } from '@game/shared';
  import { api } from '../api.ts';
  import { describeRule, MOVE_LABELS, ORDER_LABELS, STATUS_LABELS } from '../labels.ts';
  import { manage, session } from '../session.svelte.ts';
  import MemberChips from './MemberChips.svelte';

  let { memberId = $bindable() }: { memberId: string } = $props();

  const party = $derived(session.party!);
  const m = $derived(party.members.find((x) => x.id === memberId) ?? party.members[0]!);
  const serverJson = $derived(JSON.stringify(m.ai));
  const canEdit = $derived(m.mine);

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
  const isSelf = (r: AiRuleInfo) =>
    r.skill !== WEAPON_ATTACK_ID && skillOf(r.skill)?.side === 'self';
  const targetKind = (r: AiRuleInfo) =>
    isSelf(r)
      ? 'yourself'
      : skillOf(r.skill)?.side === 'ally' && r.skill !== WEAPON_ATTACK_ID
        ? 'an ally'
        : 'an enemy';

  type Group = 'filter' | 'when';

  function getVal<T>(r: AiRuleInfo, g: Group, k: string): T | undefined {
    return (r[g] as Record<string, T | undefined> | undefined)?.[k];
  }
  /** Sets (or clears, with undefined) one field of a rule's filter or condition group. */
  function setVal(r: AiRuleInfo, g: Group, k: string, v: unknown) {
    const group = (r[g] ??= {}) as Record<string, unknown>;
    if (v === undefined || v === '' || v === false || (typeof v === 'number' && Number.isNaN(v))) {
      delete group[k];
    } else group[k] = v;
    if (Object.keys(group).length === 0) delete r[g];
    saved = false;
  }
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));

  function addRule() {
    draft.push({ skill: known[0]?.id ?? WEAPON_ATTACK_ID });
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
  function setMove(r: AiRuleInfo, when: string, mode: string) {
    if (!when) delete r.move;
    else r.move = { when: when as 'before' | 'after', mode: (mode || 'toward') as never };
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
  (enough mana, off cooldown, a valid target in reach, every condition true) is used. A rule can also
  carry a move: before its skill, or with the movement left afterwards. If no rule can be done, {m.name}
  makes a basic attack. Without a move, ranged characters step back from close enemies after attacking.
</p>

{#snippet pct(rule: AiRuleInfo, g: Group, k: string, label: string, def: number)}
  <div class="line">
    <label class="check">
      <input
        type="checkbox"
        disabled={!canEdit}
        checked={getVal<number>(rule, g, k) !== undefined}
        onchange={(e) => setVal(rule, g, k, e.currentTarget.checked ? def : undefined)}
      />
      {label}
    </label>
    {#if getVal<number>(rule, g, k) !== undefined}
      <input
        class="num"
        type="number"
        min="0"
        max="100"
        disabled={!canEdit}
        value={getVal<number>(rule, g, k)}
        oninput={(e) => setVal(rule, g, k, clamp(e.currentTarget.valueAsNumber, 100))}
      /> %
    {/if}
  </div>
{/snippet}

{#snippet status(rule: AiRuleInfo, g: Group, k: string, label: string)}
  <div class="line">
    <span class="muted">{label}</span>
    <select
      disabled={!canEdit}
      value={getVal<string>(rule, g, k) ?? ''}
      onchange={(e) => setVal(rule, g, k, e.currentTarget.value)}
      aria-label={label}
    >
      <option value="">(any)</option>
      {#each statusIds as id (id)}<option value={id}>{STATUS_LABELS[id] ?? id}</option>{/each}
    </select>
  </div>
{/snippet}

{#each draft as rule, i (i)}
  <div class="card rule">
    <div class="row">
      <strong>{i + 1}.</strong>
      <select
        disabled={!canEdit}
        value={rule.skill}
        onchange={(e) => changeSkill(rule, e.currentTarget.value)}
        aria-label="Skill"
      >
        <option value={WEAPON_ATTACK_ID}>Weapon attack</option>
        {#each known as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
      </select>
      <span class="move">
        <button
          class="icon-btn"
          disabled={!canEdit || i === 0}
          onclick={() => move(i, -1)}
          aria-label="Move up">&uarr;</button
        >
        <button
          class="icon-btn"
          disabled={!canEdit || i === draft.length - 1}
          onclick={() => move(i, 1)}
          aria-label="Move down">&darr;</button
        >
        <button
          class="icon-btn"
          disabled={!canEdit}
          onclick={() => removeRule(i)}
          aria-label="Remove rule">&times;</button
        >
      </span>
    </div>

    <div class="section">Target: {targetKind(rule)}</div>
    {#if !isSelf(rule)}
      <div class="line">
        <span class="muted">Pick the</span>
        <select
          disabled={!canEdit}
          value={rule.order ?? 'nearest'}
          onchange={(e) => {
            rule.order = e.currentTarget.value as AiRuleInfo['order'];
            saved = false;
          }}
          aria-label="Target order"
        >
          {#each Object.entries(ORDER_LABELS) as [v, label] (v)}
            <option value={v}>{label}</option>
          {/each}
        </select>
      </div>
      <div class="line">
        <label class="check">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={!!rule.filter?.fullHealth}
            onchange={(e) => setVal(rule, 'filter', 'fullHealth', e.currentTarget.checked)}
          />
          Only a target at full health
        </label>
      </div>
      {@render pct(rule, 'filter', 'hpBelowPct', 'Target health below', 50)}
      {@render pct(rule, 'filter', 'hpAbovePct', 'Target health above', 50)}
      {@render status(rule, 'filter', 'lacksStatus', 'Target has no')}
      {@render status(rule, 'filter', 'hasStatus', 'Target has')}
    {/if}

    <div class="section">Only when</div>
    {@render pct(rule, 'when', 'selfHpBelowPct', 'My health is below', 50)}
    {@render pct(rule, 'when', 'selfHpAbovePct', 'My health is above', 50)}
    {@render pct(rule, 'when', 'selfManaAbovePct', 'My mana is above', 30)}
    {@render pct(rule, 'when', 'selfManaBelowPct', 'My mana is below', 30)}
    <div class="line">
      <span class="muted">An enemy is next to me</span>
      <select
        disabled={!canEdit}
        value={rule.when?.enemyAdjacent === undefined ? '' : String(rule.when.enemyAdjacent)}
        onchange={(e) => {
          const v = e.currentTarget.value;
          setVal(rule, 'when', 'enemyAdjacent', v === '' ? undefined : v === 'true');
          // `false` is a real answer here, so put it back after the generic clean-up.
          if (v === 'false') (rule.when ??= {}).enemyAdjacent = false;
        }}
        aria-label="Enemy next to me"
      >
        <option value="">(either)</option>
        <option value="true">yes</option>
        <option value="false">no</option>
      </select>
    </div>
    <div class="line">
      <label class="check">
        <input
          type="checkbox"
          disabled={!canEdit}
          checked={rule.when?.enemiesAtLeast !== undefined}
          onchange={(e) =>
            setVal(rule, 'when', 'enemiesAtLeast', e.currentTarget.checked ? 2 : undefined)}
        />
        At least this many enemies remain
      </label>
      {#if rule.when?.enemiesAtLeast !== undefined}
        <input
          class="num"
          type="number"
          min="1"
          max="12"
          disabled={!canEdit}
          value={rule.when.enemiesAtLeast}
          oninput={(e) =>
            setVal(
              rule,
              'when',
              'enemiesAtLeast',
              Math.max(1, Math.min(12, Math.round(e.currentTarget.valueAsNumber))),
            )}
        />
      {/if}
    </div>
    {@render status(rule, 'when', 'selfHasStatus', 'I have')}
    {@render status(rule, 'when', 'selfLacksStatus', 'I do not have')}

    <div class="section">Movement</div>
    <div class="line">
      <select
        disabled={!canEdit}
        value={rule.move?.when ?? ''}
        onchange={(e) => setMove(rule, e.currentTarget.value, rule.move?.mode ?? '')}
        aria-label="When to move"
      >
        <option value="">No linked move</option>
        <option value="before">Before the skill</option>
        <option value="after">After the skill</option>
      </select>
      {#if rule.move}
        <select
          disabled={!canEdit}
          value={rule.move.mode}
          onchange={(e) => setMove(rule, rule.move!.when, e.currentTarget.value)}
          aria-label="How to move"
        >
          {#each Object.entries(MOVE_LABELS) as [v, label] (v)}
            <option value={v}>{label}</option>
          {/each}
        </select>
      {/if}
    </div>

    <div class="muted small">{describeRule(rule, session.skills)}</div>
  </div>
{:else}
  <div class="card muted small">No rules: {m.name} only makes basic attacks.</div>
{/each}

<div class="bottom">
  <button onclick={addRule} disabled={!canEdit || draft.length >= 16}>Add rule</button>
  <button onclick={reset} disabled={!canEdit}>Reset to class default</button>
  <button class="primary" onclick={save} disabled={!canEdit || !dirty}>Save rules</button>
</div>
{#if !canEdit}<p class="muted small">This character belongs to another player.</p>{/if}
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
    min-width: 0;
  }
  .section {
    margin-top: 6px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted, #8a8494);
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
