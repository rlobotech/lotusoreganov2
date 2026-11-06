import type { CombatEvent } from '@game/engine';
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextureSource,
  type Texture,
} from 'pixi.js';
import { centerOn, clampPan, fitZoom, MAX_ZOOM, snapZoom, stepZoom, zoomAbout } from './camera.ts';
import { arenaBounds, gridToScreen, TILE_H, TILE_W, type Bounds, type Vec } from './iso.ts';
import type { Playback } from './playback.ts';
import { loadSprite } from './sprites.ts';
import type { UnitView } from './state.ts';

// Crisp pixel art: never smooth textures.
TextureSource.defaultOptions.scaleMode = 'nearest';

const BG = 0x0d0b10;
const PARTY_COLORS = [0x4a7fb0, 0x6a5acd, 0x3a9d8f, 0xc9a24a, 0x8a6ad0, 0x5aa0d0];
const ENEMY_COLORS = [0xb04a4a, 0x8f5a2a, 0x7a2a6a, 0x5a7a2a, 0xa05a2a, 0x6a2a2a];
const GREENS = [0x2f4a33, 0x2a4230, 0x34523a, 0x2c4632];
const STATUS_COLORS: Record<string, number> = {
  poison: 0x6adf3a,
  stun: 0xf2d04a,
  war_cry: 0x4aa0f2,
};
const VFX_COLORS: Record<string, number> = {
  slash: 0xffffff,
  slash_heavy: 0xffe08a,
  arrow: 0xe8e0c8,
  arrow_poison: 0x6adf3a,
  bolt: 0x7af0ff,
  fireball: 0xff8a2a,
  heal: 0x5af08a,
  heal_big: 0x8affb0,
  buff: 0xf2d04a,
};

const hash = (n: number) => {
  let h = Math.imul(n | 0, 0x9e3779b1);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

interface UnitNode {
  id: string;
  root: Container;
  ring: Graphics;
  shadow: Graphics;
  body: Container;
  bars: Graphics;
}

export interface SceneOptions {
  onSelect?: (id: string | null) => void;
  onZoom?: (zoom: number) => void;
}

export class Scene {
  private app: Application;
  private host: HTMLElement;
  private opts: SceneOptions;
  private world = new Container();
  private tiles = new Container();
  private fx = new Graphics();
  private overlay = new Container();
  private nodes = new Map<string, UnitNode>();
  private labels = new Map<string, Text>();
  private pb: Playback | null = null;
  private bounds: Bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  private cam = { x: 0, y: 0, zoom: 1, mode: 'fit' as 'fit' | 'free' };
  private selected: string | null = null;
  private disposed = false;
  private cleanup: Array<() => void> = [];
  private time = 0;

  private constructor(app: Application, host: HTMLElement, opts: SceneOptions) {
    this.app = app;
    this.host = host;
    this.opts = opts;
  }

  static async create(host: HTMLElement, opts: SceneOptions = {}): Promise<Scene> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: BG,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      roundPixels: true,
    });
    const scene = new Scene(app, host, opts);
    scene.init();
    return scene;
  }

  private init() {
    const { app } = this;
    this.host.appendChild(app.canvas);
    app.canvas.style.touchAction = 'none';
    app.canvas.style.display = 'block';
    this.world.sortableChildren = true;
    this.fx.zIndex = 1e6;
    this.world.addChild(this.tiles);
    this.world.addChild(this.fx);
    app.stage.addChild(this.world);
    app.stage.addChild(this.overlay);

    app.ticker.add((ticker) => {
      if (this.disposed) return;
      this.time += ticker.deltaMS;
      this.pb?.tick(ticker.deltaMS);
      this.render();
    });
    app.renderer.on('resize', () => this.onResize());
    // The stage can change size after creation (controls appear, phone rotates), so watch it.
    const observer = new ResizeObserver(() => {
      if (!this.disposed) this.app.resize();
    });
    observer.observe(this.host);
    this.cleanup.push(() => observer.disconnect());
    this.bindPointers();
  }

  destroy() {
    this.disposed = true;
    for (const fn of this.cleanup) fn();
    this.app.destroy(true, { children: true });
  }

  // ---------- public API ----------

  get zoom(): number {
    return this.cam.zoom;
  }

  async setPlayback(pb: Playback) {
    this.pb = pb;
    const first = pb.states[0]!;
    this.clearUnits();
    this.buildArena(first.arena.width, first.arena.height, first.arena.blocked);
    for (const id of first.order) await this.buildUnit(first.units[id]!, first.order.indexOf(id));
    this.select(null);
    this.fit();
  }

  fit() {
    this.cam.mode = 'fit';
    const { width, height } = this.app.screen;
    const z = fitZoom(width, height, this.bounds);
    this.cam.zoom = z;
    Object.assign(this.cam, centerOn(width, height, this.bounds, z));
    this.opts.onZoom?.(z);
  }

  zoomStep(dir: 1 | -1) {
    const { width, height } = this.app.screen;
    this.zoomTo(stepZoom(this.cam.zoom, dir, fitZoom(width, height, this.bounds)), {
      x: width / 2,
      y: height / 2,
    });
  }

  select(id: string | null) {
    this.selected = id;
    this.opts.onSelect?.(id);
  }

  // ---------- camera ----------

  private zoomTo(zoom: number, anchor: Vec) {
    const next = zoomAbout(this.cam, this.cam.zoom, zoom, anchor);
    this.cam.x = next.x;
    this.cam.y = next.y;
    this.cam.zoom = zoom;
    this.cam.mode = 'free';
    this.clamp();
    this.opts.onZoom?.(zoom);
  }

  private clamp() {
    const { width, height } = this.app.screen;
    Object.assign(this.cam, clampPan(this.cam, width, height, this.bounds, this.cam.zoom));
  }

  private onResize() {
    if (this.cam.mode === 'fit') this.fit();
    else this.clamp();
  }

  private bindPointers() {
    const canvas = this.app.canvas;
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
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.cam.zoom };
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
          this.cam.x += p.x - prev.x;
          this.cam.y += p.y - prev.y;
          this.cam.mode = 'free';
          this.clamp();
        }
      } else if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()] as [Vec, Vec];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const { width, height } = this.app.screen;
        const min = Math.min(1, fitZoom(width, height, this.bounds));
        const z = Math.max(min, Math.min(MAX_ZOOM, pinch.zoom * (dist / pinch.dist)));
        this.zoomTo(z, mid);
      }
    };

    const onUp = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (pinch && pts.size < 2) {
        // Snap back to a whole zoom step so pixels stay crisp.
        const { width, height } = this.app.screen;
        const snapped = snapZoom(this.cam.zoom, fitZoom(width, height, this.bounds));
        this.zoomTo(snapped, p ?? { x: width / 2, y: height / 2 });
        pinch = null;
      }
      if (pts.size === 0 && down && !moved && p && performance.now() - down.t < 500) {
        this.select(this.hitTest(p));
      }
      if (pts.size === 0) down = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      if (now - lastWheel < 90) return;
      lastWheel = now;
      const { width, height } = this.app.screen;
      const next = stepZoom(
        this.cam.zoom,
        e.deltaY < 0 ? 1 : -1,
        fitZoom(width, height, this.bounds),
      );
      this.zoomTo(next, local(e));
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

  private hitTest(p: Vec): string | null {
    const st = this.pb?.state;
    if (!st) return null;
    const wx = (p.x - this.cam.x) / this.cam.zoom;
    const wy = (p.y - this.cam.y) / this.cam.zoom;
    let best: string | null = null;
    let bestD = 16;
    for (const id of st.order) {
      const u = st.units[id]!;
      if (!u.alive) continue;
      const pos = gridToScreen(u.x, u.y);
      const d = Math.hypot(wx - pos.x, wy - (pos.y - 12));
      if (d < bestD) {
        best = id;
        bestD = d;
      }
    }
    return best;
  }

  // ---------- building ----------

  private clearUnits() {
    for (const n of this.nodes.values()) n.root.destroy({ children: true });
    this.nodes.clear();
    for (const t of this.labels.values()) t.destroy();
    this.labels.clear();
    for (const c of [...this.world.children]) {
      if (c !== this.tiles && c !== this.fx) c.destroy({ children: true });
    }
    this.tiles.removeChildren().forEach((c) => c.destroy());
  }

  private buildArena(w: number, h: number, blocked: Array<{ x: number; y: number }>) {
    this.bounds = arenaBounds(w, h);
    const g = new Graphics();
    const block = new Set(blocked.map((p) => `${p.x},${p.y}`));
    const diamond = (cx: number, cy: number, hw = TILE_W / 2, hh = TILE_H / 2) => [
      cx,
      cy - hh,
      cx + hw,
      cy,
      cx,
      cy + hh,
      cx - hw,
      cy,
    ];
    for (let s = 0; s <= w + h - 2; s++) {
      for (let x = 0; x < w; x++) {
        const y = s - x;
        if (y < 0 || y >= h) continue;
        const c = gridToScreen(x, y);
        const col = GREENS[Math.floor(hash(x * 131 + y * 7919) * GREENS.length)]!;
        g.poly(diamond(c.x, c.y)).fill(col).stroke({ width: 1, color: 0x1c2c20, alpha: 0.7 });
        if (hash(x * 17 + y * 31 + 5) > 0.7) {
          g.rect(c.x - 3, c.y - 1, 2, 1).fill({ color: 0x44684a });
          g.rect(c.x + 4, c.y + 1, 2, 1).fill({ color: 0x1f3324 });
        }
      }
    }
    this.tiles.addChild(g);
    this.tiles.zIndex = -1;

    for (const key of block) {
      const [bx, by] = key.split(',').map(Number) as [number, number];
      const c = gridToScreen(bx, by);
      const rock = new Graphics();
      const hgt = 12;
      const top = diamond(c.x, c.y - hgt);
      rock
        .poly([c.x - 16, c.y - hgt, c.x, c.y + 8 - hgt, c.x, c.y + 8, c.x - 16, c.y])
        .fill(0x4a4a52);
      rock
        .poly([c.x + 16, c.y - hgt, c.x, c.y + 8 - hgt, c.x, c.y + 8, c.x + 16, c.y])
        .fill(0x35353c);
      rock.poly(top).fill(0x6b6b74).stroke({ width: 1, color: 0x22222a });
      rock.zIndex = c.y + 1;
      this.world.addChild(rock);
    }
  }

  private async buildUnit(u: UnitView, index: number) {
    const root = new Container();
    const ring = new Graphics();
    const shadow = new Graphics();
    shadow.ellipse(0, 0, 9, 4).fill({ color: 0x000000, alpha: 0.35 });
    const body = new Container();
    const bars = new Graphics();
    root.addChild(ring, shadow, body, bars);

    const tex: Texture | null = u.sprite ? await loadSprite(u.sprite) : null;
    if (tex) {
      const s = new Sprite(tex);
      s.anchor.set(0.5, 0.875);
      body.addChild(s);
    } else {
      const palette = u.team === 'party' ? PARTY_COLORS : ENEMY_COLORS;
      const color = palette[index % palette.length]!;
      const g = new Graphics();
      g.rect(-5, -17, 10, 14).fill(color).stroke({ width: 1, color: 0x111111 });
      g.circle(0, -21, 4).fill(0xe8c8a0).stroke({ width: 1, color: 0x111111 });
      g.rect(-5, -9, 10, 2).fill({ color: 0x000000, alpha: 0.25 });
      body.addChild(g);
    }
    this.world.addChild(root);
    this.nodes.set(u.id, { id: u.id, root, ring, shadow, body, bars });
  }

  // ---------- labels (screen-space text stays crisp at any zoom) ----------

  private label(
    key: string,
    text: string,
    pos: Vec,
    opts: { color?: number; size?: number; alpha?: number; used: Set<string> },
  ) {
    let t = this.labels.get(key);
    if (!t) {
      t = new Text({
        text,
        style: {
          fontFamily: 'Georgia, serif',
          fontSize: opts.size ?? 12,
          fill: opts.color ?? 0xffffff,
          stroke: { color: 0x000000, width: 3 },
          fontWeight: 'bold',
          align: 'center',
        },
      });
      t.anchor.set(0.5);
      this.labels.set(key, t);
      this.overlay.addChild(t);
    }
    if (t.text !== text) t.text = text;
    t.position.set(Math.round(pos.x), Math.round(pos.y));
    t.alpha = opts.alpha ?? 1;
    opts.used.add(key);
  }

  private toScreen(p: Vec): Vec {
    return { x: p.x * this.cam.zoom + this.cam.x, y: p.y * this.cam.zoom + this.cam.y };
  }

  // ---------- per-frame rendering ----------

  private render() {
    const pb = this.pb;
    if (!pb) return;
    this.world.scale.set(this.cam.zoom);
    this.world.position.set(Math.round(this.cam.x), Math.round(this.cam.y));

    const st = pb.state;
    const ev = pb.event;
    const p = pb.progress;
    const used = new Set<string>();
    const fx = this.fx;
    fx.clear();

    for (const id of st.order) {
      const u = st.units[id]!;
      const node = this.nodes.get(id);
      if (!node) continue;

      let pos = gridToScreen(u.x, u.y);
      let dx = 0;
      let dy = 0;
      let alpha = 1;
      let squash = 1;
      let flash = 0;
      let hp = u.hp;
      let faceLeft = u.faceLeft;
      const dead = !u.alive;

      if (ev) {
        if (ev.t === 'move' && ev.unit === id) {
          const path = [{ x: u.x, y: u.y }, ...ev.path];
          const segs = path.length - 1;
          const f = p * segs;
          const i = Math.min(Math.floor(f), segs - 1);
          const a = gridToScreen(path[i]!.x, path[i]!.y);
          const b = gridToScreen(path[i + 1]!.x, path[i + 1]!.y);
          const frac = f - i;
          pos = { x: lerp(a.x, b.x, frac), y: lerp(a.y, b.y, frac) };
          dy = -Math.abs(Math.sin(f * Math.PI)) * 3;
          if (b.x !== a.x) faceLeft = b.x < a.x;
        } else if (ev.t === 'skill' && ev.unit === id) {
          const target = gridToScreen(ev.x, ev.y);
          const vx = target.x - pos.x;
          const vy = target.y - pos.y;
          const len = Math.hypot(vx, vy) || 1;
          const lunge = Math.sin(Math.PI * Math.min(1, p * 1.3)) * 5;
          dx = (vx / len) * lunge;
          dy = (vy / len) * lunge;
        } else if (ev.t === 'damage' && ev.target === id) {
          const k = 1 - p;
          flash = k;
          dx = Math.sin(p * 40) * 2 * k;
          hp = lerp(u.hp, ev.hp, easeOut(Math.min(1, p * 1.5)));
        } else if (ev.t === 'heal' && ev.target === id) {
          hp = lerp(u.hp, ev.hp, easeOut(p));
        } else if (ev.t === 'death' && ev.unit === id) {
          alpha = 1 - 0.65 * p;
          squash = 1 - 0.6 * p;
        }
      }
      if (dead) {
        alpha = 0.35;
        squash = 0.4;
      }

      node.root.position.set(Math.round(pos.x + dx), Math.round(pos.y + dy));
      node.root.zIndex = pos.y;
      node.body.scale.set(faceLeft ? -1 : 1, squash);
      node.body.alpha = alpha;
      node.body.tint = flash > 0.05 ? 0xffb0b0 : 0xffffff;
      node.shadow.alpha = dead ? 0.2 : 1;

      // active / selected ring
      node.ring.clear();
      const isActive = st.active === id && !dead;
      if (isActive || this.selected === id) {
        const pulse = 0.65 + 0.35 * Math.sin(this.time / 160);
        node.ring.poly([0, -7, 15, 0, 0, 7, -15, 0]).stroke({
          width: 1.5,
          color: this.selected === id ? 0xffffff : 0xf2d04a,
          alpha: isActive ? pulse : 0.9,
        });
      }

      // hp bar + statuses
      node.bars.clear();
      if (!dead) {
        const w = 18;
        const frac = Math.max(0, Math.min(1, hp / u.maxHp));
        const color = frac > 0.5 ? 0x5ad05a : frac > 0.25 ? 0xe0c040 : 0xd04a4a;
        node.bars.rect(-w / 2 - 1, -37, w + 2, 4).fill(0x000000);
        node.bars.rect(-w / 2, -36, w, 2).fill(0x401818);
        node.bars.rect(-w / 2, -36, Math.max(frac > 0 ? 1 : 0, w * frac), 2).fill(color);
        u.statuses.forEach((s, i) => {
          node.bars.rect(-w / 2 + i * 4, -41, 3, 3).fill(STATUS_COLORS[s] ?? 0xcccccc);
        });
      }

      if (isActive || this.selected === id) {
        const top = this.toScreen({ x: pos.x + dx, y: pos.y + dy - 48 });
        this.label(`name-${id}`, u.name, top, { size: 11, used });
      }
    }

    if (ev) this.drawEventFx(ev, pb.state.units, p, used);

    // banners
    if (ev?.t === 'round') {
      const a = p < 0.2 ? p / 0.2 : p > 0.7 ? (1 - p) / 0.3 : 1;
      this.label(
        'banner',
        `Round ${ev.n}`,
        { x: this.app.screen.width / 2, y: 28 },
        {
          size: 18,
          color: 0xf2d04a,
          alpha: a,
          used,
        },
      );
    } else if (ev?.t === 'end') {
      const text =
        ev.outcome === 'victory' ? 'VICTORY' : ev.outcome === 'defeat' ? 'DEFEAT' : 'DRAW';
      const color =
        ev.outcome === 'victory' ? 0x8affb0 : ev.outcome === 'defeat' ? 0xff7a7a : 0xcccccc;
      this.label(
        'banner',
        text,
        { x: this.app.screen.width / 2, y: this.app.screen.height / 2 },
        {
          size: 34,
          color,
          alpha: Math.min(1, p * 4),
          used,
        },
      );
    }

    for (const [key, t] of this.labels) {
      if (!used.has(key)) {
        t.destroy();
        this.labels.delete(key);
      }
    }
  }

  private drawEventFx(
    ev: CombatEvent,
    units: Record<string, UnitView>,
    p: number,
    used: Set<string>,
  ) {
    const fx = this.fx;
    const chest = (id: string): Vec | null => {
      const u = units[id];
      if (!u) return null;
      const g = gridToScreen(u.x, u.y);
      return { x: g.x, y: g.y - 12 };
    };

    if (ev.t === 'skill') {
      const from = chest(ev.unit);
      const to = { x: gridToScreen(ev.x, ev.y).x, y: gridToScreen(ev.x, ev.y).y - 12 };
      if (!from) return;
      const vfx = ev.vfx ?? 'flash';
      const color = VFX_COLORS[vfx] ?? 0xffffff;
      const flight = 0.6;
      if (vfx === 'arrow' || vfx === 'arrow_poison' || vfx === 'bolt' || vfx === 'fireball') {
        if (p < flight) {
          const f = p / flight;
          const x = lerp(from.x, to.x, f);
          const y = lerp(from.y, to.y, f);
          if (vfx === 'bolt' || vfx === 'fireball') {
            fx.circle(x, y, vfx === 'fireball' ? 3 + f * 3 : 3).fill(color);
            fx.circle(
              lerp(from.x, to.x, Math.max(0, f - 0.15)),
              lerp(from.y, to.y, Math.max(0, f - 0.15)),
              2,
            ).fill({ color, alpha: 0.5 });
          } else {
            const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
            const ux = (to.x - from.x) / len;
            const uy = (to.y - from.y) / len;
            fx.moveTo(x - ux * 6, y - uy * 6)
              .lineTo(x, y)
              .stroke({ width: 1.5, color });
          }
        } else {
          const q = (p - flight) / (1 - flight);
          if (vfx === 'fireball') {
            const r = 4 + q * 24;
            fx.circle(to.x, to.y, r)
              .fill({ color, alpha: 0.5 * (1 - q) })
              .stroke({ width: 1.5, color: 0xffe08a, alpha: 1 - q });
          } else {
            fx.circle(to.x, to.y, 2 + q * 5).stroke({ width: 1, color, alpha: 1 - q });
          }
        }
      } else if (vfx === 'slash' || vfx === 'slash_heavy') {
        if (p > 0.25) {
          const q = (p - 0.25) / 0.75;
          const s = vfx === 'slash' ? 8 : 11;
          const a = 1 - q;
          fx.moveTo(to.x - s, to.y - s)
            .lineTo(to.x + s, to.y + s)
            .stroke({ width: 2, color, alpha: a });
          if (vfx === 'slash_heavy') {
            fx.moveTo(to.x + s, to.y - s)
              .lineTo(to.x - s, to.y + s)
              .stroke({ width: 2, color, alpha: a });
          }
        }
      } else if (vfx === 'heal' || vfx === 'heal_big') {
        for (let i = 0; i < 4; i++) {
          const ox = (i - 1.5) * 5;
          const oy = -p * 14 - i * 2;
          const a = 1 - p;
          fx.rect(to.x + ox - 1, to.y + oy - 3, 2, 6).fill({ color, alpha: a });
          fx.rect(to.x + ox - 3, to.y + oy - 1, 6, 2).fill({ color, alpha: a });
        }
      } else if (vfx === 'buff') {
        fx.circle(from.x, from.y + 6, 6 + p * 14).stroke({ width: 1.5, color, alpha: 1 - p });
      } else {
        fx.circle(to.x, to.y, 3 + p * 8).stroke({ width: 1.5, color, alpha: 1 - p });
      }
    }

    const floatText = (target: string, text: string, color: number, size = 14, key = 'f') => {
      const c = chest(target);
      if (!c) return;
      const top = this.toScreen({ x: c.x, y: c.y - 26 });
      this.label(
        `${key}-${target}`,
        text,
        { x: top.x, y: top.y - p * 18 },
        {
          color,
          size,
          alpha: 1 - Math.pow(p, 3),
          used,
        },
      );
    };

    if (ev.t === 'damage') {
      floatText(
        ev.target,
        `${ev.amount}${ev.crit ? '!' : ''}`,
        ev.crit ? 0xffd04a : 0xff6a6a,
        ev.crit ? 18 : 14,
      );
    } else if (ev.t === 'heal') {
      floatText(ev.target, `+${ev.amount}`, 0x6aff9a);
    } else if (ev.t === 'miss') {
      floatText(ev.target, 'miss', 0xcccccc, 12);
    } else if (ev.t === 'status' && ev.on) {
      floatText(
        ev.unit,
        ev.status.replace('_', ' '),
        STATUS_COLORS[ev.status] ?? 0xffffff,
        11,
        's',
      );
    } else if (ev.t === 'skip') {
      floatText(ev.unit, ev.reason === 'stun' ? 'stunned' : '...', 0xf2d04a, 12, 'k');
    } else if (ev.t === 'death') {
      floatText(ev.unit, 'defeated', 0xcccccc, 12, 'd');
    }
  }
}
