import { centerOn, clampPan, fitZoom, MAX_ZOOM, snapZoom, stepZoom, zoomAbout } from './camera.ts';
import type { Bounds, Vec } from './iso.ts';

export interface CameraHost {
  /** Size of the drawing area in CSS pixels. */
  size(): { width: number; height: number };
  /** Extent of the content in world pixels. */
  bounds(): Bounds;
  /** A tap or click (not a drag) at a screen position. */
  onTap?(p: Vec): void;
  onZoom?(zoom: number): void;
}

/**
 * Pan (drag), zoom (wheel, pinch, buttons) and fit for a Pixi canvas, shared by the combat scene
 * and the world map. Zoom moves in whole steps so pixel art stays crisp.
 */
export class CameraController {
  x = 0;
  y = 0;
  zoom = 1;
  mode: 'fit' | 'free' = 'fit';
  private canvas: HTMLCanvasElement;
  private host: CameraHost;
  private cleanup: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, host: CameraHost) {
    this.canvas = canvas;
    this.host = host;
    this.bind();
  }

  dispose() {
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
  }

  private minZoom(): number {
    const { width, height } = this.host.size();
    return fitZoom(width, height, this.host.bounds());
  }

  fit() {
    this.mode = 'fit';
    const { width, height } = this.host.size();
    const bounds = this.host.bounds();
    this.zoom = fitZoom(width, height, bounds);
    Object.assign(this, centerOn(width, height, bounds, this.zoom));
    this.host.onZoom?.(this.zoom);
  }

  zoomStep(dir: 1 | -1) {
    const { width, height } = this.host.size();
    this.zoomTo(stepZoom(this.zoom, dir, this.minZoom()), { x: width / 2, y: height / 2 });
  }

  zoomTo(zoom: number, anchor: Vec) {
    const next = zoomAbout(this, this.zoom, zoom, anchor);
    this.x = next.x;
    this.y = next.y;
    this.zoom = zoom;
    this.mode = 'free';
    this.clamp();
    this.host.onZoom?.(zoom);
  }

  clamp() {
    const { width, height } = this.host.size();
    Object.assign(this, clampPan(this, width, height, this.host.bounds(), this.zoom));
  }

  /** Call when the drawing area changed size. */
  resized() {
    if (this.mode === 'fit') this.fit();
    else this.clamp();
  }

  /** World-space point under a screen position. */
  toWorld(p: Vec): Vec {
    return { x: (p.x - this.x) / this.zoom, y: (p.y - this.y) / this.zoom };
  }

  toScreen(p: Vec): Vec {
    return { x: p.x * this.zoom + this.x, y: p.y * this.zoom + this.y };
  }

  private bind() {
    const canvas = this.canvas;
    const pts = new Map<number, Vec>();
    let down: { x: number; y: number; t: number } | null = null;
    let moved = false;
    let pinch: { dist: number; zoom: number } | null = null;
    let lastWheel = 0;

    const local = (e: PointerEvent | WheelEvent): Vec => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 1) {
        down = { ...p, t: performance.now() };
        moved = false;
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()] as [Vec, Vec];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
        moved = true;
      }
    };

    const onMove = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 1) {
        if (down && !moved && Math.hypot(p.x - down.x, p.y - down.y) > 5) moved = true;
        if (moved) {
          this.x += p.x - prev.x;
          this.y += p.y - prev.y;
          this.mode = 'free';
          this.clamp();
        }
      } else if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()] as [Vec, Vec];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const min = Math.min(1, this.minZoom());
        const z = Math.max(min, Math.min(MAX_ZOOM, pinch.zoom * (dist / pinch.dist)));
        this.zoomTo(z, mid);
      }
    };

    const onUp = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (pinch && pts.size < 2) {
        // Snap back to a whole zoom step so pixels stay crisp.
        const { width, height } = this.host.size();
        this.zoomTo(snapZoom(this.zoom, this.minZoom()), p ?? { x: width / 2, y: height / 2 });
        pinch = null;
      }
      if (pts.size === 0 && down && !moved && p && performance.now() - down.t < 500) {
        this.host.onTap?.(p);
      }
      if (pts.size === 0) down = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      if (now - lastWheel < 90) return;
      lastWheel = now;
      this.zoomTo(stepZoom(this.zoom, e.deltaY < 0 ? 1 : -1, this.minZoom()), local(e));
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    this.cleanup.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    });
  }
}
