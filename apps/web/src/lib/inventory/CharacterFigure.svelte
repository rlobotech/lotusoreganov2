<script module lang="ts">
  // Sprites that returned an error once are not requested again.
  const missing = new Set<string>();
</script>

<script lang="ts">
  import { characterSprite, figureColors } from './layout.ts';

  let {
    race,
    cls,
    size = 128,
    alive = true,
  }: { race: string; cls: string; size?: number; alive?: boolean } = $props();

  const url = $derived(characterSprite(race, cls));
  let failedUrl = $state('');
  const useSprite = $derived(failedUrl !== url && !missing.has(url));
  const c = $derived(figureColors(race, cls));
</script>

<span class="fig" class:dead={!alive} style:--s="{size}px">
  {#if useSprite}
    <img
      src={url}
      alt=""
      draggable="false"
      onerror={() => {
        missing.add(url);
        failedUrl = url;
      }}
    />
  {:else}
    <!-- Placeholder: a 32x32 pixel figure in the class and race colors. -->
    <svg viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">
      <ellipse cx="16" cy="30" rx="8" ry="1.6" fill="#0008" />
      <rect x="11" y="8" width="10" height="9" fill={c.main} />
      <rect x="9" y="9" width="2" height="8" fill={c.main} />
      <rect x="21" y="9" width="2" height="8" fill={c.main} />
      <rect x="9" y="16" width="2" height="2" fill={c.skin} />
      <rect x="21" y="16" width="2" height="2" fill={c.skin} />
      <rect x="11" y="15" width="10" height="2" fill={c.accent} />
      <rect x="11" y="17" width="4" height="10" fill={c.main} />
      <rect x="17" y="17" width="4" height="10" fill={c.main} />
      <rect x="11" y="26" width="4" height="2" fill="#1c1824" />
      <rect x="17" y="26" width="4" height="2" fill="#1c1824" />
      <rect x="12" y="2" width="8" height="7" fill={c.skin} />
      <rect x="12" y="2" width="8" height="2" fill={c.accent} />
      <rect x="14" y="5" width="1" height="1" fill="#1c1824" />
      <rect x="17" y="5" width="1" height="1" fill="#1c1824" />
    </svg>
  {/if}
</span>

<style>
  .fig {
    display: block;
    width: var(--s);
    height: var(--s);
  }
  img,
  svg {
    width: 100%;
    height: 100%;
    display: block;
    image-rendering: pixelated;
  }
  .dead {
    filter: grayscale(1) brightness(0.6);
  }
</style>
