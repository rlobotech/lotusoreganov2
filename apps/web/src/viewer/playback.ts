import type { CombatEvent } from '@game/engine';
import { buildTimeline, eventDuration, type ViewState } from './state.ts';

export type PlaybackListener = () => void;

/**
 * Plays a combat log. `index` points at the step currently playing (or about to play);
 * `state` is the world before that step, and `progress` how far (0..1) the step has played.
 * Everything is derived from the log, so scrubbing in any direction is exact.
 */
export class Playback {
  readonly steps: CombatEvent[];
  readonly states: ViewState[];
  readonly turnMarks: number[];
  readonly roundMarks: number[];
  index = 0;
  elapsed = 0;
  playing = false;
  speed = 1;
  private listeners = new Set<PlaybackListener>();

  constructor(events: CombatEvent[]) {
    const { steps, states } = buildTimeline(events);
    this.steps = steps;
    this.states = states;
    this.turnMarks = steps.flatMap((e, i) => (e.t === 'turn' ? [i] : []));
    this.roundMarks = steps.flatMap((e, i) => (e.t === 'round' ? [i] : []));
  }

  get length(): number {
    return this.steps.length;
  }
  get atEnd(): boolean {
    return this.index >= this.steps.length;
  }
  /** World before the current step. */
  get state(): ViewState {
    return this.states[Math.min(this.index, this.states.length - 1)]!;
  }
  get event(): CombatEvent | null {
    return this.steps[this.index] ?? null;
  }
  get progress(): number {
    const e = this.event;
    if (!e) return 1;
    const d = eventDuration(e);
    return d > 0 ? Math.min(1, this.elapsed / d) : 1;
  }
  get round(): number {
    return this.state.round;
  }
  get totalRounds(): number {
    return this.roundMarks.length;
  }

  subscribe(fn: PlaybackListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }

  /** Advance by real time. Called every frame by the scene. */
  tick(dtMs: number): void {
    if (!this.playing) return;
    this.elapsed += dtMs * this.speed;
    let changed = false;
    while (this.index < this.steps.length) {
      const d = eventDuration(this.steps[this.index]!);
      if (this.elapsed < d) break;
      this.elapsed -= d;
      this.index++;
      changed = true;
    }
    if (this.index >= this.steps.length) {
      this.index = this.steps.length;
      this.elapsed = 0;
      this.playing = false;
      changed = true;
    }
    if (changed) this.emit();
  }

  play(): void {
    if (this.atEnd) this.seek(0);
    this.playing = true;
    this.emit();
  }
  pause(): void {
    this.playing = false;
    this.emit();
  }
  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }
  setSpeed(speed: number): void {
    this.speed = speed;
    this.emit();
  }

  /** Jump to the start of step `i` (0..length). */
  seek(i: number): void {
    this.index = Math.max(0, Math.min(this.steps.length, Math.round(i)));
    this.elapsed = 0;
    this.emit();
  }

  nextTurn(): void {
    const next = this.turnMarks.find((m) => m > this.index);
    this.seek(next ?? this.steps.length);
  }
  prevTurn(): void {
    const prev = [...this.turnMarks].reverse().find((m) => m < this.index);
    this.seek(prev ?? 0);
  }
  seekRound(round: number): void {
    const mark = this.roundMarks[round - 1];
    if (mark !== undefined) this.seek(mark);
  }
  end(): void {
    this.playing = false;
    this.seek(this.steps.length);
  }
}
