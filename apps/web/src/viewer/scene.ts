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
import { CameraController } from './cameraController.ts';
import { arenaBounds, gridToScreen, TILE_H, TILE_W, type Bounds, type Vec } from './iso.ts';
import type { Playback } from './playback.ts';
import { loadSprite, loadTileSet, type TileSet } from './sprites.ts';
import type { UnitView } from './state.ts';

// Crisp pixel art: never smooth textures.
TextureSource.defaultOptions.scaleMode = 'nearest';

const BG = 0x0d0b10;
const PARTY_COLORS = [0x4a7fb0, 0x6a5acd, 0x3a9d8f, 0xc9a24a, 0x8a6ad0, 0x5aa0d0];
const ENEMY_COLORS = [0xb04a4a, 0x8f5a2a, 0x7a2a6a, 0x5a7a2a, 0xa05a2a, 0x6a2a2a];
const GREENS = [0x2f4a33, 0x2a4230, 0x34523a, 0x2c4632];
const DAMAGE_COLORS: Record<string, number> = {
  piercing: 0xd8d8e8,
  smash: 0xd2a878,
  cut: 0xff7a6a,
  blood: 0xc01838,
  fire: 0xff8a3a,
  water: 0x5ab0ff,
  electric: 0xf2e24a,
  earth: 0xa8884a,
  dark: 0xb070e0,
  light: 0xfff2b0,
};

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
  private camera!: CameraController;
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
    this.camera = new CameraController(app.canvas, {
      size: () => this.app.screen,
      bounds: () => this.bounds,
      onTap: (p) => this.select(this.hitTest(p)),
      onZoom: (z) => this.opts.onZoom?.(z),
    });
    this.cleanup.push(() => this.camera.dispose());
    app.renderer.on('resize', () => this.camera.resized());
    // The stage can change size after creation (controls appear, phone rotates), so watch it.
    const observer = new ResizeObserver(() => {
      if (!this.disposed) this.app.resize();
    });
    observer.observe(this.host);
    this.cleanup.push(() => observer.disconnect());
  }

  destroy() {
    this.disposed = true;
    for (const fn of this.cleanup) fn();
    this.app.destroy(true, { children: true });
  }

  // ---------- public API ----------

  get zoom(): number {
    return this.camera.zoom;
  }

  async setPlayback(pb: Playback) {
    this.pb = pb;
    const first = pb.states[0]!;
    this.clearUnits();
    await this.buildArena(first.arena.width, first.arena.height, first.arena.blocked);
    for (const id of first.order) await this.buildUnit(first.units[id]!, first.order.indexOf(id));
    this.select(null);
    this.fit();
  }

  fit() {
    this.camera.fit();
  }

  zoomStep(dir: 1 | -1) {
    this.camera.zoomStep(dir);
  }

  select(id: string | null) {
    this.selected = id;
    this.opts.onSelect?.(id);
  }

  private hitTest(p: Vec): string | null {
    const st = this.pb?.state;
    if (!st) return null;
    const wx = (p.x - this.camera.x) / this.camera.zoom;
    const wy = (p.y - this.camera.y) / this.camera.zoom;
    let best: string | null = null;
    let bestD = 16;
    for (const id of st.order) {
      const u = st.units[id]!;
      if (!u.alive || u.hidden) continue;
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

  private async buildArena(w: number, h: number, blocked: Array<{ x: number; y: number }>) {
    this.bounds = arenaBounds(w, h);
    // The floor is drawn from the sprite sheet when there is one, and in code when there is not.
    const tileSet: TileSet | null = await loadTileSet('grass');
    const g = new Graphics();
    const tiles: Sprite[] = [];
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
        if (tileSet) {
          // Under the picture, the colour of the grass, so the seams between tiles stay green.
          g.poly(diamond(c.x, c.y)).fill(0x14a02e);
          const tex =
            tileSet.textures[Math.floor(hash(x * 131 + y * 7919) * tileSet.textures.length)]!;
          const tile = new Sprite(tex);
          // The top of the tile is a diamond of the grid's size: its middle sits on the grid point.
          tile.anchor.set(0.5, TILE_H / 2 / tex.height);
          tile.scale.set(TILE_W / tex.width);
          tile.position.set(c.x, c.y);
          tile.zIndex = 0;
          tiles.push(tile);
          continue;
        }
        const col = GREENS[Math.floor(hash(x * 131 + y * 7919) * GREENS.length)]!;
        g.poly(diamond(c.x, c.y)).fill(col).stroke({ width: 1, color: 0x1c2c20, alpha: 0.7 });
        if (hash(x * 17 + y * 31 + 5) > 0.7) {
          g.rect(c.x - 3, c.y - 1, 2, 1).fill({ color: 0x44684a });
          g.rect(c.x + 4, c.y + 1, 2, 1).fill({ color: 0x1f3324 });
        }
      }
    }
    this.tiles.addChild(g);
    // The floor pictures go on top of the colour, in the order the diamonds were walked (back to front).
    for (const t of tiles) this.tiles.addChild(t);
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
    return { x: p.x * this.camera.zoom + this.camera.x, y: p.y * this.camera.zoom + this.camera.y };
  }

  // ---------- per-frame rendering ----------

  private render() {
    const pb = this.pb;
    if (!pb) return;
    this.world.scale.set(this.camera.zoom);
    this.world.position.set(Math.round(this.camera.x), Math.round(this.camera.y));

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
      // A summon is not there until the event that calls it up.
      node.root.visible = !u.hidden;
      if (u.hidden) continue;

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
        if (ev.t === 'move' && ev.unit === id && ev.teleport) {
          // A step through the shadows: it fades out where it was and in where it lands.
          const end = ev.path[ev.path.length - 1]!;
          pos = gridToScreen(p < 0.5 ? u.x : end.x, p < 0.5 ? u.y : end.y);
          alpha = Math.abs(p - 0.5) * 2;
        } else if (ev.t === 'move' && ev.unit === id) {
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
      } else if (u.statuses.includes('stealth')) {
        // A hidden unit is half seen.
        alpha = Math.min(alpha, 0.42);
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

    // A summon rises out of the ground: rings spreading from its tile.
    if (ev.t === 'summon') {
      const at = gridToScreen(ev.x, ev.y);
      const color = ev.team === 'party' ? 0xb080ff : 0xff7050;
      fx.circle(at.x, at.y, 4 + p * 16).stroke({ width: 2, color, alpha: 1 - p });
      fx.circle(at.x, at.y, 2 + p * 9).fill({ color, alpha: 0.35 * (1 - p) });
    }

    const floatText = (
      target: string,
      text: string,
      color: number,
      size = 14,
      key = 'f',
      off = 0,
    ) => {
      const c = chest(target);
      if (!c) return;
      const top = this.toScreen({ x: c.x, y: c.y - 26 });
      this.label(
        `${key}-${target}`,
        text,
        { x: top.x, y: top.y - p * 18 + off },
        {
          color,
          size,
          alpha: 1 - Math.pow(p, 3),
          used,
        },
      );
    };

    if (ev.t === 'damage') {
      // Coloured by damage type; a crit is bigger. Extra damage from the weapon stacks below.
      const color = DAMAGE_COLORS[ev.type] ?? 0xff6a6a;
      const key = ev.extra ? 'x' : 'f';
      const off = ev.extra ? 14 : 0;
      floatText(
        ev.target,
        `${ev.amount}${ev.crit ? '!' : ''}`,
        ev.crit ? 0xffd04a : color,
        ev.crit ? 18 : 14,
        key,
        off,
      );
      if (ev.resist !== 0) {
        floatText(
          ev.target,
          ev.resist > 0 ? `${ev.resist}% resisted` : `${-ev.resist}% weak`,
          ev.resist > 0 ? 0x9ab0c8 : 0xff9a6a,
          10,
          ev.extra ? 'rx' : 'r',
          off + 12,
        );
      }
    } else if (ev.t === 'skill' && ev.reaction) {
      floatText(ev.unit, 'opportunity!', 0xf2d04a, 11, 'k');
    } else if (ev.t === 'heal') {
      floatText(ev.target, `+${ev.amount}`, 0x6aff9a);
    } else if (ev.t === 'miss') {
      floatText(ev.target, `miss (${ev.chance}%)`, 0xcccccc, 12);
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
