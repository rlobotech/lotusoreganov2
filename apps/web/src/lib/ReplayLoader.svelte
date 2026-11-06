<script lang="ts">
  import type { CombatEvent } from '@game/engine';
  import { api, ApiError } from './api.ts';
  import ReplayView from './ReplayView.svelte';

  let {
    replayId = null,
    events = undefined,
    onfinished,
  }: { replayId?: number | null; events?: CombatEvent[]; onfinished?: () => void } = $props();

  let loaded = $state.raw<CombatEvent[] | null>(null);
  let message = $state('');

  $effect(() => {
    loaded = events ?? null;
    message = '';
    if (events || replayId === null) {
      if (!events) message = 'This fight was not recorded.';
      return;
    }
    let cancelled = false;
    api
      .replay(replayId)
      .then((r) => {
        if (!cancelled) loaded = r.events;
      })
      .catch((err) => {
        if (cancelled) return;
        message =
          err instanceof ApiError && err.status === 404
            ? 'This replay is no longer available (old replays roll off after a while).'
            : 'Could not load this replay.';
        onfinished?.();
      });
    return () => {
      cancelled = true;
    };
  });
</script>

{#if loaded}
  {#key loaded}
    <ReplayView events={loaded} {onfinished} />
  {/key}
{:else}
  <div class="placeholder">{message || 'Loading replay...'}</div>
{/if}

<style>
  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 220px;
    flex: 1;
    padding: 16px;
    text-align: center;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
  }
</style>
