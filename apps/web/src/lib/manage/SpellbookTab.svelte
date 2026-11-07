<script lang="ts">
  import { cap } from '../labels.ts';
  import { session } from '../session.svelte.ts';
  import MemberChips from './MemberChips.svelte';

  let { memberId = $bindable() }: { memberId: string } = $props();

  const party = $derived(session.party!);
  const m = $derived(party.members.find((x) => x.id === memberId) ?? party.members[0]!);
  const skillInfo = (id: string) => session.skills.find((s) => s.id === id);

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
</script>

<MemberChips bind:selected={memberId} />

<div class="card">
  <div class="row">
    <h3>{m.name}</h3>
    <span class="muted">{cap(m.race)} {cap(m.cls)}</span>
  </div>
  <div class="label">Skills</div>
  {#each m.skills as id (id)}
    {@const s = skillInfo(id)}
    <div class="skill">
      <div>{s?.name ?? id}</div>
      <div class="muted small">{kindLine(id)}{s ? ' · ' : ''}{skillLine(id)}</div>
    </div>
  {/each}
  <div class="muted small">
    New skills are learned by using skills in a family; this arrives in a later update. Choose when
    each skill is used in the AI tab.
  </div>
</div>

<style>
  h3 {
    margin: 0;
  }
  .skill {
    border-top: 1px solid var(--line);
    padding-top: 8px;
  }
</style>
