<script lang="ts">
  import type { CombatEvent } from '@game/engine';
  import { onMount } from 'svelte';
  import { Playback } from '../viewer/playback.ts';
  import { Scene } from '../viewer/scene.ts';

  let {
    events,
    autoplay = true,
    onfinished,
  }: { events: CombatEvent[]; autoplay?: boolean; onfinished?: () => void } = $props();

  let host: HTMLDivElement;
  let scene: Scene | null = null;
  let sceneReady = $state(false);
  let pb = $state.raw<Playback | null>(null);
  let tick = $state(0);
  let selectedId = $state<string | null>(null);
  let zoom = $state(1);
  let finishedFired = false;

  onMount(() => {
    let alive = true;
    Scene.create(host, {
      onSelect: (id) => (selectedId = id),
      onZoom: (z) => (zoom = z),
    }).then((s) => {
      if (!alive) return s.destroy();
      scene = s;
      sceneReady = true;
    });
    return () => {
      alive = false;
      sceneReady = false;
      scene?.destroy();
      scene = null;
    };
  });

  $effect(() => {
    if (!sceneReady || !scene) return;
    const playback = new Playback(events);
    finishedFired = false;
    const stop = playback.subscribe(() => {
      tick++;
      if (playback.atEnd && !finishedFired) {
        finishedFired = true;
        onfinished?.();
      }
    });
    pb = playback;
    // Dev-only handle so effects can be inspected from the console: window.__pb.seek(i)
    if (import.meta.env.DEV) (window as unknown as { __pb?: Playback }).__pb = playback;
    scene.setPlayback(playback).then(() => {
      tick++;
      if (autoplay) playback.play();
    });
    return stop;
  });

  const view = $derived.by(() => {
    void tick;
    const p = pb;
    if (!p) return null;
    const final = p.states[p.states.length - 1]!;
    return {
      index: p.index,
      length: p.length,
      playing: p.playing,
      speed: p.speed,
      round: p.round,
      rounds: p.totalRounds,
      atEnd: p.atEnd,
      outcome: p.atEnd ? final.outcome : null,
      selected: selectedId ? (p.state.units[selectedId] ?? null) : null,
    };
  });

  const speeds = [1, 2, 4];
  const fmtZoom = (z: number) => (Number.isInteger(z) ? `${z}x` : `${z.toFixed(2)}x`);
</script>

<div class="replay">
  <div class="stage" bind:this={host}>
    {#if view}
      <div class="chip">
        Round {Math.max(1, view.round)} / {view.rounds}
        {#if view.outcome}<span class="outcome {view.outcome}">{view.outcome}</span>{/if}
      </div>
      {#if view.selected}
        {@const u = view.selected}
        <div class="unit-card" class:enemy={u.team === 'enemy'}>
          <strong>{u.name}</strong> <span class="muted">L{u.level}</span>
          <div class="hp">
            <div class="hp-fill" style="width:{Math.max(0, (u.hp / u.maxHp) * 100)}%"></div>
          </div>
          <div class="muted">{u.hp} / {u.maxHp} HP{u.alive ? '' : ' (defeated)'}</div>
          {#if u.statuses.length}<div class="muted">{u.statuses.join(', ')}</div>{/if}
        </div>
      {/if}
    {/if}
  </div>

  {#if view && pb}
    <div class="controls">
      <input
        type="range"
        min="0"
        max={view.length}
        value={view.index}
        aria-label="Scrub replay"
        onpointerdown={() => pb?.pause()}
        oninput={(e) => pb?.seek(Number(e.currentTarget.value))}
      />
      <div class="row">
        <button onclick={() => pb?.prevTurn()} aria-label="Previous turn">&#9198; Turn</button>
        <button class="primary" onclick={() => pb?.toggle()}>
          {view.playing ? 'Pause' : view.atEnd ? 'Replay' : 'Play'}
        </button>
        <button onclick={() => pb?.nextTurn()} aria-label="Next turn">Turn &#9197;</button>
        <button onclick={() => pb?.end()}>End</button>
      </div>
      <div class="row">
        {#each speeds as s}
          <button class:active={view.speed === s} onclick={() => pb?.setSpeed(s)}>{s}x</button>
        {/each}
        <span class="spacer"></span>
        <button onclick={() => scene?.zoomStep(-1)} aria-label="Zoom out">&minus;</button>
        <button onclick={() => scene?.fit()} aria-label="Fit arena">Fit {fmtZoom(zoom)}</button>
        <button onclick={() => scene?.zoomStep(1)} aria-label="Zoom in">+</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .replay {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 220px;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #0d0b10;
  }
  .chip {
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 4px 10px;
    background: rgba(13, 11, 16, 0.8);
    border: 1px solid var(--line);
    border-radius: 14px;
    font-size: 13px;
    pointer-events: none;
  }
  .outcome {
    margin-left: 8px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .outcome.victory {
    color: #8affb0;
  }
  .outcome.defeat {
    color: #ff7a7a;
  }
  .unit-card {
    position: absolute;
    left: 8px;
    bottom: 8px;
    min-width: 150px;
    padding: 8px 10px;
    background: rgba(13, 11, 16, 0.88);
    border: 1px solid var(--gold);
    border-radius: 8px;
    font-size: 13px;
    pointer-events: none;
  }
  .unit-card.enemy {
    border-color: var(--red);
  }
  .hp {
    height: 6px;
    margin: 6px 0 4px;
    background: #401818;
    border-radius: 3px;
    overflow: hidden;
  }
  .hp-fill {
    height: 100%;
    background: var(--green);
  }
  .muted {
    color: var(--muted);
    font-size: 12px;
  }
  .controls {
    padding-top: 8px;
  }
  .row {
    display: flex;
    gap: 8px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .row .primary {
    flex: 1;
  }
  .spacer {
    flex: 1;
  }
</style>
