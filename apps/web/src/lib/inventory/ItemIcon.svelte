<script module lang="ts">
  // Sprites that returned an error once are not requested again.
  const missing = new Set<string>();
</script>

<script lang="ts">
  import type { ItemInfo } from '@game/shared';
  import { RARITY_COLORS, SLOT_GLYPHS, spriteUrl } from './itemUi.ts';

  let { item, size = 48 }: { item: ItemInfo; size?: number } = $props();

  const url = $derived(spriteUrl(item));
  let failedUrl = $state('');
  const useSprite = $derived(failedUrl !== url && !missing.has(url));
  const color = $derived(RARITY_COLORS[item.rarity]);
</script>

<span class="icon" style:--s="{size}px" style:--c={color} title="">
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
    <span class="placeholder">
      <span class="glyph">{item.slot ? SLOT_GLYPHS[item.slot] : '?'}</span>
      <span class="lvl">{item.itemLevel}</span>
    </span>
  {/if}
  {#if item.favorite}<span class="fav" aria-label="Favorite">★</span>{/if}
</span>

<style>
  .icon {
    position: relative;
    display: block;
    width: var(--s);
    height: var(--s);
    pointer-events: none;
  }
  img {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    display: block;
  }
  .placeholder {
    position: absolute;
    inset: 2px;
    border: 2px solid var(--c);
    border-radius: 3px;
    background: color-mix(in srgb, var(--c) 22%, #100d14);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 0 0 1px #0008;
  }
  .glyph {
    font-weight: bold;
    font-size: calc(var(--s) * 0.42);
    color: var(--c);
    text-shadow: 0 1px 0 #000;
  }
  .lvl {
    position: absolute;
    right: 3px;
    bottom: 1px;
    font-size: max(9px, calc(var(--s) * 0.2));
    color: var(--text);
    opacity: 0.8;
  }
  .fav {
    position: absolute;
    left: 2px;
    top: 0;
    font-size: max(10px, calc(var(--s) * 0.26));
    color: var(--gold-bright);
    text-shadow: 0 1px 1px #000;
  }
</style>
