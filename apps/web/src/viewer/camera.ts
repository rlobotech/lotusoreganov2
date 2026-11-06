import type { Bounds } from './iso.ts';

/**
 * Pure camera maths. The scene owns pointer handling; these functions decide zoom steps,
 * fitting and clamping so they can be unit tested.
 */

export const MAX_ZOOM = 8;

/** Largest integer zoom that shows all of `bounds` in the viewport (fractional only if 1x does not fit). */
export function fitZoom(viewW: number, viewH: number, bounds: Bounds, margin = 12): number {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const raw = Math.min((viewW - margin * 2) / w, (viewH - margin * 2) / h);
  if (!(raw > 0)) return 1;
  return raw >= 1 ? Math.min(MAX_ZOOM, Math.floor(raw)) : raw;
}

/** Next integer zoom step in a direction, never below `minZoom` (the fit zoom when it is < 1). */
export function stepZoom(current: number, dir: 1 | -1, minZoom = 1): number {
  const next = dir > 0 ? Math.floor(current + 1e-6) + 1 : Math.ceil(current - 1e-6) - 1;
  return Math.max(Math.min(minZoom, 1), Math.min(MAX_ZOOM, next));
}

export function snapZoom(zoom: number, minZoom = 1): number {
  return Math.max(Math.min(minZoom, 1), Math.min(MAX_ZOOM, Math.max(1, Math.round(zoom))));
}

/** Camera position (screen px of the world origin) that centres `bounds` in the viewport. */
export function centerOn(viewW: number, viewH: number, bounds: Bounds, zoom: number) {
  return {
    x: viewW / 2 - ((bounds.minX + bounds.maxX) / 2) * zoom,
    y: viewH / 2 - ((bounds.minY + bounds.maxY) / 2) * zoom,
  };
}

/** Keeps at least `keep` px of the arena on screen so it cannot be dragged away entirely. */
export function clampPan(
  pos: { x: number; y: number },
  viewW: number,
  viewH: number,
  bounds: Bounds,
  zoom: number,
  keep = 80,
) {
  const left = bounds.minX * zoom + pos.x;
  const right = bounds.maxX * zoom + pos.x;
  const top = bounds.minY * zoom + pos.y;
  const bottom = bounds.maxY * zoom + pos.y;
  let { x, y } = pos;
  if (right < keep) x += keep - right;
  if (left > viewW - keep) x -= left - (viewW - keep);
  if (bottom < keep) y += keep - bottom;
  if (top > viewH - keep) y -= top - (viewH - keep);
  return { x, y };
}

/** Zoom about a screen point so the world point under it stays put. */
export function zoomAbout(
  pos: { x: number; y: number },
  oldZoom: number,
  newZoom: number,
  anchor: { x: number; y: number },
) {
  const wx = (anchor.x - pos.x) / oldZoom;
  const wy = (anchor.y - pos.y) / oldZoom;
  return { x: anchor.x - wx * newZoom, y: anchor.y - wy * newZoom };
}
