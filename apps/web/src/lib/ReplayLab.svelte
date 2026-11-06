<script lang="ts">
  import { runCombat, samples, type CombatEvent } from '@game/engine';
  import ReplayView from './ReplayView.svelte';

  let seed = $state(1);
  let events = $state.raw<CombatEvent[]>(runCombat(samples.input(1)).events);
  let error = $state('');
  let label = $state('Sample fight, seed 1');

  function run() {
    const s = Math.max(1, Math.floor(Number(seed) || 1));
    events = runCombat(samples.input(s)).events;
    label = `Sample fight, seed ${s}`;
    error = '';
  }

  async function loadFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data) || data[0]?.t !== 'start') throw new Error('Not a combat log');
      events = data as CombatEvent[];
      label = file.name;
      error = '';
    } catch (err) {
      error = `Could not load log: ${(err as Error).message}`;
    }
  }
</script>

<section class="lab">
  <div class="bar">
    <input type="number" min="1" bind:value={seed} aria-label="Seed" />
    <button class="primary" onclick={run}>Run fight</button>
    <label class="file">
      Load log (.json)
      <input type="file" accept="application/json,.json" onchange={loadFile} hidden />
    </label>
  </div>
  <div class="muted">
    {label}{#if error}
      <span class="err">{error}</span>{/if}
  </div>
  <div class="view">
    {#key events}
      <ReplayView {events} />
    {/key}
  </div>
</section>

<style>
  .lab {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    min-height: 0;
  }
  .bar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .bar input[type='number'] {
    width: 96px;
  }
  .file {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel-2);
    cursor: pointer;
  }
  .view {
    flex: 1;
    min-height: 0;
  }
  .muted {
    color: var(--muted);
    font-size: 13px;
  }
  .err {
    color: #ff7a7a;
    margin-left: 8px;
  }
</style>
