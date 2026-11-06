<script lang="ts">
  import type { PartySummary, WorldInfo } from '@game/shared';
  import { onMount } from 'svelte';
  import { MapScene } from '../viewer/mapScene.ts';

  let {
    world,
    party,
    selected = $bindable<string | null>(null),
  }: { world: WorldInfo; party: PartySummary | null; selected?: string | null } = $props();

  let host: HTMLDivElement;
  let scene = $state.raw<MapScene | null>(null);
  let zoom = $state(1);

  onMount(() => {
    let alive = true;
    MapScene.create(host, {
      onSelect: (id) => (selected = id),
      onZoom: (z) => (zoom = z),
    }).then((s) => {
      if (!alive) return s.destroy();
      scene = s;
    });
    return () => {
      alive = false;
      scene?.destroy();
      scene = null;
    };
  });

  $effect(() => {
    scene?.setWorld(world);
  });
  $effect(() => {
    scene?.setParty(party);
  });
  $effect(() => {
    scene?.select(selected);
  });

  const fmt = (z: number) => (Number.isInteger(z) ? `${z}x` : `${z.toFixed(2)}x`);
</script>

<div class="wrap">
  <div class="stage" bind:this={host}></div>
  <div class="zoom">
    <button onclick={() => scene?.zoomStep(1)} aria-label="Zoom in">+</button>
    <button onclick={() => scene?.fit()} aria-label="Fit map">{fmt(zoom)}</button>
    <button onclick={() => scene?.zoomStep(-1)} aria-label="Zoom out">&minus;</button>
  </div>
</div>

<style>
  .wrap {
    position: relative;
    height: 100%;
    min-height: 220px;
  }
  .stage {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .zoom {
    position: absolute;
    right: 8px;
    top: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .zoom button {
    background: rgba(23, 20, 28, 0.9);
  }
</style>
