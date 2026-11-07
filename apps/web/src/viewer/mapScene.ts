import type { PartySummary, WorldInfo } from '@game/shared';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { followWindow } from './camera.ts';
import { CameraController } from './cameraController.ts';
import type { Bounds, Vec } from './iso.ts';

/**
 * Pointy-top hexes in "odd-r" offset coordinates, matching packages/world. Tiles are 32 px wide
 * (the size of the generated hex tiles); until real tile art exists they are drawn in code.
 */
export const HEX_W = 32;
const S = HEX_W / Math.sqrt(3);
const ROW_STEP = 1.5 * S;

export function hexCenter(col: number, row: number): Vec {
  return { x: (col + 0.5 + 0.5 * (row & 1)) * HEX_W, y: row * ROW_STEP + S };
}

/** Biome colours (the palette the game design uses). */
const TERRAIN_COLORS: Record<string, number> = {
  plains: 0x8dbb45,
  savanna: 0xd9c36b,
  forest: 0x278044,
  dense_forest: 0x174d32,
  hills: 0x777b37,
  swamp: 0x568d79,
  desert: 0xe6b653,
  snow: 0xb8d8f5,
  ice: 0xe6f2ff,
  ashlands: 0x6e6862,
  lava: 0xf15a24,
  mountains: 0x777783,
  river: 0x49b9f2,
  water: 0x07509b,
};

/** Overlays are drawn over the biome, which stays visible underneath. */
const ROAD_COLOR = 0x6b5535;
const BRIDGE_COLOR = 0x8a6a3a;
const FORD_COLOR = 0xd8e8f0;
const PASS_COLOR = 0xe0dccc;

const SITE_COLORS = { city: 0xe0c060, dungeon: 0xa070d0, boss_dungeon: 0xe05050 } as const;

const hash = (n: number) => {
  let h = Math.imul(n | 0, 0x9e3779b1);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

function hexPoints(cx: number, cy: number, size: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(cx + size * Math.cos(a), cy + size * Math.sin(a));
  }
  return pts;
}

export interface MapOptions {
  onSelect?: (siteId: string | null) => void;
  onZoom?: (zoom: number) => void;
}

export class MapScene {
  private app: Application;
  private host: HTMLElement;
  private opts: MapOptions;
  private world = new Container();
  private tiles = new Graphics();
  private locks = new Graphics();
  private marks = new Graphics();
  private overlay = new Container();
  private labels = new Map<string, Text>();
  private camera!: CameraController;
  private info: WorldInfo | null = null;
  private party: PartySummary | null = null;
  private bounds: Bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  private selected: string | null = null;
  /** Show the whole continent instead of the part around the party. */
  private whole = false;
  /** Where each region's name is written (the middle of its land), in world pixels. */
  private regionAt = new Map<string, Vec>();
  private disposed = false;
  private cleanup: Array<() => void> = [];
  private time = 0;

  private constructor(app: Application, host: HTMLElement, opts: MapOptions) {
    this.app = app;
    this.host = host;
    this.opts = opts;
  }

  static async create(host: HTMLElement, opts: MapOptions = {}): Promise<MapScene> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: 0x0d0b10,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    const scene = new MapScene(app, host, opts);
    scene.init();
    return scene;
  }

  private init() {
    const { app } = this;
    this.host.appendChild(app.canvas);
    app.canvas.style.touchAction = 'none';
    app.canvas.style.display = 'block';
    this.world.addChild(this.tiles, this.locks, this.marks);
    app.stage.addChild(this.world, this.overlay);

    this.camera = new CameraController(app.canvas, {
      size: () => this.app.screen,
      bounds: () => this.bounds,
      fitBounds: () => this.windowBounds(),
      onTap: (p) => this.tap(p),
      onZoom: (z) => this.opts.onZoom?.(z),
    });
    this.cleanup.push(() => this.camera.dispose());
    app.renderer.on('resize', () => this.camera.resized());
    const observer = new ResizeObserver(() => {
      if (!this.disposed) this.app.resize();
    });
    observer.observe(this.host);
    this.cleanup.push(() => observer.disconnect());

    app.ticker.add((ticker) => {
      if (this.disposed) return;
      this.time += ticker.deltaMS;
      this.render();
    });
  }

  destroy() {
    this.disposed = true;
    for (const fn of this.cleanup) fn();
    this.app.destroy(true, { children: true });
  }

  fit() {
    this.camera.fit();
  }

  zoomStep(dir: 1 | -1) {
    this.camera.zoomStep(dir);
  }

  select(siteId: string | null) {
    this.selected = siteId;
    this.opts.onSelect?.(siteId);
  }

  // ---------- data ----------

  setWorld(info: WorldInfo) {
    this.info = info;
    this.bounds = {
      minX: -4,
      minY: -4,
      maxX: (info.width + 0.5) * HEX_W + 4,
      maxY: (info.height - 1) * ROW_STEP + 2 * S + 4,
    };
    const g = this.tiles;
    g.clear();
    for (let row = 0; row < info.height; row++) {
      for (let col = 0; col < info.width; col++) {
        const c = hexCenter(col, row);
        const base = TERRAIN_COLORS[info.terrain[row * info.width + col]!] ?? 0x444444;
        const shade = 0.9 + hash(col * 131 + row * 7919) * 0.2;
        g.poly(hexPoints(c.x, c.y, S - 0.5))
          .fill(tint(base, shade))
          .stroke({ width: 1, color: 0x1a1a22, alpha: 0.55 });
      }
    }
    this.drawOverlays(info);
    this.findRegionNames(info);
    this.camera.fit();
  }

  /** The middle of each region's land, where its name is written. */
  private findRegionNames(info: WorldInfo) {
    const sums = new Map<string, { x: number; y: number; n: number }>();
    for (let row = 0; row < info.height; row++) {
      for (let col = 0; col < info.width; col++) {
        const i = row * info.width + col;
        const t = info.terrain[i];
        if (t === 'water' || t === 'mountains' || t === 'river') continue;
        const z = info.zoneOf[i]!;
        const c = hexCenter(col, row);
        const sum = sums.get(z) ?? { x: 0, y: 0, n: 0 };
        sum.x += c.x;
        sum.y += c.y;
        sum.n++;
        sums.set(z, sum);
      }
    }
    this.regionAt.clear();
    for (const [z, sum] of sums) this.regionAt.set(z, { x: sum.x / sum.n, y: sum.y / sum.n });
  }

  /** Roads, fords, bridges and passes on top of the biome colours. */
  private drawOverlays(info: WorldInfo) {
    const g = this.tiles;
    const at = (col: number, row: number) =>
      col < 0 || row < 0 || col >= info.width || row >= info.height
        ? 'none'
        : (info.overlay[row * info.width + col] ?? 'none');
    for (let row = 0; row < info.height; row++) {
      for (let col = 0; col < info.width; col++) {
        const kind = at(col, row);
        if (kind === 'none') continue;
        const c = hexCenter(col, row);
        if (kind === 'road' || kind === 'bridge') {
          const color = kind === 'road' ? ROAD_COLOR : BRIDGE_COLOR;
          const width = kind === 'road' ? 4 : 6;
          // Joined to the road/bridge hexes next to it (each pair is drawn once, from the left/upper one).
          const odd = row & 1;
          const half: Array<[number, number]> = odd
            ? [
                [1, 0],
                [0, 1],
                [1, 1],
              ]
            : [
                [1, 0],
                [-1, 1],
                [0, 1],
              ];
          for (const [dc, dr] of half) {
            const k = at(col + dc, row + dr);
            if (k !== 'road' && k !== 'bridge') continue;
            const n = hexCenter(col + dc, row + dr);
            g.moveTo(c.x, c.y).lineTo(n.x, n.y).stroke({ width, color, cap: 'round' });
          }
          g.circle(c.x, c.y, width / 2 + 0.5).fill(color);
        } else if (kind === 'ford') {
          for (const dx of [-5, 0, 5]) g.circle(c.x + dx, c.y + (dx ? 2 : -2), 2).fill(FORD_COLOR);
        } else if (kind === 'pass') {
          g.poly([c.x - 7, c.y + 5, c.x, c.y - 6, c.x + 7, c.y + 5]).stroke({
            width: 2,
            color: PASS_COLOR,
          });
        }
      }
    }
  }

  /** How many hexes wide the view around the party is (hexes stay readable on a phone). */
  private static readonly VIEW_COLS = 14;

  /**
   * The continent is too big to read whole, so the view fits a window of a few hexes around the
   * party (shaped like the screen) and follows the party while the player has not moved the camera.
   * "Whole continent" shows everything instead.
   */
  private windowBounds(): Bounds {
    const all = this.bounds;
    if (!this.info || this.whole) return all;
    const { width, height } = this.app.screen;
    const at = this.party ? hexCenter(this.party.pos.col, this.party.pos.row) : null;
    const center = at ?? { x: (all.minX + all.maxX) / 2, y: (all.minY + all.maxY) / 2 };
    return followWindow(all, center, MapScene.VIEW_COLS * HEX_W, width, height);
  }

  /** Switches between the part around the party and the whole continent. */
  setWhole(whole: boolean) {
    this.whole = whole;
    this.camera.fit();
  }

  setParty(party: PartySummary | null) {
    const moved = party?.pos.row !== this.party?.pos.row || party?.pos.col !== this.party?.pos.col;
    this.party = party;
    this.redrawLocks();
    if (moved && this.camera?.mode === 'fit') this.camera.fit();
  }

  private zoneLocked(zoneId: string): boolean {
    const z = this.info?.zones.find((x) => x.id === zoneId);
    return !!z?.unlockedBy && !(this.party?.cleared ?? []).includes(z.unlockedBy);
  }

  private redrawLocks() {
    const info = this.info;
    this.locks.clear();
    if (!info) return;
    for (let row = 0; row < info.height; row++) {
      for (let col = 0; col < info.width; col++) {
        if (!this.zoneLocked(info.zoneOf[row * info.width + col]!)) continue;
        const c = hexCenter(col, row);
        this.locks.poly(hexPoints(c.x, c.y, S - 0.5)).fill({ color: 0x0d0b10, alpha: 0.8 });
      }
    }
  }

  // ---------- interaction ----------

  private tap(p: Vec) {
    const info = this.info;
    if (!info) return;
    const w = this.camera.toWorld(p);
    let best: string | null = null;
    let bestD = 14;
    for (const s of info.sites) {
      const c = hexCenter(s.col, s.row);
      const d = Math.hypot(w.x - c.x, w.y - c.y);
      if (d < bestD) {
        best = s.id;
        bestD = d;
      }
    }
    this.select(best);
  }

  // ---------- drawing ----------

  private label(key: string, text: string, pos: Vec, used: Set<string>, alpha = 1, bold = false) {
    let t = this.labels.get(key);
    if (!t) {
      t = new Text({
        text,
        style: {
          fontFamily: 'Georgia, serif',
          fontSize: 11,
          fill: 0xf4ecd8,
          stroke: { color: 0x000000, width: 3 },
          fontWeight: bold ? 'bold' : 'normal',
          align: 'center',
        },
      });
      t.anchor.set(0.5, 0);
      this.labels.set(key, t);
      this.overlay.addChild(t);
    }
    if (t.text !== text) t.text = text;
    t.position.set(Math.round(pos.x), Math.round(pos.y));
    t.alpha = alpha;
    used.add(key);
  }

  private render() {
    const info = this.info;
    this.world.scale.set(this.camera.zoom);
    this.world.position.set(this.camera.x, this.camera.y);
    if (!info) return;
    const used = new Set<string>();
    const m = this.marks;
    m.clear();
    const ordered = new Map<string, number>();
    (this.party?.orders ?? []).forEach((o, i) => {
      if (o.targetSiteId && !ordered.has(o.targetSiteId)) ordered.set(o.targetSiteId, i + 1);
    });

    for (const s of info.sites) {
      const c = hexCenter(s.col, s.row);
      const color = SITE_COLORS[s.kind];
      if (s.kind === 'city') {
        m.rect(c.x - 6, c.y - 4, 12, 9)
          .fill(color)
          .stroke({ width: 1, color: 0x2a2010 });
        m.poly([c.x - 8, c.y - 4, c.x, c.y - 12, c.x + 8, c.y - 4])
          .fill(0xb04a3a)
          .stroke({ width: 1, color: 0x2a2010 });
        m.rect(c.x - 1.5, c.y + 0, 3, 5).fill(0x4a3020);
      } else if (s.kind === 'dungeon') {
        m.poly([
          c.x - 8,
          c.y + 6,
          c.x - 8,
          c.y - 2,
          c.x,
          c.y - 10,
          c.x + 8,
          c.y - 2,
          c.x + 8,
          c.y + 6,
        ])
          .fill(0x3a2f4a)
          .stroke({ width: 1.5, color });
        m.rect(c.x - 3, c.y - 1, 6, 7).fill(0x0d0b10);
      } else {
        m.circle(c.x, c.y - 2, 9)
          .fill(0x4a1a1a)
          .stroke({ width: 2, color });
        m.circle(c.x - 3.5, c.y - 4, 2).fill(color);
        m.circle(c.x + 3.5, c.y - 4, 2).fill(color);
        m.rect(c.x - 3, c.y + 2, 6, 2).fill(color);
      }
      if (ordered.has(s.id)) {
        m.circle(c.x, c.y, 14).stroke({
          width: 1.5,
          color: 0xf2d04a,
          alpha: 0.5 + 0.5 * Math.sin(this.time / 250),
        });
      }
      if (this.selected === s.id) m.circle(c.x, c.y, 16).stroke({ width: 2, color: 0xffffff });

      const below = this.camera.toScreen({ x: c.x, y: c.y + 10 });
      const n = ordered.get(s.id);
      // Places in a region that is still closed are shown dimmed, like the fog over them.
      const closed = this.zoneLocked(info.zoneOf[s.row * info.width + s.col]!);
      this.label(`s-${s.id}`, n ? `${n}. ${s.name}` : s.name, below, used, closed ? 0.45 : 1, true);
    }

    // The name of every region (with its levels), written over the middle of its land.
    const { width: vw, height: vh } = this.app.screen;
    for (const z of info.zones) {
      const at = this.regionAt.get(z.id);
      if (!at) continue;
      const pos = this.camera.toScreen(at);
      if (pos.x < -80 || pos.y < -20 || pos.x > vw + 80 || pos.y > vh + 20) continue;
      const text = `${z.name.toUpperCase()}  ${z.minLevel}-${z.maxLevel}`;
      this.label(
        `z-${z.id}`,
        text,
        { x: pos.x, y: pos.y - 6 },
        used,
        this.zoneLocked(z.id) ? 0.9 : 0.5,
      );
    }

    const p = this.party;
    if (p) {
      const c = hexCenter(p.pos.col, p.pos.row);
      const bob = Math.sin(this.time / 300) * 2;
      const y = c.y - 14 + bob;
      m.poly([c.x, c.y - 4, c.x - 5, y, c.x + 5, y])
        .fill(0x4aa0f2)
        .stroke({ width: 1, color: 0x0a2a4a });
      m.circle(c.x, y - 3, 5)
        .fill(0x7ac0ff)
        .stroke({ width: 1, color: 0x0a2a4a });
    }

    for (const [key, t] of this.labels) {
      if (!used.has(key)) {
        t.destroy();
        this.labels.delete(key);
      }
    }
  }
}

function tint(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * k));
  const b = Math.min(255, Math.round((color & 255) * k));
  return (r << 16) | (g << 8) | b;
}
