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
      const school = skillInfo(id)?.school ?? '';
      out.set(school, [...(out.get(school) ?? []), id]);
    }
    return [...out.entries()].sort(([a], [b]) =>
      a === '' ? -1 : b === '' ? 1 : a.localeCompare(b),
    );
  });
  const schoolName = (id: string) => m.schools.find((s) => s.id === id)?.name ?? cap(id);

  /** Skill books in the shared bag and in the personal bags of characters you control. */
  const books = $derived<ItemInfo[]>(
    [...party.bag, ...party.members.filter((x) => x.mine).flatMap((x) => x.bag)].filter(
      (i) => i.teaches,
    ),
  );

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
        <span class="muted small">
          level {s.level}{s.nextXp === null
            ? ' (max)'
            : ` · ${s.xp - s.levelXp}/${s.nextXp - s.levelXp}`}
        </span>
      </div>
      <progress
        max={s.nextXp === null ? 1 : s.nextXp - s.levelXp}
        value={s.nextXp === null ? 1 : s.xp - s.levelXp}
        aria-label="{s.name} progress"
      ></progress>
    </div>
  {/each}
  <div class="muted small">
    Using a skill trains its school. Weapon skills train the school of the weapon in hand, so a
    dagger skill only progresses while holding a dagger.
  </div>
</div>

<div class="card">
  <div class="label">Skills</div>
  {#each groups as [school, ids] (school)}
    {#if school}<div class="group">{schoolName(school)}</div>{/if}
    {#each ids as id (id)}
      {@const s = skillInfo(id)}
      <div class="skill">
        <div>{s?.name ?? id}</div>
        <div class="muted small">{kindLine(id)}{s ? ' · ' : ''}{skillLine(id)}</div>
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
  .school progress {
    width: 100%;
    height: 8px;
  }
  .book {
    align-items: center;
    gap: 8px;
  }
</style>
