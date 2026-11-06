import { isPassable, siteAt } from './hex.ts';
import { MONSTERS } from './monsters.ts';
import type { Objective, PartyState, QuestDef, QuestProgress, WorldDef, ZoneDef } from './types.ts';

export const MAX_ACTIVE_QUESTS = 5;

/** Zones where a monster kind can be met (and that are open to the party). */
export function zonesWithMonster(world: WorldDef, template: string, cleared: readonly string[]) {
  return Object.values(world.zones).filter(
    (z: ZoneDef) =>
      (!z.unlockedBy || cleared.includes(z.unlockedBy)) &&
      z.encounters.some((e) => e.monsters.some((m) => m.template === template)),
  );
}

export function objectiveTarget(o: Objective): number {
  return o.type === 'kill' ? o.count : 1;
}

export function activeQuest(p: PartyState, questId: string): QuestProgress | undefined {
  return p.quests.active.find((q) => q.id === questId);
}

/** Index of the first unfinished objective, or -1 when the quest is done. */
export function currentObjectiveIndex(def: QuestDef, prog: QuestProgress): number {
  return def.objectives.findIndex((o, i) => (prog.progress[i] ?? 0) < objectiveTarget(o));
}

export function isQuestComplete(def: QuestDef, prog: QuestProgress): boolean {
  return currentObjectiveIndex(def, prog) === -1;
}

export function newProgress(def: QuestDef): QuestProgress {
  return { id: def.id, progress: def.objectives.map(() => 0) };
}

// ---------- recording progress ----------

/** Kills count towards every active quest that asks for that monster, even if not first in line. */
export function recordKills(p: PartyState, world: WorldDef, kills: Record<string, number>) {
  for (const prog of p.quests.active) {
    const def = world.quests[prog.id];
    if (!def) continue;
    def.objectives.forEach((o, i) => {
      if (o.type === 'kill' && kills[o.template]) {
        prog.progress[i] = Math.min(o.count, (prog.progress[i] ?? 0) + kills[o.template]!);
      }
    });
  }
}

/** A visit or clear only counts once the earlier objectives are done, so order matters. */
function recordSite(p: PartyState, world: WorldDef, type: 'visit' | 'clear', siteId: string) {
  for (const prog of p.quests.active) {
    const def = world.quests[prog.id];
    if (!def) continue;
    const i = currentObjectiveIndex(def, prog);
    const o = def.objectives[i];
    if (o && o.type === type && o.siteId === siteId) prog.progress[i] = 1;
  }
}

export const recordVisit = (p: PartyState, world: WorldDef, siteId: string) =>
  recordSite(p, world, 'visit', siteId);
export const recordClear = (p: PartyState, world: WorldDef, siteId: string) =>
  recordSite(p, world, 'clear', siteId);

// ---------- availability ----------

export type QuestStatus = 'available' | 'active' | 'completed' | 'locked';

export interface QuestAvailability {
  status: QuestStatus;
  /** Why a locked quest cannot be taken yet. */
  reason?: string;
}

/** Whether a quest's places and monsters are reachable by the party right now. */
function reachable(p: PartyState, world: WorldDef, def: QuestDef): boolean {
  return def.objectives.every((o) => {
    if (o.type === 'kill') {
      if (!MONSTERS[o.template]) return false;
      return zonesWithMonster(world, o.template, p.cleared).length > 0;
    }
    const site = world.sites[o.siteId];
    return !!site && isPassable(world, site, p.cleared);
  });
}

export function questAvailability(
  p: PartyState,
  world: WorldDef,
  def: QuestDef,
): QuestAvailability {
  if (activeQuest(p, def.id)) return { status: 'active' };
  if (p.quests.completed.includes(def.id) && !def.repeatable) return { status: 'completed' };
  if (p.level < def.minLevel) return { status: 'locked', reason: `Reach level ${def.minLevel}` };
  const missing = (def.requires ?? []).find((id) => !p.quests.completed.includes(id));
  if (missing) {
    return {
      status: 'locked',
      reason: `Complete "${world.quests[missing]?.name ?? missing}" first`,
    };
  }
  if (!reachable(p, world, def))
    return { status: 'locked', reason: 'The way there is still closed' };
  return { status: 'available' };
}

/** The place an active quest is currently sending the party to, if its objective is a place. */
export function questTargetSite(world: WorldDef, p: PartyState, questId: string): string | null {
  const def = world.quests[questId];
  const prog = activeQuest(p, questId);
  if (!def || !prog) return null;
  const o = def.objectives[currentObjectiveIndex(def, prog)];
  return o && o.type !== 'kill' ? o.siteId : null;
}

/** Is the party already standing on this site (used to finish a visit right away)? */
export function standingAt(world: WorldDef, p: PartyState, siteId: string): boolean {
  return siteAt(world, p.pos)?.id === siteId;
}
