<script lang="ts">
  import type { MemberInfo, SkillInfo } from '@game/shared';
  import {
    badgePoint,
    missingFor,
    nodeIn,
    RING,
    SCHOOL_COLORS,
    SCHOOL_LABELS,
    SECTOR,
    sectorAngle,
    sectorBox,
    WHEEL,
    wheelLayout,
    type Placed,
    type School,
  } from './wheelLayout.ts';

  let {
    skills,
    member,
    level,
    onCarry,
    onPutDown,
    error = '',
  }: {
    skills: SkillInfo[];
    member: MemberInfo;
    /** The party's level (some skills ask for a character level). */
    level: number;
    onCarry: (id: string) => void;
    onPutDown: (id: string) => void;
    error?: string;
  } = $props();

  const layout = $derived(wheelLayout(skills));
  const byId = $derived(new Map(skills.map((s) => [s.id, s])));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const schoolLevel = (school: string) => member.schools.find((s) => s.id === school)?.level ?? 0;

  let selected = $state<string | null>(null);
  let box = $state(sectorBox(null));
  let zoomedSchool = $state<School | null>(null);

  const info = $derived(selected ? byId.get(selected) : undefined);
  const known = (id: string) => member.skills.includes(id);
  const missing = (s: SkillInfo) =>
    missingFor(s, nameOf, { level, skillLevels: member.skillLevels, schoolLevel });

  type Status = 'known' | 'ready' | 'book' | 'locked';
  /** Learned, ready to learn by itself (requirements met), a starting skill (a class or a book), or locked. */
  function statusOf(s: SkillInfo): Status {
    if (known(s.id)) return 'known';
    const hasReq =
      !!s.requires.charLevel ||
      Object.keys(s.requires.schools ?? {}).length > 0 ||
      Object.keys(s.requires.skills ?? {}).length > 0;
    if (!hasReq || s.bookOnly) return 'book';
    return missing(s).length === 0 ? 'ready' : 'locked';
  }

  const colorOf = (school: School) => SCHOOL_COLORS[school];
  const p2 = (n: number) => Math.round(n * 10) / 10;

  /** The wedge of a sector between the hub and the rim. */
  function wedge(school: School): string {
    const a0 = sectorAngle(school) - (SECTOR * Math.PI) / 360;
    const a1 = sectorAngle(school) + (SECTOR * Math.PI) / 360;
    const pt = (a: number, r: number) => `${p2(Math.cos(a) * r)} ${p2(Math.sin(a) * r)}`;
    return `M ${pt(a0, WHEEL.hub)} L ${pt(a0, WHEEL.rim)} A ${WHEEL.rim} ${WHEEL.rim} 0 0 1 ${pt(a1, WHEEL.rim)} L ${pt(a1, WHEEL.hub)} A ${WHEEL.hub} ${WHEEL.hub} 0 0 0 ${pt(a0, WHEEL.hub)} Z`;
  }

  /** The node a line to `id` ends on, in the sector of the skill it starts from. */
  function end(id: string, school: School): Placed | undefined {
    return nodeIn(layout, id, school);
  }

  // ---------- zoom and pan ----------

  let svg: SVGSVGElement | undefined = $state();
  const MIN_W = 150;
  const MAX_W = WHEEL.size * 2;

  function zoomBy(factor: number, cx = box.x + box.w / 2, cy = box.y + box.h / 2) {
    const w = Math.min(MAX_W, Math.max(MIN_W, box.w * factor));
    const k = w / box.w;
    box = { x: cx - (cx - box.x) * k, y: cy - (cy - box.y) * k, w, h: box.h * k };
    zoomedSchool = null;
  }
  function whole() {
    zoomedSchool = null;
    box = sectorBox(null);
  }
  function focus(school: School) {
    zoomedSchool = school;
    box = sectorBox(school);
  }

  const pts = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  let moved = false;

  function toWorld(e: { clientX: number; clientY: number }) {
    const r = svg!.getBoundingClientRect();
    return {
      x: box.x + ((e.clientX - r.left) / r.width) * box.w,
      y: box.y + ((e.clientY - r.top) / r.height) * box.h,
    };
  }
  const start = new Map<number, { x: number; y: number }>();
  function down(e: PointerEvent) {
    // The pointer is captured only once it moves (a drag): capturing at once would send the click
    // of a tap to the wheel instead of the skill or school that was tapped.
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }
  function move(e: PointerEvent) {
    const prev = pts.get(e.pointerId);
    if (!prev || !svg) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = toWorld({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      if (pinch > 0) zoomBy(pinch / d, mid.x, mid.y);
      pinch = d;
      moved = true;
      return;
    }
    const from = start.get(e.pointerId)!;
    if (!moved && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 5) return;
    if (!moved) svg.setPointerCapture(e.pointerId);
    moved = true;
    const r = svg.getBoundingClientRect();
    box = {
      ...box,
      x: box.x - ((e.clientX - prev.x) / r.width) * box.w,
      y: box.y - ((e.clientY - prev.y) / r.height) * box.h,
    };
  }
  function up(e: PointerEvent) {
    pts.delete(e.pointerId);
    start.delete(e.pointerId);
    if (pts.size < 2) pinch = 0;
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    const at = toWorld(e);
    zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15, at.x, at.y);
  }
  function pick(id: string) {
    if (!moved) selected = selected === id ? null : id;
  }

  // Names are drawn only when they can be read: zoomed in, or for the skill that is selected.
  const showNames = $derived(box.w < 440);
  const MEASURE: Record<string, string> = {
    damage: 'the damage it causes',
    healing: 'the health it restores',
    uses: 'how often it is used',
  };
</script>

<div class="wheel">
  <svg
    bind:this={svg}
    viewBox="{box.x} {box.y} {box.w} {box.h}"
    role="group"
    aria-label="Skill wheel"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onwheel={wheel}
  >
    <!-- sectors -->
    {#each RING as school (school)}
      <path
        d={wedge(school)}
        fill={colorOf(school)}
        fill-opacity={zoomedSchool === school ? 0.2 : 0.09}
        stroke="#0d0b10"
        stroke-width="3"
      />
    {/each}
    <circle r={WHEEL.hub} fill="#1a1722" stroke="#c9a85a" stroke-width="3" />
    <text class="hub" y="-6">SKILL</text>
    <text class="hub" y="16">TREE</text>

    <!-- lines between skills -->
    {#each layout.edges as e (e.from + e.to)}
      {@const a = end(e.from, e.school)}
      {@const b = end(e.to, e.school)}
      {#if a && b}
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={colorOf(e.school)}
          stroke-width={known(e.to) ? 3 : 1.6}
          stroke-opacity={known(e.to) ? 0.9 : 0.4}
          stroke-dasharray={e.cross ? '6 5' : undefined}
        />
      {/if}
    {/each}
    <!-- a dual skill is joined to its copy in the other school -->
    {#each skills.filter((s) => s.schools.length === 2) as s (s.id)}
      {@const a = layout.nodes.find((n) => n.id === s.id && n.home)}
      {@const b = layout.nodes.find((n) => n.id === s.id && !n.home)}
      {#if a && b}
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="#f0b050"
          stroke-width="2"
          stroke-dasharray="4 5"
          stroke-opacity="0.7"
        />
      {/if}
    {/each}

    <!-- skills -->
    {#each layout.nodes as n (n.id + n.school)}
      {@const s = byId.get(n.id)}
      {#if s}
        {@const st = statusOf(s)}
        {@const lv = member.skillLevels[n.id]?.level}
        <g
          class="node"
          class:locked={st === 'locked'}
          class:ghost={!n.home}
          transform="translate({n.x} {n.y})"
          role="button"
          tabindex="0"
          aria-label="{s.name}, {st === 'known' ? `level ${lv}` : st}"
          onclick={() => pick(n.id)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && pick(n.id)}
        >
          {#if member.equipped.includes(n.id)}
            <circle r="21" fill="none" stroke="#fff" stroke-width="2.5" />
          {/if}
          {#if selected === n.id}
            <circle r="25" fill="none" stroke="#f2d04a" stroke-width="3" />
          {/if}
          {#if s.passive}
            <rect
              x="-13"
              y="-13"
              width="26"
              height="26"
              rx="5"
              transform="rotate(45)"
              fill={st === 'known' ? colorOf(n.school) : '#16131c'}
              stroke={colorOf(n.school)}
              stroke-width="2.5"
              stroke-dasharray={st === 'book' ? '4 3' : undefined}
            />
          {:else}
            <circle
              r="16"
              fill={st === 'known' ? colorOf(n.school) : '#16131c'}
              stroke={colorOf(n.school)}
              stroke-width="2.5"
              stroke-dasharray={st === 'book' ? '4 3' : undefined}
            />
          {/if}
          {#if st === 'known'}
            <text class="lv" y="5">{lv}</text>
          {:else if st === 'ready'}
            <text class="lv ready" y="5">+</text>
          {/if}
          {#if member.skillIssues[n.id]}
            <circle cx="14" cy="-14" r="5" fill="#e05050" />
          {/if}
          {#if showNames || selected === n.id || member.equipped.includes(n.id)}
            <text class="name" y="34">{s.name}{s.proposed ? ' †' : ''}</text>
          {/if}
        </g>
      {/if}
    {/each}

    <!-- school names and levels -->
    {#each RING as school (school)}
      {@const b = badgePoint(school)}
      <g
        class="badge"
        transform="translate({b.x} {b.y})"
        role="button"
        tabindex="0"
        aria-label="{SCHOOL_LABELS[school]}, level {schoolLevel(school)}. Zoom to this school"
        onclick={() => (zoomedSchool === school ? whole() : focus(school))}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && focus(school)}
      >
        <circle r="26" fill="#1a1722" stroke={colorOf(school)} stroke-width="4" />
        <text class="lvl" y="6">{schoolLevel(school)}</text>
        <text class="school" fill={colorOf(school)} y="-36">{SCHOOL_LABELS[school]}</text>
      </g>
    {/each}
  </svg>

  <div class="zoom">
    <button onclick={() => zoomBy(1 / 1.4)} aria-label="Zoom in">+</button>
    <button onclick={() => zoomBy(1.4)} aria-label="Zoom out">&minus;</button>
    <button onclick={whole} aria-label="Show the whole wheel" title="Whole wheel">All</button>
  </div>
</div>

<div class="legend muted small">
  <span><i class="dot full"></i> learned (level)</span>
  <span><i class="dot ring"></i> carried</span>
  <span><i class="dot plus"></i> ready to learn (+)</span>
  <span><i class="dot dash"></i> from a class or a book</span>
  <span><i class="dot line"></i> dual skill or other school</span>
  <span>◆ passive · † proposed name</span>
</div>

<div class="detail card">
  {#if info}
    {@const st = statusOf(info)}
    {@const lv = member.skillLevels[info.id]}
    <div class="row">
      <h4>{info.name}{info.proposed ? ' †' : ''}</h4>
      <span class="muted small"
        >{info.schools.map((s) => SCHOOL_LABELS[s as School] ?? s).join(' + ')}</span
      >
    </div>
    {#if st === 'known' && lv}
      <div class="small">
        Level {lv.level}{lv.next === null ? ' (max)' : ` · ${lv.xp}/${lv.next} to the next`}
      </div>
    {/if}
    <div class="muted small">
      {info.passive ? 'Passive: always on, takes no slot. ' : ''}Levels up with {MEASURE[
        info.measure
      ] ?? info.measure}.
      {#if !info.usable && !info.passive}Not usable yet: it needs a feature the game does not have.{/if}
    </div>
    {#if st !== 'known'}
      {#if st === 'book'}
        <div class="small">A starting skill: it comes with a class or from a skill book.</div>
      {/if}
      {#each missing(info) as need (need)}
        <div class="small bad">✗ {need}</div>
      {:else}
        {#if st === 'ready'}<div class="small good">
            ✓ Requirements met: it is learned on its own.
          </div>{/if}
      {/each}
    {:else if info.requires.charLevel || Object.keys(info.requires.schools ?? {}).length || Object.keys(info.requires.skills ?? {}).length}
      <div class="muted small">Requirements met.</div>
    {/if}
    {#if member.skillIssues[info.id]}
      <div class="small bad">Cannot be used now: {member.skillIssues[info.id]}</div>
    {/if}
    {#if member.mine && st === 'known' && info.usable && !info.passive && info.schools.length}
      {#if member.equipped.includes(info.id)}
        <button onclick={() => onPutDown(info.id)}>Put down</button>
      {:else}
        <button
          disabled={member.equipped.length >= member.equipLimit}
          onclick={() => onCarry(info.id)}>Carry</button
        >
        {#if member.equipped.length >= member.equipLimit}
          <span class="muted small">Only {member.equipLimit} can be carried at this level.</span>
        {/if}
      {/if}
    {/if}
  {:else}
    <div class="muted small">
      Tap a skill for details. Tap a school's circle to zoom to it. Drag to move, pinch or use + and
      − to zoom.
    </div>
  {/if}
  {#if error}<p class="bad small">{error}</p>{/if}
</div>

<style>
  .wheel {
    position: relative;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
  }
  svg {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    display: block;
    touch-action: none;
    background: radial-gradient(circle, #1b1824 0%, #0d0b10 70%);
    border: 1px solid var(--line);
    border-radius: 8px;
    cursor: grab;
    user-select: none;
  }
  .hub {
    fill: #e0c878;
    font-size: 15px;
    font-weight: bold;
    text-anchor: middle;
    letter-spacing: 1px;
  }
  .node {
    cursor: pointer;
  }
  .node.locked {
    opacity: 0.55;
  }
  .node.ghost {
    opacity: 0.75;
  }
  .node:focus-visible circle,
  .badge:focus-visible circle {
    stroke: #fff;
  }
  .lv {
    fill: #0d0b10;
    font-size: 15px;
    font-weight: bold;
    text-anchor: middle;
    pointer-events: none;
  }
  .lv.ready {
    fill: #f2d04a;
    font-size: 20px;
  }
  .name {
    fill: #f4ecd8;
    font-size: 12px;
    text-anchor: middle;
    paint-order: stroke;
    stroke: #0d0b10;
    stroke-width: 3px;
    pointer-events: none;
  }
  .badge {
    cursor: pointer;
  }
  .lvl {
    fill: #f4ecd8;
    font-size: 20px;
    font-weight: bold;
    text-anchor: middle;
    pointer-events: none;
  }
  .school {
    font-size: 15px;
    font-weight: bold;
    text-anchor: middle;
    paint-order: stroke;
    stroke: #0d0b10;
    stroke-width: 3px;
    pointer-events: none;
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
    min-width: 44px;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 8px 0;
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid #c9a85a;
    margin-right: 4px;
    vertical-align: -1px;
  }
  .dot.full {
    background: #c9a85a;
  }
  .dot.ring {
    border-color: #fff;
  }
  .dot.plus {
    border-color: #f2d04a;
  }
  .dot.dash {
    border-style: dashed;
  }
  .dot.line {
    border-radius: 0;
    height: 0;
    border-width: 1px 0 0;
    border-style: dashed;
    width: 14px;
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  h4 {
    margin: 0;
  }
  .detail button {
    align-self: flex-start;
  }
</style>
