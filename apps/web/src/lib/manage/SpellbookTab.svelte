<script lang="ts">
  import type { ItemInfo } from '@game/shared';
  import { api } from '../api.ts';
  import { cap } from '../labels.ts';
  import { manage, session } from '../session.svelte.ts';
  import MemberChips from './MemberChips.svelte';

  let { memberId = $bindable() }: { memberId: string } = $props();

  const party = $derived(session.party!);
  const m = $derived(party.members.find((x) => x.id === memberId) ?? party.members[0]!);
  const skillInfo = (id: string) => session.skills.find((s) => s.id === id);
  let error = $state('');

  function skillLine(id: string): string {
    const s = skillInfo(id);
    if (!s) return '';
    const bits = [s.range <= 1 ? (s.side === 'self' ? 'self' : 'melee') : `range ${s.range}`];
    if (s.manaCost) bits.push(`${s.manaCost} mana`);
    if (s.cooldown) bits.push(`cooldown ${s.cooldown}`);
    if (s.radius) bits.push('area');
    if (s.retreat) bits.push('steps back');
    if (s.free) bits.push('free action');
    if (s.status) bits.push(s.status.id.replace('_', ' '));
    if (s.weapons) bits.push(`needs ${s.weapons.join(' or ')}`);
    return bits.join(' · ');
  }
  const kindLine = (id: string) => {
    const s = skillInfo(id);
    if (!s) return '';
    return s.kind === 'heal'
      ? 'Heals'
      : s.kind === 'status'
        ? 'Effect'
        : s.damageType
          ? `${cap(s.damageType)} damage`
          : 'Weapon damage';
  };

  /** Known skills grouped by school; skills without one (the basic attack) come first. */
  const groups = $derived.by(() => {
    const out = new Map<string, string[]>();
    for (const id of m.skills) {
      const school = skillInfo(id)?.schools[0] ?? '';
      out.set(school, [...(out.get(school) ?? []), id]);
    }
    return [...out.entries()].sort(([a], [b]) =>
      a === '' ? -1 : b === '' ? 1 : a.localeCompare(b),
    );
  });
  const schoolName = (id: string) => m.schools.find((s) => s.id === id)?.name ?? cap(id);
  const levelOf = (id: string) => m.skillLevels[id];
  const progress = (id: string) => {
    const l = levelOf(id);
    return l ? `level ${l.level}${l.next === null ? ' (max)' : ` · ${l.xp}/${l.next}`}` : '';
  };

  /** Skill books in the shared bag and in the personal bags of characters you control. */
  const books = $derived<ItemInfo[]>(
    [...party.bag, ...party.members.filter((x) => x.mine).flatMap((x) => x.bag)].filter(
      (i) => i.teaches,
    ),
  );

  async function carry(id: string) {
    error = await manage(() => api.carrySkill(party.id, m.id, id));
  }
  async function putDown(id: string) {
    error = await manage(() => api.putDownSkill(party.id, m.id, id));
  }

  async function learn(item: ItemInfo) {
    error = await manage(() => api.learn(party.id, m.id, item.id));
  }
</script>

<MemberChips bind:selected={memberId} />

<div class="card">
  <div class="row">
    <h3>{m.name}</h3>
    <span class="muted">{cap(m.race)} {cap(m.cls)}</span>
  </div>

  <div class="label">Schools</div>
  {#each m.schools as s (s.id)}
    <div class="school">
      <div class="row">
        <span>{s.name}</span>
        <span class="muted small">level {s.level}/{s.max}</span>
      </div>
      <div
        class="bar"
        role="progressbar"
        aria-label="{s.name} level"
        aria-valuenow={s.level}
        aria-valuemin={0}
        aria-valuemax={s.max}
      >
        <div class="fill xp" style:width="{(s.level / s.max) * 100}%"></div>
      </div>
    </div>
  {/each}
  <div class="muted small">
    A school's level is the sum of its skills' levels. Skills level up by being used, and only the
    skills you carry ({m.equipped.length}/{m.equipLimit}) are used.
  </div>
</div>

<div class="card">
  <div class="label">Skills ({m.equipped.length}/{m.equipLimit} carried)</div>
  {#if error}<p class="bad small">{error}</p>{/if}
  {#each groups as [school, ids] (school)}
    {#if school}<div class="group">{schoolName(school)}</div>{/if}
    {#each ids as id (id)}
      {@const s = skillInfo(id)}
      <div class="skill">
        <div class="head">
          <span>
            {s?.name ?? id}
            {#if m.equipped.includes(id)}<span class="muted small">(carried)</span>{/if}
          </span>
          {#if m.mine && s?.usable && !s.passive && s.schools.length > 0}
            {#if m.equipped.includes(id)}
              <button class="small-btn" onclick={() => putDown(id)}>Put down</button>
            {:else}
              <button
                class="small-btn"
                disabled={m.equipped.length >= m.equipLimit}
                title={m.equipped.length >= m.equipLimit
                  ? `Only ${m.equipLimit} skills can be carried at this level`
                  : ''}
                onclick={() => carry(id)}>Carry</button
              >
            {/if}
          {/if}
        </div>
        {#if m.skillIssues[id]}<div class="bad small">
            Cannot be used now: {m.skillIssues[id]}
          </div>{/if}
        <div class="muted small">
          {progress(id)}{levelOf(id) ? ' · ' : ''}{s?.passive
            ? 'passive'
            : kindLine(id)}{s?.usable === false && !s?.passive ? ' · not usable yet' : ''}{s?.usable
            ? ' · '
            : ''}{s?.usable ? skillLine(id) : ''}
        </div>
      </div>
    {/each}
  {/each}

  {#if m.locked.length}
    <div class="label">Not learned yet</div>
    {#each m.locked as l (l.skill)}
      {@const s = skillInfo(l.skill)}
      <div class="skill locked">
        <div>{s?.name ?? l.skill}</div>
        <div class="muted small">Needs: {l.missing}</div>
      </div>
    {/each}
  {/if}
  <div class="muted small">Choose when each skill is used in the AI tab.</div>
</div>

{#if books.length}
  <div class="card">
    <div class="label">Skill books</div>
    {#each books as b (b.id)}
      <div class="row book">
        <div>
          <div class={b.rarity}>{b.name}</div>
          <div class="muted small">
            Teaches {skillInfo(b.teaches!)?.name ?? b.teaches}
            {#if m.skills.includes(b.teaches!)}
              · {m.name} already knows it{/if}
          </div>
        </div>
        <button disabled={!m.mine || m.skills.includes(b.teaches!)} onclick={() => learn(b)}>
          {m.name} reads it
        </button>
      </div>
    {/each}
    {#if error}<p class="bad small">{error}</p>{/if}
  </div>
{/if}

<style>
  h3 {
    margin: 0;
  }
  .skill {
    border-top: 1px solid var(--line);
    padding-top: 8px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .small-btn {
    min-height: 0;
    padding: 2px 10px;
    font-size: 13px;
  }
  .locked {
    opacity: 0.75;
  }
  .group {
    margin-top: 6px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted, #8a8494);
  }
  .book {
    align-items: center;
    gap: 8px;
  }
</style>
